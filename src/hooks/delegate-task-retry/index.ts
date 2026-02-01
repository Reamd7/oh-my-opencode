import type { PluginInput } from "@opencode-ai/plugin"

/**
 * delegate_task 错误模式定义
 * Delegate task error pattern definition
 */
export interface DelegateTaskErrorPattern {
  pattern: string
  errorType: string
  fixHint: string
}

/**
 * delegate_task 工具的已知错误模式和修复提示
 * Known error patterns and fix hints for delegate_task tool
 * 
 * 涵盖的错误类型：
 * Covered error types:
 * - 缺少必需参数 (run_in_background, load_skills) / Missing required parameters
 * - 参数互斥冲突 (category vs subagent_type) / Mutually exclusive parameters
 * - 无效的 category 或 agent 名称 / Invalid category or agent names
 * - 尝试调用主代理 / Attempting to call primary agent
 * - 未找到的技能 / Skills not found
 */
export const DELEGATE_TASK_ERROR_PATTERNS: DelegateTaskErrorPattern[] = [
  {
    pattern: "run_in_background",
    errorType: "missing_run_in_background",
    fixHint: "Add run_in_background=false (for delegation) or run_in_background=true (for parallel exploration)",
  },
  {
    pattern: "load_skills",
    errorType: "missing_load_skills",
    fixHint: "Add load_skills=[] parameter (empty array if no skills needed). Note: Calling Skill tool does NOT populate this.",
  },
  {
    pattern: "category OR subagent_type",
    errorType: "mutual_exclusion",
    fixHint: "Provide ONLY one of: category (e.g., 'general', 'quick') OR subagent_type (e.g., 'oracle', 'explore')",
  },
  {
    pattern: "Must provide either category or subagent_type",
    errorType: "missing_category_or_agent",
    fixHint: "Add either category='general' OR subagent_type='explore'",
  },
  {
    pattern: "Unknown category",
    errorType: "unknown_category",
    fixHint: "Use a valid category from the Available list in the error message",
  },
  {
    pattern: "Agent name cannot be empty",
    errorType: "empty_agent",
    fixHint: "Provide a non-empty subagent_type value",
  },
  {
    pattern: "Unknown agent",
    errorType: "unknown_agent",
    fixHint: "Use a valid agent from the Available agents list in the error message",
  },
  {
    pattern: "Cannot call primary agent",
    errorType: "primary_agent",
    fixHint: "Primary agents cannot be called via delegate_task. Use a subagent like 'explore', 'oracle', or 'librarian'",
  },
  {
    pattern: "Skills not found",
    errorType: "unknown_skills",
    fixHint: "Use valid skill names from the Available list in the error message",
  },
]

/**
 * 检测到的错误信息
 * Detected error information
 */
export interface DetectedError {
  errorType: string
  originalOutput: string
}

/**
 * 检测 delegate_task 工具输出中的错误
 * Detects errors in delegate_task tool output
 * 
 * @param output - 工具输出字符串 / Tool output string
 * @returns 检测到的错误信息，如果没有错误则返回 null / Detected error info, or null if no error
 */
export function detectDelegateTaskError(output: string): DetectedError | null {
  if (!output.includes("[ERROR]") && !output.includes("Invalid arguments")) return null

  for (const errorPattern of DELEGATE_TASK_ERROR_PATTERNS) {
    if (output.includes(errorPattern.pattern)) {
      return {
        errorType: errorPattern.errorType,
        originalOutput: output,
      }
    }
  }

  return null
}

/**
 * 从错误输出中提取可用选项列表
 * Extracts available options list from error output
 */
function extractAvailableList(output: string): string | null {
  const availableMatch = output.match(/Available[^:]*:\s*(.+)$/m)
  return availableMatch ? availableMatch[1].trim() : null
}

/**
 * 构建重试指导消息
 * Builds retry guidance message
 * 
 * 根据错误类型生成详细的修复指导，包括：
 * Generates detailed fix guidance based on error type, including:
 * - 错误类型说明 / Error type description
 * - 修复提示 / Fix hint
 * - 可用选项列表（如果有）/ Available options list (if any)
 * - 正确调用示例 / Correct call example
 * 
 * @param errorInfo - 检测到的错误信息 / Detected error information
 * @returns 格式化的重试指导消息 / Formatted retry guidance message
 */
export function buildRetryGuidance(errorInfo: DetectedError): string {
  const pattern = DELEGATE_TASK_ERROR_PATTERNS.find(
    (p) => p.errorType === errorInfo.errorType
  )

  if (!pattern) {
    return `[delegate_task ERROR] Fix the error and retry with correct parameters.`
  }

  let guidance = `
[delegate_task CALL FAILED - IMMEDIATE RETRY REQUIRED]

**Error Type**: ${errorInfo.errorType}
**Fix**: ${pattern.fixHint}
`

  const availableList = extractAvailableList(errorInfo.originalOutput)
  if (availableList) {
    guidance += `\n**Available Options**: ${availableList}\n`
  }

  guidance += `
**Action**: Retry delegate_task NOW with corrected parameters.

Example of CORRECT call:
\`\`\`
delegate_task(
  description="Task description",
  prompt="Detailed prompt...",
  category="unspecified-low",  // OR subagent_type="explore"
  run_in_background=false,
  load_skills=[]
)
\`\`\`
`

  return guidance
}

/**
 * 创建 delegate_task 重试钩子
 * Creates delegate_task retry hook
 * 
 * PostToolUse 钩子，在 delegate_task 工具调用失败后自动注入重试指导
 * PostToolUse hook that automatically injects retry guidance after delegate_task tool failures
 * 
 * 工作流程：
 * Workflow:
 * 1. 监听 tool.execute.after 事件 / Listen to tool.execute.after event
 * 2. 检测 delegate_task 工具的错误输出 / Detect delegate_task tool error output
 * 3. 根据错误类型生成重试指导 / Generate retry guidance based on error type
 * 4. 将指导消息追加到工具输出 / Append guidance message to tool output
 * 
 * 重试策略：
 * Retry strategy:
 * - 无指数退避（立即重试）/ No exponential backoff (immediate retry)
 * - 无最大重试次数限制 / No maximum retry limit
 * - 依赖 AI 根据指导自行修正参数 / Relies on AI to self-correct parameters based on guidance
 * 
 * @param _ctx - 插件输入上下文 / Plugin input context
 * @returns PostToolUse 钩子对象 / PostToolUse hook object
 */
export function createDelegateTaskRetryHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (input.tool.toLowerCase() !== "delegate_task") return

      const errorInfo = detectDelegateTaskError(output.output)
      if (errorInfo) {
        const guidance = buildRetryGuidance(errorInfo)
        output.output += `\n${guidance}`
      }
    },
  }
}
