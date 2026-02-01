/**
 * 子代理问题阻止钩子 (Subagent Question Blocker Hook)
 * 
 * ## 触发时机
 * PreToolUse - 在 Question/AskUserQuestion 工具调用前执行
 * 
 * ## 功能概述
 * 阻止子代理（subagent）向用户提问，确保子代理自主完成任务。
 * 子代理应该是完全自主的执行单元，不应该中断用户或主代理的工作流程。
 * 
 * ## 使用场景
 * - 后台代理（background agent）尝试使用 Question 工具
 * - 委托任务（delegate_task）中的子代理尝试提问
 * - 需要保证子代理的自主性和非阻塞性
 * 
 * ## 设计理念
 * 子代理的核心价值在于：
 * 1. **自主性**：不依赖用户输入，独立完成任务
 * 2. **非阻塞**：不中断主代理或用户的工作流程
 * 3. **并行性**：可以在后台并行执行多个子代理
 * 
 * 如果子代理需要澄清信息：
 * - 应该基于现有上下文做出合理假设
 * - 或者将不确定性报告给父代理
 * - 而不是直接向用户提问
 * 
 * ## 实现逻辑
 * 1. 检测工具调用是否为 question/askuserquestion
 * 2. 检查当前 session 是否为子代理 session
 * 3. 如果是子代理尝试提问，抛出错误阻止调用
 * 4. 错误信息指导子代理返回父代理报告不确定性
 * 
 * ## 例外情况
 * 目前无例外情况。所有子代理都不允许提问。
 * 如果未来需要支持交互式子代理，需要：
 * - 添加配置选项允许特定子代理提问
 * - 或者创建新的子代理类型（interactive-subagent）
 */

import type { Hooks } from "@opencode-ai/plugin"
import { subagentSessions } from "../../features/claude-code-session-state"
import { log } from "../../shared"

/**
 * 创建子代理问题阻止钩子
 * 
 * 在 PreToolUse 阶段拦截子代理的 Question 工具调用，
 * 强制子代理保持自主性，不中断用户工作流程。
 * 
 * @returns PreToolUse 钩子对象
 */
export function createSubagentQuestionBlockerHook(): Hooks {
  return {
    "tool.execute.before": async (input) => {
      const toolName = input.tool?.toLowerCase()
      if (toolName !== "question" && toolName !== "askuserquestion") {
        return
      }

      if (!subagentSessions.has(input.sessionID)) {
        return
      }

      log("[subagent-question-blocker] Blocking question tool call from subagent session", {
        sessionID: input.sessionID,
        tool: input.tool,
      })

      throw new Error(
        "Question tool is disabled for subagent sessions. " +
        "Subagents should complete their work autonomously without asking questions to users. " +
        "If you need clarification, return to the parent agent with your findings and uncertainties."
      )
    },
  }
}
