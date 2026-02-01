/**
 * 思考块验证钩子 (Thinking Block Validator Hook)
 * 
 * ## 触发时机
 * experimental.chat.messages.transform - 在消息发送到 Anthropic API 前执行
 * 
 * ## 功能概述
 * 主动验证和修复消息结构，防止 "Expected thinking/redacted_thinking but found tool_use" 错误。
 * 当使用扩展思考模式（Extended Thinking）时，Anthropic API 要求 assistant 消息必须以
 * thinking/reasoning 块开头，否则会拒绝请求。
 * 
 * ## 使用场景
 * - 使用 Claude 4 系列模型（Opus 4、Sonnet 4）
 * - 启用扩展思考模式（thinking/high 变体）
 * - Assistant 消息包含 tool_use 但缺少前置 thinking 块
 * 
 * ## 思考块格式要求
 * 
 * Anthropic API 对扩展思考模式的消息结构有严格要求：
 * 
 * ### 正确格式
 * ```
 * assistant: [
 *   { type: "thinking", thinking: "..." },  // 必须在最前面
 *   { type: "tool_use", ... },
 *   { type: "text", ... }
 * ]
 * ```
 * 
 * ### 错误格式（会被拒绝）
 * ```
 * assistant: [
 *   { type: "tool_use", ... },  // 缺少前置 thinking 块
 *   { type: "text", ... }
 * ]
 * ```
 * 
 * ## 与 session-recovery 钩子的区别
 * 
 * | 特性 | thinking-block-validator | session-recovery |
 * |------|-------------------------|------------------|
 * | 时机 | **主动**（PROACTIVE） | **被动**（REACTIVE） |
 * | 执行点 | API 调用**前** | API 错误**后** |
 * | 用户体验 | 用户**不会**看到错误 | 用户先看到错误再恢复 |
 * | 性能 | 无额外 API 调用 | 需要重试 API 调用 |
 * | 作用 | 预防错误发生 | 错误发生后修复 |
 * 
 * ## 实现逻辑
 * 1. 检测模型是否支持扩展思考（Claude 4 系列、Claude 3）
 * 2. 遍历所有 assistant 消息
 * 3. 检查消息是否包含内容部分（tool_use/text）但缺少前置 thinking 块
 * 4. 从之前的 assistant 消息中查找最近的 thinking 内容
 * 5. 在消息开头插入 thinking 块（使用找到的内容或占位符）
 * 
 * ## 思考内容来源
 * - **优先**：从之前的 assistant 消息中复制最近的 thinking 内容
 * - **备用**：使用占位符 "[Continuing from previous reasoning]"
 * 
 * ## 支持的模型
 * - Claude Sonnet 4.x
 * - Claude Opus 4.x
 * - Claude 3.x 系列
 * - 任何包含 "thinking" 或以 "-high" 结尾的模型变体
 * 
 * Proactive Thinking Block Validator Hook
 *
 * Prevents "Expected thinking/redacted_thinking but found tool_use" errors
 * by validating and fixing message structure BEFORE sending to Anthropic API.
 *
 * This hook runs on the "experimental.chat.messages.transform" hook point,
 * which is called before messages are converted to ModelMessage format and
 * sent to the API.
 *
 * Key differences from session-recovery hook:
 * - PROACTIVE (prevents error) vs REACTIVE (fixes after error)
 * - Runs BEFORE API call vs AFTER API error
 * - User never sees the error vs User sees error then recovery
 */

import type { Message, Part } from "@opencode-ai/sdk"

/** 包含 parts 的消息接口 */
interface MessageWithParts {
  info: Message
  parts: Part[]
}

/** 消息转换钩子类型 */
type MessagesTransformHook = {
  "experimental.chat.messages.transform"?: (
    input: Record<string, never>,
    output: { messages: MessageWithParts[] }
  ) => Promise<void>
}

/**
 * 检查模型是否启用扩展思考模式
 * 
 * 使用与 think-mode/switcher.ts 一致的模式匹配逻辑
 * 
 * @param modelID - 模型 ID
 * @returns 是否为扩展思考模型
 */
function isExtendedThinkingModel(modelID: string): boolean {
  if (!modelID) return false
  const lower = modelID.toLowerCase()

  // Check for explicit thinking/high variants (always enabled)
  if (lower.includes("thinking") || lower.endsWith("-high")) {
    return true
  }

  // Check for thinking-capable models (claude-4 family, claude-3)
  // Aligns with THINKING_CAPABLE_MODELS in think-mode/switcher.ts
  return (
    lower.includes("claude-sonnet-4") ||
    lower.includes("claude-opus-4") ||
    lower.includes("claude-3")
  )
}

/**
 * 检查消息是否包含内容部分
 * 
 * 内容部分包括：tool_use、text 等非思考类型的部分
 * 
 * @param parts - 消息部分数组
 * @returns 是否包含内容部分
 */
function hasContentParts(parts: Part[]): boolean {
  if (!parts || parts.length === 0) return false

  return parts.some((part: Part) => {
    const type = part.type as string
    // Include tool parts and text parts (anything that's not thinking/reasoning)
    return type === "tool" || type === "tool_use" || type === "text"
  })
}

/**
 * 检查消息是否以思考块开头
 * 
 * @param parts - 消息部分数组
 * @returns 是否以 thinking/reasoning 块开头
 */
function startsWithThinkingBlock(parts: Part[]): boolean {
  if (!parts || parts.length === 0) return false

  const firstPart = parts[0]
  const type = firstPart.type as string
  return type === "thinking" || type === "reasoning"
}

/**
 * 从之前的 assistant 消息中查找最近的思考内容
 * 
 * 向后搜索消息历史，找到最近的 thinking/reasoning 块内容
 * 
 * @param messages - 消息数组
 * @param currentIndex - 当前消息索引
 * @returns 找到的思考内容，如果没有则返回空字符串
 */
function findPreviousThinkingContent(
  messages: MessageWithParts[],
  currentIndex: number
): string {
  // Search backwards from current message
  for (let i = currentIndex - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.info.role !== "assistant") continue

    // Look for thinking parts
    if (!msg.parts) continue
    for (const part of msg.parts) {
      const type = part.type as string
      if (type === "thinking" || type === "reasoning") {
        const thinking = (part as any).thinking || (part as any).text
        if (thinking && typeof thinking === "string" && thinking.trim().length > 0) {
          return thinking
        }
      }
    }
  }

  return ""
}

/**
 * 在消息的 parts 数组开头插入思考块
 * 
 * 创建一个合成的 thinking part 并插入到消息开头
 * 
 * @param message - 要修改的消息
 * @param thinkingContent - 思考内容
 */
function prependThinkingBlock(
  message: MessageWithParts,
  thinkingContent: string
): void {
  if (!message.parts) {
    message.parts = []
  }

  // Create synthetic thinking part
  const thinkingPart = {
    type: "thinking" as const,
    id: `prt_0000000000_synthetic_thinking`,
    sessionID: (message.info as any).sessionID || "",
    messageID: message.info.id,
    thinking: thinkingContent,
    synthetic: true,
  }

  // Prepend to parts array
  message.parts.unshift(thinkingPart as unknown as Part)
}

/**
 * 创建思考块验证钩子
 * 
 * 在消息发送到 API 前验证和修复 assistant 消息结构，
 * 确保包含 tool_use 的消息以 thinking 块开头。
 * 
 * 这是一个主动预防机制，避免 API 错误发生。
 * 
 * @returns MessagesTransform 钩子对象
 */
export function createThinkingBlockValidatorHook(): MessagesTransformHook {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output

      if (!messages || messages.length === 0) {
        return
      }

      // Get the model info from the last user message
      const lastUserMessage = messages.findLast(m => m.info.role === "user")
      const modelID = (lastUserMessage?.info as any)?.modelID || ""

      // Only process if extended thinking might be enabled
      if (!isExtendedThinkingModel(modelID)) {
        return
      }

      // Process all assistant messages
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]

        // Only check assistant messages
        if (msg.info.role !== "assistant") continue

        // Check if message has content parts but doesn't start with thinking
        if (hasContentParts(msg.parts) && !startsWithThinkingBlock(msg.parts)) {
          // Find thinking content from previous turns
          const previousThinking = findPreviousThinkingContent(messages, i)

          // Prepend thinking block with content from previous turn or placeholder
          const thinkingContent = previousThinking || "[Continuing from previous reasoning]"

          prependThinkingBlock(msg, thinkingContent)
        }
      }
    },
  }
}
