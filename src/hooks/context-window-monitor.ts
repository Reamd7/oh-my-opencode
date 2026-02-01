/**
 * 上下文窗口监控钩子
 * 
 * 功能：
 * - 监控Anthropic Claude的上下文使用情况
 * - 在达到阈值时提醒代理
 * - 防止代理因担心上下文不足而匆忙完成任务
 * 
 * 工作原理：
 * - 跟踪每个会话的token使用量
 * - 当使用量超过70%时发送提醒
 * - 提醒代理有充足的上下文空间，可以彻底完成工作
 */
import type { PluginInput } from "@opencode-ai/plugin"
import { createSystemDirective, SystemDirectiveTypes } from "../shared/system-directive"

// Anthropic显示的上下文限制
const ANTHROPIC_DISPLAY_LIMIT = 1_000_000
// 实际上下文限制（根据环境变量）
const ANTHROPIC_ACTUAL_LIMIT =
  process.env.ANTHROPIC_1M_CONTEXT === "true" ||
  process.env.VERTEX_ANTHROPIC_1M_CONTEXT === "true"
    ? 1_000_000
    : 200_000
// 上下文警告阈值（70%）
const CONTEXT_WARNING_THRESHOLD = 0.70

// 上下文提醒消息
const CONTEXT_REMINDER = `${createSystemDirective(SystemDirectiveTypes.CONTEXT_WINDOW_MONITOR)}

You are using Anthropic Claude with 1M context window.
You have plenty of context remaining - do NOT rush or skip tasks.
Complete your work thoroughly and methodically.`

interface AssistantMessageInfo {
  role: "assistant"
  providerID: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
}

interface MessageWrapper {
  info: { role: string } & Partial<AssistantMessageInfo>
}

export function createContextWindowMonitorHook(ctx: PluginInput) {
  const remindedSessions = new Set<string>()

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown }
  ) => {
    const { sessionID } = input

    if (remindedSessions.has(sessionID)) return

    try {
      const response = await ctx.client.session.messages({
        path: { id: sessionID },
      })

      const messages = (response.data ?? response) as MessageWrapper[]

      const assistantMessages = messages
        .filter((m) => m.info.role === "assistant")
        .map((m) => m.info as AssistantMessageInfo)

      if (assistantMessages.length === 0) return

      const lastAssistant = assistantMessages[assistantMessages.length - 1]
      if (lastAssistant.providerID !== "anthropic") return

      // Use only the last assistant message's input tokens
      // This reflects the ACTUAL current context window usage (post-compaction)
      const lastTokens = lastAssistant.tokens
      const totalInputTokens = (lastTokens?.input ?? 0) + (lastTokens?.cache?.read ?? 0)

      const actualUsagePercentage = totalInputTokens / ANTHROPIC_ACTUAL_LIMIT

      if (actualUsagePercentage < CONTEXT_WARNING_THRESHOLD) return

      remindedSessions.add(sessionID)

      const displayUsagePercentage = totalInputTokens / ANTHROPIC_DISPLAY_LIMIT
      const usedPct = (displayUsagePercentage * 100).toFixed(1)
      const remainingPct = ((1 - displayUsagePercentage) * 100).toFixed(1)
      const usedTokens = totalInputTokens.toLocaleString()
      const limitTokens = ANTHROPIC_DISPLAY_LIMIT.toLocaleString()

      output.output += `\n\n${CONTEXT_REMINDER}
[Context Status: ${usedPct}% used (${usedTokens}/${limitTokens} tokens), ${remainingPct}% remaining]`
    } catch {
      // Graceful degradation - do not disrupt tool execution
    }
  }

  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        remindedSessions.delete(sessionInfo.id)
      }
    }
  }

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  }
}
