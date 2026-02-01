import type { PluginInput } from "@opencode-ai/plugin"

/**
 * 已知的 Edit 工具错误模式，表明 AI 犯了错误
 * Known Edit tool error patterns that indicate the AI made a mistake
 */
export const EDIT_ERROR_PATTERNS = [
  "oldString and newString must be different",
  "oldString not found",
  "oldString found multiple times",
] as const

/**
 * 当 Edit 工具因 AI 错误而失败时注入的系统提醒
 * 简短、直接、命令式 - 强制立即采取纠正措施
 * 
 * System reminder injected when Edit tool fails due to AI mistake
 * Short, direct, and commanding - forces immediate corrective action
 */
export const EDIT_ERROR_REMINDER = `
[EDIT ERROR - IMMEDIATE ACTION REQUIRED]

You made an Edit mistake. STOP and do this NOW:

1. READ the file immediately to see its ACTUAL current state
2. VERIFY what the content really looks like (your assumption was wrong)
3. APOLOGIZE briefly to the user for the error
4. CONTINUE with corrected action based on the real file content

DO NOT attempt another edit until you've read and verified the file state.
`

/**
 * 检测由 AI 错误引起的 Edit 工具错误并注入恢复提醒
 * Detects Edit tool errors caused by AI mistakes and injects a recovery reminder
 *
 * 此钩子捕获常见的 Edit 工具失败：
 * This hook catches common Edit tool failures:
 * - oldString and newString must be different (尝试"编辑"为相同内容 / trying to "edit" to same content)
 * - oldString not found (对文件内容的错误假设 / wrong assumption about file content)
 * - oldString found multiple times (模糊匹配，需要更多上下文 / ambiguous match, need more context)
 *
 * 恢复策略：
 * Recovery strategy:
 * 1. 检测错误模式 / Detect error patterns
 * 2. 注入强制性恢复指令 / Inject mandatory recovery instructions
 * 3. 要求 AI 先读取文件再重试 / Require AI to read file before retry
 *
 * @see https://github.com/sst/opencode/issues/4718
 */
export function createEditErrorRecoveryHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (input.tool.toLowerCase() !== "edit") return

      const outputLower = output.output.toLowerCase()
      const hasEditError = EDIT_ERROR_PATTERNS.some((pattern) =>
        outputLower.includes(pattern.toLowerCase())
      )

      if (hasEditError) {
        output.output += `\n${EDIT_ERROR_REMINDER}`
      }
    },
  }
}
