/**
 * 任务恢复信息钩子 - 为后台任务添加恢复指令
 * Task resume info hook - Adds resume instructions for background tasks
 * 
 * 此钩子在任务委托工具输出中自动添加恢复信息
 * This hook automatically adds resume information to task delegation tool outputs
 * 
 * 目标工具：
 * Target tools:
 * - task / Task (旧版任务工具 / Legacy task tool)
 * - call_omo_agent (调用 OMO 代理 / Call OMO agent)
 * - delegate_task (委托任务 / Delegate task)
 * 
 * session_id 机制：
 * session_id mechanism:
 * - 每个后台任务都有唯一的 session_id / Each background task has unique session_id
 * - session_id 用于恢复中断的任务 / session_id used to resume interrupted tasks
 * - 格式：ses_[a-zA-Z0-9_-]+ / Format: ses_[a-zA-Z0-9_-]+
 * 
 * 恢复上下文：
 * Resume context:
 * - 包含任务状态 / Includes task state
 * - 包含之前的对话历史 / Includes previous conversation history
 * - 允许无缝继续任务 / Allows seamless task continuation
 */
const TARGET_TOOLS = ["task", "Task", "call_omo_agent", "delegate_task"]

const SESSION_ID_PATTERNS = [
  /Session ID: (ses_[a-zA-Z0-9_-]+)/,
  /session_id: (ses_[a-zA-Z0-9_-]+)/,
  /<task_metadata>\s*session_id: (ses_[a-zA-Z0-9_-]+)/,
  /sessionId: (ses_[a-zA-Z0-9_-]+)/,
]

/**
 * 从工具输出中提取 session_id
 * Extracts session_id from tool output
 * 
 * @param output - 工具输出字符串 / Tool output string
 * @returns 提取的 session_id，如果未找到则返回 null / Extracted session_id, or null if not found
 */
function extractSessionId(output: string): string | null {
  for (const pattern of SESSION_ID_PATTERNS) {
    const match = output.match(pattern)
    if (match) return match[1]
  }
  return null
}

/**
 * 创建任务恢复信息钩子
 * Creates task resume info hook
 * 
 * PostToolUse 钩子，在任务委托工具输出中添加恢复指令
 * PostToolUse hook that adds resume instructions to task delegation tool outputs
 * 
 * 工作流程：
 * Workflow:
 * 1. 检测目标工具调用 / Detect target tool calls
 * 2. 从输出中提取 session_id / Extract session_id from output
 * 3. 追加恢复指令到输出 / Append resume instruction to output
 * 
 * 恢复指令格式：
 * Resume instruction format:
 * ```
 * to continue: delegate_task(session_id="ses_xxx", prompt="...")
 * ```
 * 
 * @returns PostToolUse 钩子对象 / PostToolUse hook object
 */
export function createTaskResumeInfoHook() {
   const toolExecuteAfter = async (
     input: { tool: string; sessionID: string; callID: string },
     output: { title: string; output: string; metadata: unknown }
   ) => {
     if (!TARGET_TOOLS.includes(input.tool)) return
     if (output.output.startsWith("Error:") || output.output.startsWith("Failed")) return
     if (output.output.includes("\nto continue:")) return

     const sessionId = extractSessionId(output.output)
     if (!sessionId) return

     output.output = output.output.trimEnd() + `\n\nto continue: delegate_task(session_id="${sessionId}", prompt="...")`
   }

   return {
     "tool.execute.after": toolExecuteAfter,
   }
}
