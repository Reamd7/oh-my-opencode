/**
 * 工具输出截断器钩子
 * 
 * 功能：
 * - 自动截断过长的工具输出
 * - 防止上下文窗口膨胀
 * - 针对不同工具使用不同的截断策略
 * 
 * 截断策略：
 * - 默认：50k tokens（约200k字符）
 * - webfetch：10k tokens（约40k字符）- 网页需要更激进的截断
 * - 实验性：可配置截断所有工具输出
 */
import type { PluginInput } from "@opencode-ai/plugin"
import type { ExperimentalConfig } from "../config/schema"
import { createDynamicTruncator } from "../shared/dynamic-truncator"

const DEFAULT_MAX_TOKENS = 50_000 // ~200k chars
const WEBFETCH_MAX_TOKENS = 10_000 // ~40k chars - web pages need aggressive truncation

// 可截断的工具列表
const TRUNCATABLE_TOOLS = [
  "grep",
  "Grep",
  "safe_grep",
  "glob",
  "Glob",
  "safe_glob",
  "lsp_diagnostics",
  "ast_grep_search",
  "interactive_bash",
  "Interactive_bash",
  "skill_mcp",
  "webfetch",
  "WebFetch",
]

// 工具特定的最大token数
const TOOL_SPECIFIC_MAX_TOKENS: Record<string, number> = {
  webfetch: WEBFETCH_MAX_TOKENS,
  WebFetch: WEBFETCH_MAX_TOKENS,
}

interface ToolOutputTruncatorOptions {
  experimental?: ExperimentalConfig
}

export function createToolOutputTruncatorHook(ctx: PluginInput, options?: ToolOutputTruncatorOptions) {
  const truncator = createDynamicTruncator(ctx)
  const truncateAll = options?.experimental?.truncate_all_tool_outputs ?? false

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown }
  ) => {
    if (!truncateAll && !TRUNCATABLE_TOOLS.includes(input.tool)) return

    try {
      const targetMaxTokens = TOOL_SPECIFIC_MAX_TOKENS[input.tool] ?? DEFAULT_MAX_TOKENS
      const { result, truncated } = await truncator.truncate(
        input.sessionID,
        output.output,
        { targetMaxTokens }
      )
      if (truncated) {
        output.output = result
      }
    } catch {
      // Graceful degradation - don't break tool execution
    }
  }

  return {
    "tool.execute.after": toolExecuteAfter,
  }
}
