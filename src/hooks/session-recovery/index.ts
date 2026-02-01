/**
 * 会话恢复钩子
 * 
 * ## 功能概述
 * 在系统崩溃或意外中断后，自动恢复会话状态和上下文。
 * 
 * ## 核心功能
 * - 会话状态持久化：自动保存消息和部件到文件系统
 * - 崩溃检测和恢复：识别并修复各类API错误
 * - 上下文重建：从持久化存储恢复完整会话状态
 * - 任务队列恢复：恢复未完成的工具调用
 * 
 * ## 恢复机制
 * 1. 检测未正常关闭的会话（通过错误类型识别）
 * 2. 加载持久化的状态数据（从 ~/.opencode/storage/）
 * 3. 重建代理上下文（修复消息结构）
 * 4. 恢复未完成的任务（注入占位符或工具结果）
 * 
 * ## 状态序列化
 * 使用JSON格式存储：
 * - 会话ID和元数据（message/*.json）
 * - 当前任务状态（part/*.json）
 * - 代理历史记录（按时间排序）
 * - 消息部件快照（text/tool/thinking）
 * 
 * ## 支持的错误类型
 * - tool_result_missing: 工具调用缺少结果
 * - thinking_block_order: thinking块顺序错误
 * - thinking_disabled_violation: 禁用thinking时包含thinking块
 */
import type { PluginInput } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import type { ExperimentalConfig } from "../../config"
import {
  findEmptyMessages,
  findEmptyMessageByIndex,
  findMessageByIndexNeedingThinking,
  findMessagesWithEmptyTextParts,
  findMessagesWithOrphanThinking,
  findMessagesWithThinkingBlocks,
  findMessagesWithThinkingOnly,
  injectTextPart,
  prependThinkingPart,
  readParts,
  replaceEmptyTextParts,
  stripThinkingParts,
} from "./storage"
import type { MessageData, ResumeConfig } from "./types"

/**
 * 会话恢复选项
 */
export interface SessionRecoveryOptions {
  experimental?: ExperimentalConfig
}

type Client = ReturnType<typeof createOpencodeClient>

/**
 * 可恢复的错误类型
 * - tool_result_missing: 工具调用后缺少tool_result
 * - thinking_block_order: thinking块必须在消息开头
 * - thinking_disabled_violation: 模型不支持thinking但包含thinking块
 * - null: 不可恢复的错误
 */
type RecoveryErrorType =
  | "tool_result_missing"
  | "thinking_block_order"
  | "thinking_disabled_violation"
  | null

interface MessageInfo {
  id?: string
  role?: string
  sessionID?: string
  parentID?: string
  error?: unknown
}

interface ToolUsePart {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

interface MessagePart {
  type: string
  id?: string
  text?: string
  thinking?: string
  name?: string
  input?: Record<string, unknown>
}

/**
 * 恢复会话时发送的占位符文本
 * 用于通知代理会话已恢复，可以继续之前的任务
 */
const RECOVERY_RESUME_TEXT = "[session recovered - continuing previous task]"

/**
 * 查找最后一条用户消息
 * 用于提取恢复会话所需的agent和model配置
 * 
 * @param messages - 消息列表
 * @returns 最后一条用户消息，如果没有则返回undefined
 */
function findLastUserMessage(messages: MessageData[]): MessageData | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === "user") {
      return messages[i]
    }
  }
  return undefined
}

/**
 * 从用户消息中提取恢复配置
 * 保留原始的agent和model设置，确保恢复后的会话使用相同的配置
 * 
 * @param userMessage - 用户消息
 * @param sessionID - 会话ID
 * @returns 恢复配置对象
 */
function extractResumeConfig(userMessage: MessageData | undefined, sessionID: string): ResumeConfig {
  return {
    sessionID,
    agent: userMessage?.info?.agent,
    model: userMessage?.info?.model,
  }
}

/**
 * 恢复会话并发送继续提示
 * 在修复错误后，自动发送一条消息让代理继续之前的任务
 * 
 * @param client - OpenCode客户端
 * @param config - 恢复配置
 * @returns 是否成功恢复
 */
async function resumeSession(client: Client, config: ResumeConfig): Promise<boolean> {
  try {
    await client.session.prompt({
      path: { id: config.sessionID },
      body: {
        parts: [{ type: "text", text: RECOVERY_RESUME_TEXT }],
        agent: config.agent,
        model: config.model,
      },
    })
    return true
  } catch {
    return false
  }
}

/**
 * 从错误对象中提取错误消息字符串
 * 尝试多个路径查找错误消息，支持各种错误对象结构
 * 
 * @param error - 错误对象
 * @returns 小写的错误消息字符串
 */
function getErrorMessage(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error.toLowerCase()

  const errorObj = error as Record<string, unknown>
  const paths = [
    errorObj.data,
    errorObj.error,
    errorObj,
    (errorObj.data as Record<string, unknown>)?.error,
  ]

  for (const obj of paths) {
    if (obj && typeof obj === "object") {
      const msg = (obj as Record<string, unknown>).message
      if (typeof msg === "string" && msg.length > 0) {
        return msg.toLowerCase()
      }
    }
  }

  try {
    return JSON.stringify(error).toLowerCase()
  } catch {
    return ""
  }
}

/**
 * 从错误消息中提取消息索引
 * 解析类似 "messages.5" 的错误消息，提取索引号
 * 
 * @param error - 错误对象
 * @returns 消息索引，如果未找到则返回null
 */
function extractMessageIndex(error: unknown): number | null {
  const message = getErrorMessage(error)
  const match = message.match(/messages\.(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * 检测错误类型
 * 通过错误消息中的关键词识别可恢复的错误类型
 * 
 * 检测顺序很重要：
 * 1. thinking_block_order - 必须先检测，因为Anthropic的thinking错误消息
 *    包含"tool_use"和"tool_result"关键词（在文档URL中），会误匹配tool_result_missing
 * 2. thinking_disabled_violation - 检测模型不支持thinking的情况
 * 3. tool_result_missing - 最后检测工具结果缺失
 * 
 * @param error - 错误对象
 * @returns 错误类型，如果不可恢复则返回null
 */
export function detectErrorType(error: unknown): RecoveryErrorType {
  const message = getErrorMessage(error)

  // IMPORTANT: Check thinking_block_order BEFORE tool_result_missing
  // because Anthropic's extended thinking error messages contain "tool_use" and "tool_result"
  // in the documentation URL, which would incorrectly match tool_result_missing
  if (
    message.includes("thinking") &&
    (message.includes("first block") ||
      message.includes("must start with") ||
      message.includes("preceeding") ||
      message.includes("final block") ||
      message.includes("cannot be thinking") ||
      (message.includes("expected") && message.includes("found")))
  ) {
    return "thinking_block_order"
  }

  if (message.includes("thinking is disabled") && message.includes("cannot contain")) {
    return "thinking_disabled_violation"
  }

  if (message.includes("tool_use") && message.includes("tool_result")) {
    return "tool_result_missing"
  }

  return null
}

/**
 * 从消息部件中提取所有工具调用ID
 * 
 * @param parts - 消息部件列表
 * @returns 工具调用ID数组
 */
function extractToolUseIds(parts: MessagePart[]): string[] {
  return parts.filter((p): p is ToolUsePart => p.type === "tool_use" && !!p.id).map((p) => p.id)
}

/**
 * 恢复缺失的工具结果
 * 
 * 当代理调用工具但缺少tool_result时，注入取消消息作为结果
 * 这允许会话继续，而不是卡在等待工具结果的状态
 * 
 * 恢复流程：
 * 1. 从失败的消息中提取所有tool_use的ID
 * 2. 为每个ID创建一个tool_result，内容为"用户取消操作"
 * 3. 发送这些tool_result到会话
 * 
 * @param client - OpenCode客户端
 * @param sessionID - 会话ID
 * @param failedAssistantMsg - 失败的助手消息
 * @returns 是否成功恢复
 */
async function recoverToolResultMissing(
  client: Client,
  sessionID: string,
  failedAssistantMsg: MessageData
): Promise<boolean> {
  // Try API parts first, fallback to filesystem if empty
  let parts = failedAssistantMsg.parts || []
  if (parts.length === 0 && failedAssistantMsg.info?.id) {
    const storedParts = readParts(failedAssistantMsg.info.id)
    parts = storedParts.map((p) => ({
      type: p.type === "tool" ? "tool_use" : p.type,
      id: "callID" in p ? (p as { callID?: string }).callID : p.id,
      name: "tool" in p ? (p as { tool?: string }).tool : undefined,
      input: "state" in p ? (p as { state?: { input?: Record<string, unknown> } }).state?.input : undefined,
    }))
  }
  const toolUseIds = extractToolUseIds(parts)

  if (toolUseIds.length === 0) {
    return false
  }

  const toolResultParts = toolUseIds.map((id) => ({
    type: "tool_result" as const,
    tool_use_id: id,
    content: "Operation cancelled by user (ESC pressed)",
  }))

  try {
    await client.session.prompt({
      path: { id: sessionID },
      // @ts-expect-error - SDK types may not include tool_result parts
      body: { parts: toolResultParts },
    })

    return true
  } catch {
    return false
  }
}

/**
 * 恢复thinking块顺序错误
 * 
 * Anthropic API要求thinking块必须在消息的第一个位置
 * 如果thinking块不在开头，会导致API错误
 * 
 * 恢复策略：
 * 1. 尝试从错误消息中提取目标消息索引
 * 2. 如果找到索引，在该消息开头添加thinking块
 * 3. 如果没有索引，查找所有包含孤立thinking的消息并修复
 * 
 * @param _client - OpenCode客户端（未使用）
 * @param sessionID - 会话ID
 * @param _failedAssistantMsg - 失败的助手消息（未使用）
 * @param _directory - 目录路径（未使用）
 * @param error - 错误对象
 * @returns 是否成功恢复
 */
async function recoverThinkingBlockOrder(
  _client: Client,
  sessionID: string,
  _failedAssistantMsg: MessageData,
  _directory: string,
  error: unknown
): Promise<boolean> {
  const targetIndex = extractMessageIndex(error)
  if (targetIndex !== null) {
    const targetMessageID = findMessageByIndexNeedingThinking(sessionID, targetIndex)
    if (targetMessageID) {
      return prependThinkingPart(sessionID, targetMessageID)
    }
  }

  const orphanMessages = findMessagesWithOrphanThinking(sessionID)

  if (orphanMessages.length === 0) {
    return false
  }

  let anySuccess = false
  for (const messageID of orphanMessages) {
    if (prependThinkingPart(sessionID, messageID)) {
      anySuccess = true
    }
  }

  return anySuccess
}

/**
 * 恢复thinking禁用违规错误
 * 
 * 某些模型不支持thinking功能，如果消息中包含thinking块会导致错误
 * 此函数移除所有thinking块，使消息符合模型要求
 * 
 * @param _client - OpenCode客户端（未使用）
 * @param sessionID - 会话ID
 * @param _failedAssistantMsg - 失败的助手消息（未使用）
 * @returns 是否成功恢复
 */
async function recoverThinkingDisabledViolation(
  _client: Client,
  sessionID: string,
  _failedAssistantMsg: MessageData
): Promise<boolean> {
  const messagesWithThinking = findMessagesWithThinkingBlocks(sessionID)

  if (messagesWithThinking.length === 0) {
    return false
  }

  let anySuccess = false
  for (const messageID of messagesWithThinking) {
    if (stripThinkingParts(messageID)) {
      anySuccess = true
    }
  }

  return anySuccess
}

/**
 * 空消息占位符文本
 * 用于填充空的文本部件，避免API拒绝空内容
 */
const PLACEHOLDER_TEXT = "[user interrupted]"

/**
 * 恢复空内容消息错误
 * 
 * API不接受完全空的消息或只包含thinking的消息
 * 此函数为空消息注入占位符文本，使其符合API要求
 * 
 * 恢复策略（按优先级）：
 * 1. 替换所有空文本部件
 * 2. 为只有thinking的消息注入文本部件
 * 3. 如果错误指定了索引，优先修复该消息
 * 4. 修复失败消息本身
 * 5. 修复所有找到的空消息
 * 
 * @param _client - OpenCode客户端（未使用）
 * @param sessionID - 会话ID
 * @param failedAssistantMsg - 失败的助手消息
 * @param _directory - 目录路径（未使用）
 * @param error - 错误对象
 * @returns 是否成功恢复
 */
async function recoverEmptyContentMessage(
  _client: Client,
  sessionID: string,
  failedAssistantMsg: MessageData,
  _directory: string,
  error: unknown
): Promise<boolean> {
  const targetIndex = extractMessageIndex(error)
  const failedID = failedAssistantMsg.info?.id
  let anySuccess = false

  const messagesWithEmptyText = findMessagesWithEmptyTextParts(sessionID)
  for (const messageID of messagesWithEmptyText) {
    if (replaceEmptyTextParts(messageID, PLACEHOLDER_TEXT)) {
      anySuccess = true
    }
  }

  const thinkingOnlyIDs = findMessagesWithThinkingOnly(sessionID)
  for (const messageID of thinkingOnlyIDs) {
    if (injectTextPart(sessionID, messageID, PLACEHOLDER_TEXT)) {
      anySuccess = true
    }
  }

  if (targetIndex !== null) {
    const targetMessageID = findEmptyMessageByIndex(sessionID, targetIndex)
    if (targetMessageID) {
      if (replaceEmptyTextParts(targetMessageID, PLACEHOLDER_TEXT)) {
        return true
      }
      if (injectTextPart(sessionID, targetMessageID, PLACEHOLDER_TEXT)) {
        return true
      }
    }
  }

  if (failedID) {
    if (replaceEmptyTextParts(failedID, PLACEHOLDER_TEXT)) {
      return true
    }
    if (injectTextPart(sessionID, failedID, PLACEHOLDER_TEXT)) {
      return true
    }
  }

  const emptyMessageIDs = findEmptyMessages(sessionID)
  for (const messageID of emptyMessageIDs) {
    if (replaceEmptyTextParts(messageID, PLACEHOLDER_TEXT)) {
      anySuccess = true
    }
    if (injectTextPart(sessionID, messageID, PLACEHOLDER_TEXT)) {
      anySuccess = true
    }
  }

  return anySuccess
}

// NOTE: fallbackRevertStrategy was removed (2025-12-08)
// Reason: Function was defined but never called - no error recovery paths used it.
// All error types have dedicated recovery functions (recoverToolResultMissing,
// recoverThinkingBlockOrder, recoverThinkingDisabledViolation, recoverEmptyContentMessage).

/**
 * 会话恢复钩子接口
 * 提供会话错误检测和自动恢复功能
 */
export interface SessionRecoveryHook {
  /** 处理会话恢复 - 检测错误类型并执行相应的恢复策略 */
  handleSessionRecovery: (info: MessageInfo) => Promise<boolean>
  /** 判断错误是否可恢复 */
  isRecoverableError: (error: unknown) => boolean
  /** 设置中止回调 - 在恢复开始前调用 */
  setOnAbortCallback: (callback: (sessionID: string) => void) => void
  /** 设置恢复完成回调 - 在恢复结束后调用（无论成功或失败） */
  setOnRecoveryCompleteCallback: (callback: (sessionID: string) => void) => void
}

/**
 * 创建会话恢复钩子
 * 
 * 此钩子监听会话错误，自动检测可恢复的错误类型并执行修复
 * 
 * 工作流程：
 * 1. 监听助手消息错误
 * 2. 检测错误类型（tool_result_missing/thinking_block_order/thinking_disabled_violation）
 * 3. 中止当前会话
 * 4. 从持久化存储加载消息和部件
 * 5. 执行相应的恢复策略
 * 6. 显示恢复提示
 * 7. 可选：自动恢复会话（experimental.auto_resume）
 * 
 * @param ctx - 插件上下文
 * @param options - 恢复选项
 * @returns 会话恢复钩子实例
 */
export function createSessionRecoveryHook(ctx: PluginInput, options?: SessionRecoveryOptions): SessionRecoveryHook {
  const processingErrors = new Set<string>()
  const experimental = options?.experimental
  let onAbortCallback: ((sessionID: string) => void) | null = null
  let onRecoveryCompleteCallback: ((sessionID: string) => void) | null = null

  const setOnAbortCallback = (callback: (sessionID: string) => void): void => {
    onAbortCallback = callback
  }

  const setOnRecoveryCompleteCallback = (callback: (sessionID: string) => void): void => {
    onRecoveryCompleteCallback = callback
  }

  const isRecoverableError = (error: unknown): boolean => {
    return detectErrorType(error) !== null
  }

  const handleSessionRecovery = async (info: MessageInfo): Promise<boolean> => {
    if (!info || info.role !== "assistant" || !info.error) return false

    const errorType = detectErrorType(info.error)
    if (!errorType) return false

    const sessionID = info.sessionID
    const assistantMsgID = info.id

    if (!sessionID || !assistantMsgID) return false
    if (processingErrors.has(assistantMsgID)) return false
    processingErrors.add(assistantMsgID)

    try {
      if (onAbortCallback) {
        onAbortCallback(sessionID)  // Mark recovering BEFORE abort
      }

      await ctx.client.session.abort({ path: { id: sessionID } }).catch(() => {})

      const messagesResp = await ctx.client.session.messages({
        path: { id: sessionID },
        query: { directory: ctx.directory },
      })
      const msgs = (messagesResp as { data?: MessageData[] }).data

      const failedMsg = msgs?.find((m) => m.info?.id === assistantMsgID)
      if (!failedMsg) {
        return false
      }

      const toastTitles: Record<RecoveryErrorType & string, string> = {
        tool_result_missing: "Tool Crash Recovery",
        thinking_block_order: "Thinking Block Recovery",
        thinking_disabled_violation: "Thinking Strip Recovery",
      }
      const toastMessages: Record<RecoveryErrorType & string, string> = {
        tool_result_missing: "Injecting cancelled tool results...",
        thinking_block_order: "Fixing message structure...",
        thinking_disabled_violation: "Stripping thinking blocks...",
      }

      await ctx.client.tui
        .showToast({
          body: {
            title: toastTitles[errorType],
            message: toastMessages[errorType],
            variant: "warning",
            duration: 3000,
          },
        })
        .catch(() => {})

      let success = false

      if (errorType === "tool_result_missing") {
        success = await recoverToolResultMissing(ctx.client, sessionID, failedMsg)
      } else if (errorType === "thinking_block_order") {
        success = await recoverThinkingBlockOrder(ctx.client, sessionID, failedMsg, ctx.directory, info.error)
        if (success && experimental?.auto_resume) {
          const lastUser = findLastUserMessage(msgs ?? [])
          const resumeConfig = extractResumeConfig(lastUser, sessionID)
          await resumeSession(ctx.client, resumeConfig)
        }
      } else if (errorType === "thinking_disabled_violation") {
        success = await recoverThinkingDisabledViolation(ctx.client, sessionID, failedMsg)
        if (success && experimental?.auto_resume) {
          const lastUser = findLastUserMessage(msgs ?? [])
          const resumeConfig = extractResumeConfig(lastUser, sessionID)
          await resumeSession(ctx.client, resumeConfig)
        }
      }

      return success
  } catch (err) {
    console.error("[session-recovery] Recovery failed:", err)
    return false
  } finally {
    processingErrors.delete(assistantMsgID)

    // Always notify recovery complete, regardless of success or failure
    if (sessionID && onRecoveryCompleteCallback) {
      onRecoveryCompleteCallback(sessionID)
    }
  }
  }

  return {
    handleSessionRecovery,
    isRecoverableError,
    setOnAbortCallback,
    setOnRecoveryCompleteCallback,
  }
}
