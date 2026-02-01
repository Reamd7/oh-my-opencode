/**
 * Anthropic 上下文窗口限制恢复钩子 - 自动处理 token 限制错误
 * Anthropic context window limit recovery hook - Automatically handles token limit errors
 * 
 * 此钩子监听 Anthropic API 的上下文窗口限制错误并自动恢复
 * This hook listens for Anthropic API context window limit errors and automatically recovers
 * 
 * 上下文窗口限制问题：
 * Context window limit issues:
 * - Anthropic 模型有最大 token 限制（如 Claude Opus 4.5: 200K tokens）/ Anthropic models have max token limits
 * - 长对话或大工具输出会超出限制 / Long conversations or large tool outputs exceed limits
 * - 超出限制会导致 API 错误 / Exceeding limits causes API errors
 * 
 * 自动恢复策略：
 * Automatic recovery strategy:
 * 1. 检测 token 限制错误 / Detect token limit errors
 * 2. 截断大型工具输出 / Truncate large tool outputs
 * 3. 触发消息压缩（compaction）/ Trigger message compaction
 * 4. 自动重试请求 / Automatically retry request
 * 
 * 消息压缩逻辑：
 * Message compaction logic:
 * - 保留最近的重要消息 / Keep recent important messages
 * - 压缩旧消息为摘要 / Compress old messages into summary
 * - 保留系统提示和工具定义 / Preserve system prompts and tool definitions
 * - 减少总 token 数 / Reduce total token count
 */
import type { PluginInput } from "@opencode-ai/plugin"
import type { AutoCompactState, ParsedTokenLimitError } from "./types"
import type { ExperimentalConfig } from "../../config"
import { parseAnthropicTokenLimitError } from "./parser"
import { executeCompact, getLastAssistant } from "./executor"
import { log } from "../../shared/logger"

export interface AnthropicContextWindowLimitRecoveryOptions {
  experimental?: ExperimentalConfig
}

/**
 * 创建恢复状态对象
 * Creates recovery state object
 * 
 * 跟踪每个会话的恢复状态：
 * Tracks recovery state for each session:
 * - pendingCompact: 待压缩的会话 / Sessions pending compaction
 * - errorDataBySession: 错误数据缓存 / Error data cache
 * - retryStateBySession: 重试状态 / Retry state
 * - truncateStateBySession: 截断状态 / Truncate state
 * - emptyContentAttemptBySession: 空内容尝试计数 / Empty content attempt count
 * - compactionInProgress: 正在压缩的会话 / Sessions being compacted
 */
function createRecoveryState(): AutoCompactState {
  return {
    pendingCompact: new Set<string>(),
    errorDataBySession: new Map<string, ParsedTokenLimitError>(),
    retryStateBySession: new Map(),
    truncateStateBySession: new Map(),
    emptyContentAttemptBySession: new Map(),
    compactionInProgress: new Set<string>(),
  }
}

/**
 * 创建 Anthropic 上下文窗口限制恢复钩子
 * Creates Anthropic context window limit recovery hook
 * 
 * 事件钩子，监听以下事件：
 * Event hook that listens to:
 * - session.error: 会话错误（token 限制）/ Session errors (token limits)
 * - message.updated: 消息更新（带错误）/ Message updates (with errors)
 * - session.idle: 会话空闲（触发压缩）/ Session idle (trigger compaction)
 * - session.deleted: 会话删除（清理状态）/ Session deleted (cleanup state)
 * 
 * 恢复流程：
 * Recovery flow:
 * 1. 解析 token 限制错误 / Parse token limit error
 * 2. 显示 Toast 通知用户 / Show toast to notify user
 * 3. 执行消息压缩 / Execute message compaction
 * 4. 自动重试失败的请求 / Automatically retry failed request
 * 
 * @param ctx - 插件输入上下文 / Plugin input context
 * @param options - 恢复选项（包含实验性配置）/ Recovery options (includes experimental config)
 * @returns 事件钩子对象 / Event hook object
 */
export function createAnthropicContextWindowLimitRecoveryHook(ctx: PluginInput, options?: AnthropicContextWindowLimitRecoveryOptions) {
  const autoCompactState = createRecoveryState()
  const experimental = options?.experimental

  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        autoCompactState.pendingCompact.delete(sessionInfo.id)
        autoCompactState.errorDataBySession.delete(sessionInfo.id)
        autoCompactState.retryStateBySession.delete(sessionInfo.id)
        autoCompactState.truncateStateBySession.delete(sessionInfo.id)
        autoCompactState.emptyContentAttemptBySession.delete(sessionInfo.id)
        autoCompactState.compactionInProgress.delete(sessionInfo.id)
      }
      return
    }

    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      log("[auto-compact] session.error received", { sessionID, error: props?.error })
      if (!sessionID) return

      const parsed = parseAnthropicTokenLimitError(props?.error)
      log("[auto-compact] parsed result", { parsed, hasError: !!props?.error })
      if (parsed) {
        autoCompactState.pendingCompact.add(sessionID)
        autoCompactState.errorDataBySession.set(sessionID, parsed)

        if (autoCompactState.compactionInProgress.has(sessionID)) {
          return
        }

        const lastAssistant = await getLastAssistant(sessionID, ctx.client, ctx.directory)
        const providerID = parsed.providerID ?? (lastAssistant?.providerID as string | undefined)
        const modelID = parsed.modelID ?? (lastAssistant?.modelID as string | undefined)

        await ctx.client.tui
          .showToast({
            body: {
              title: "Context Limit Hit",
              message: "Truncating large tool outputs and recovering...",
              variant: "warning" as const,
              duration: 3000,
            },
          })
          .catch(() => {})

        setTimeout(() => {
          executeCompact(
            sessionID,
            { providerID, modelID },
            autoCompactState,
            ctx.client,
            ctx.directory,
            experimental
          )
        }, 300)
      }
      return
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined

      if (sessionID && info?.role === "assistant" && info.error) {
        log("[auto-compact] message.updated with error", { sessionID, error: info.error })
        const parsed = parseAnthropicTokenLimitError(info.error)
        log("[auto-compact] message.updated parsed result", { parsed })
        if (parsed) {
          parsed.providerID = info.providerID as string | undefined
          parsed.modelID = info.modelID as string | undefined
          autoCompactState.pendingCompact.add(sessionID)
          autoCompactState.errorDataBySession.set(sessionID, parsed)
        }
      }
      return
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      if (!autoCompactState.pendingCompact.has(sessionID)) return

      const errorData = autoCompactState.errorDataBySession.get(sessionID)
      const lastAssistant = await getLastAssistant(sessionID, ctx.client, ctx.directory)

      if (lastAssistant?.summary === true) {
        autoCompactState.pendingCompact.delete(sessionID)
        return
      }

      const providerID = errorData?.providerID ?? (lastAssistant?.providerID as string | undefined)
      const modelID = errorData?.modelID ?? (lastAssistant?.modelID as string | undefined)

      await ctx.client.tui
        .showToast({
          body: {
            title: "Auto Compact",
            message: "Token limit exceeded. Attempting recovery...",
            variant: "warning" as const,
            duration: 3000,
          },
        })
        .catch(() => {})

      await executeCompact(
        sessionID,
        { providerID, modelID },
        autoCompactState,
        ctx.client,
        ctx.directory,
        experimental
      )
    }
  }

  return {
    event: eventHandler,
  }
}

export type { AutoCompactState, ParsedTokenLimitError, TruncateState } from "./types"
export { parseAnthropicTokenLimitError } from "./parser"
export { executeCompact, getLastAssistant } from "./executor"
