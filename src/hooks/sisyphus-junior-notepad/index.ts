/**
 * Sisyphus Junior 记事本钩子 (Sisyphus Junior Notepad Hook)
 * 
 * 为 Sisyphus Junior 执行代理注入记事本指令，使其能够记录工作过程中的学习、问题和决策。
 * 记事本用于跨会话保存状态，帮助代理在后续工作中避免重复错误和利用已有经验。
 * 
 * Injects notepad directive for Sisyphus Junior execution agent, enabling it to
 * record learnings, issues, and decisions during work. Notepad is used for
 * cross-session state persistence, helping agent avoid repeated mistakes and
 * leverage existing experience in subsequent work.
 * 
 * 记事本结构 (Notepad structure):
 * - .sisyphus/notepads/{plan-name}/learnings.md - 成功的模式和方法 (Successful patterns)
 * - .sisyphus/notepads/{plan-name}/issues.md - 遇到的问题和陷阱 (Problems and gotchas)
 * - .sisyphus/notepads/{plan-name}/decisions.md - 架构决策 (Architectural decisions)
 * - .sisyphus/notepads/{plan-name}/problems.md - 未解决的问题 (Unresolved issues)
 * 
 * 关键约束 (Key constraints):
 * - 只在 Atlas 编排器委托任务时注入 (Only inject when Atlas orchestrator delegates)
 * - 计划文件 (.sisyphus/plans/*.md) 是只读的 (Plan files are read-only)
 * - 记事本文件只能追加，不能覆盖 (Notepad files append-only, no overwrite)
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { isCallerOrchestrator } from "../../shared/session-utils"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { log } from "../../shared/logger"
import { HOOK_NAME, NOTEPAD_DIRECTIVE } from "./constants"

export * from "./constants"

/**
 * 创建 Sisyphus Junior 记事本钩子
 * Creates Sisyphus Junior notepad hook
 * 
 * @param ctx - 插件上下文 (Plugin context)
 * @returns 钩子对象，监听 tool.execute.before 事件 (Hook object that listens to tool.execute.before)
 */
export function createSisyphusJuniorNotepadHook(ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      // 只对 delegate_task 工具生效 (Only apply to delegate_task tool)
      if (input.tool !== "delegate_task") {
        return
      }

      // 只在 Atlas 编排器调用时注入 (Only inject when called by Atlas orchestrator)
      if (!isCallerOrchestrator(input.sessionID)) {
        return
      }

      const prompt = output.args.prompt as string | undefined
      if (!prompt) {
        return
      }

      // 防止重复注入 (Prevent double injection)
      if (prompt.includes(SYSTEM_DIRECTIVE_PREFIX)) {
        return
      }

      // 注入记事本指令 (Inject notepad directive)
      output.args.prompt = NOTEPAD_DIRECTIVE + prompt

      log(`[${HOOK_NAME}] Injected notepad directive to delegate_task`, {
        sessionID: input.sessionID,
      })
    },
  }
}
