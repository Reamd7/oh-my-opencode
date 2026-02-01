/**
 * 空任务响应检测器钩子
 * 
 * 功能：
 * - 检测Task工具返回的空响应
 * - 提供清晰的警告信息
 * - 帮助代理理解任务已完成但无输出的情况
 * 
 * 使用场景：
 * - 子代理执行失败
 * - 子代理未正确终止
 * - 子代理返回空结果
 */
import type { PluginInput } from "@opencode-ai/plugin"

const EMPTY_RESPONSE_WARNING = `[Task Empty Response Warning]

Task invocation completed but returned no response. This indicates the agent either:
- Failed to execute properly
- Did not terminate correctly
- Returned an empty result

Note: The call has already completed - you are NOT waiting for a response. Proceed accordingly.`

/**
 * 创建空任务响应检测器钩子
 */
export function createEmptyTaskResponseDetectorHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      // 仅检测Task工具
      if (input.tool !== "Task") return

      const responseText = output.output?.trim() ?? ""

      // 如果响应为空，添加警告
      if (responseText === "") {
        output.output = EMPTY_RESPONSE_WARNING
      }
    },
  }
}
