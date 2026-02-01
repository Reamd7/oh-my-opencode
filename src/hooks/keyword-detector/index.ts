/**
 * 关键词检测钩子 (Keyword Detector Hook)
 * 
 * 功能：检测用户消息中的特殊关键词，自动注入对应的工作模式指令
 * 目的：通过关键词触发不同的代理行为模式，提升任务执行效率
 * 
 * 支持的关键词模式：
 * 1. ultrawork/ulw：极致工作模式，强制使用代理委托、并行执行、完整验证
 * 2. search：搜索模式，启动多个并行搜索代理（explore + librarian）
 * 3. analyze：分析模式，深度上下文收集 + oracle 咨询
 * 
 * 工作原理：
 * 1. 监听 chat.message 事件，提取用户消息文本
 * 2. 移除代码块和系统指令，避免误触发
 * 3. 检测关键词并生成对应的模式指令
 * 4. 将指令注入到消息开头，影响代理行为
 * 5. 对于 ultrawork 模式，额外设置 variant=max 并显示 Toast 通知
 * 
 * 特殊处理：
 * - 规划代理（Prometheus）：过滤 ultrawork 关键词，避免冲突
 * - 后台任务会话：跳过关键词检测，避免模式注入干扰
 * - 非主会话：仅保留 ultrawork 关键词，其他模式不适用
 * - 系统指令：跳过检测，避免自动化消息触发模式
 */
import type { PluginInput } from "@opencode-ai/plugin"
import { detectKeywordsWithType, extractPromptText, removeCodeBlocks } from "./detector"
import { isPlannerAgent } from "./constants"
import { log } from "../../shared"
import { hasSystemReminder, isSystemDirective, removeSystemReminders } from "../../shared/system-directive"
import { getMainSessionID, getSessionAgent, subagentSessions } from "../../features/claude-code-session-state"
import type { ContextCollector } from "../../features/context-injector"

export * from "./detector"
export * from "./constants"
export * from "./types"

/**
 * 创建关键词检测钩子
 * 
 * @param ctx - 插件上下文，用于显示 Toast 通知
 * @param collector - 上下文收集器（可选，用于注册钩子内容）
 * @returns 钩子对象，包含 chat.message 处理器
 */
export function createKeywordDetectorHook(ctx: PluginInput, collector?: ContextCollector) {
  return {
    /**
     * chat.message 钩子：检测关键词并注入模式指令
     * 
     * 执行流程：
     * 1. 提取用户消息文本
     * 2. 跳过系统指令消息（避免自动化消息触发）
     * 3. 移除系统提醒内容（避免误触发）
     * 4. 检测关键词（ultrawork/search/analyze）
     * 5. 根据代理类型和会话类型过滤关键词
     * 6. 注入模式指令到消息开头
     * 7. 对于 ultrawork 模式，设置 variant=max 并显示通知
     */
    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
        model?: { providerID: string; modelID: string }
        messageID?: string
      },
      output: {
        message: Record<string, unknown>
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      }
    ): Promise<void> => {
      const promptText = extractPromptText(output.parts)

      // 跳过系统指令消息（如自动继续、错误恢复等）
      if (isSystemDirective(promptText)) {
        log(`[keyword-detector] Skipping system directive message`, { sessionID: input.sessionID })
        return
      }

      const currentAgent = getSessionAgent(input.sessionID) ?? input.agent

      // Remove system-reminder content to prevent automated system messages from triggering mode keywords
      const cleanText = removeSystemReminders(promptText)
      let detectedKeywords = detectKeywordsWithType(removeCodeBlocks(cleanText), currentAgent)

      // 规划代理（Prometheus）：过滤 ultrawork 关键词，避免与规划流程冲突
      if (isPlannerAgent(currentAgent)) {
        detectedKeywords = detectedKeywords.filter((k) => k.type !== "ultrawork")
      }

      if (detectedKeywords.length === 0) {
        return
      }

      // Skip keyword detection for background task sessions to prevent mode injection
      // (e.g., [analyze-mode]) which incorrectly triggers Prometheus restrictions
      const isBackgroundTaskSession = subagentSessions.has(input.sessionID)
      if (isBackgroundTaskSession) {
        return
      }

      // 非主会话：仅保留 ultrawork 关键词，其他模式不适用
      const mainSessionID = getMainSessionID()
      const isNonMainSession = mainSessionID && input.sessionID !== mainSessionID

      if (isNonMainSession) {
        detectedKeywords = detectedKeywords.filter((k) => k.type === "ultrawork")
        if (detectedKeywords.length === 0) {
          log(`[keyword-detector] Skipping non-ultrawork keywords in non-main session`, {
            sessionID: input.sessionID,
            mainSessionID,
          })
          return
        }
      }

      // ultrawork 模式特殊处理：设置 variant=max + Toast 通知
      const hasUltrawork = detectedKeywords.some((k) => k.type === "ultrawork")
      if (hasUltrawork) {
        log(`[keyword-detector] Ultrawork mode activated`, { sessionID: input.sessionID })

        if (output.message.variant === undefined) {
          output.message.variant = "max"
        }

        ctx.client.tui
          .showToast({
            body: {
              title: "Ultrawork Mode Activated",
              message: "Maximum precision engaged. All agents at your disposal.",
              variant: "success" as const,
              duration: 3000,
            },
          })
          .catch((err) =>
            log(`[keyword-detector] Failed to show toast`, { error: err, sessionID: input.sessionID })
          )
      }

      // 注入模式指令到消息开头
      const textPartIndex = output.parts.findIndex((p) => p.type === "text" && p.text !== undefined)
      if (textPartIndex === -1) {
        log(`[keyword-detector] No text part found, skipping injection`, { sessionID: input.sessionID })
        return
      }

      const allMessages = detectedKeywords.map((k) => k.message).join("\n\n")
      const originalText = output.parts[textPartIndex].text ?? ""

      output.parts[textPartIndex].text = `${allMessages}\n\n---\n\n${originalText}`

      log(`[keyword-detector] Detected ${detectedKeywords.length} keywords`, {
        sessionID: input.sessionID,
        types: detectedKeywords.map((k) => k.type),
      })
    },
  }
}
