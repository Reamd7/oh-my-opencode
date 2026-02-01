/**
 * Category+Skill 提醒钩子 (Category+Skill Reminder Hook)
 * 
 * ## 触发时机
 * PostToolUse - 在工具调用后检查是否需要提醒
 * 
 * ## 功能概述
 * 提醒编排代理（orchestrator agent）使用 category+skill 系统进行任务委托。
 * 当编排代理连续执行多次可委托的工作（如 edit、write、bash）而未使用委托工具时，
 * 自动注入提醒信息，引导代理正确使用委托系统。
 * 
 * ## 使用场景
 * - Sisyphus/Atlas 等编排代理直接执行实现工作
 * - 代理连续调用 3 次以上可委托工具（edit/write/bash 等）
 * - 代理尚未使用任何委托工具（delegate_task/call_omo_agent）
 * 
 * ## Category+Skill 系统
 * 
 * ### Category（任务类别）
 * 用于根据任务性质选择合适的模型和配置：
 * - **visual-engineering**: UI/前端工作 → Gemini 3 Pro
 * - **ultrabrain**: 复杂逻辑/架构 → GPT 5.2 Medium
 * - **quick**: 快速/简单任务 → Claude Haiku 4.5
 * 
 * ### Skill（技能模块）
 * 用于加载特定领域的专业知识和工作流程：
 * - **frontend-ui-ux**: 前端 UI/UX 设计与实现
 * - **git-master**: Git 操作（原子提交、rebase、squash）
 * - **playwright**: 浏览器自动化
 * 
 * ### 委托示例
 * ```typescript
 * delegate_task(
 *   category="visual-engineering",
 *   load_skills=["frontend-ui-ux"],
 *   description="实现响应式导航栏动画",
 *   run_in_background=true
 * )
 * ```
 * 
 * ## 提醒触发条件
 * 1. 当前代理是目标编排代理（Sisyphus/Atlas/Sisyphus-Junior）
 * 2. 连续调用 3 次以上可委托工具
 * 3. 尚未使用任何委托工具
 * 4. 本次会话尚未显示过提醒
 * 
 * ## 实现逻辑
 * 1. 跟踪每个 session 的工具调用状态
 * 2. 检测可委托工具（edit/write/bash 等）的使用
 * 3. 检测委托工具（delegate_task 等）的使用
 * 4. 当满足触发条件时，在工具输出中注入提醒信息
 * 5. 会话结束或压缩时清理状态
 * 
 * ## 设计理念
 * 编排代理应该像团队 Leader：
 * - **委托专业工作**：UI 给前端专家，复杂逻辑给架构师
 * - **保持上下文清晰**：不陷入实现细节，专注协调
 * - **自己做探索工作**：收集信息、理解需求、规划任务
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { getSessionAgent } from "../../features/claude-code-session-state"
import { log } from "../../shared"

/**
 * 目标代理列表
 * 这些是应该接收 category+skill 提醒的编排代理
 */
const TARGET_AGENTS = new Set([
  "sisyphus",
  "sisyphus-junior",
  "atlas",
])

/**
 * 可委托工具列表
 * 这些工具表示代理正在执行可能应该委托的工作
 */
const DELEGATABLE_WORK_TOOLS = new Set([
  "edit",
  "write",
  "bash",
  "read",
  "grep",
  "glob",
])

/**
 * 委托工具列表
 * 这些工具表示代理已经正确使用了委托系统
 */
const DELEGATION_TOOLS = new Set([
  "delegate_task",
  "call_omo_agent",
  "task",
])

/**
 * 提醒信息内容
 * 当编排代理连续执行可委托工作时注入此信息
 */
const REMINDER_MESSAGE = `
[Category+Skill Reminder]

You are an orchestrator agent. Consider whether this work should be delegated:

**DELEGATE when:**
- UI/Frontend work → category: "visual-engineering", skills: ["frontend-ui-ux"]
- Complex logic/architecture → category: "ultrabrain"
- Quick/trivial tasks → category: "quick"
- Git operations → skills: ["git-master"]
- Browser automation → skills: ["playwright"] or ["agent-browser"]

**DO IT YOURSELF when:**
- Gathering context/exploring codebase
- Simple edits that are part of a larger task you're coordinating
- Tasks requiring your full context understanding

Example delegation:
\`\`\`
delegate_task(
  category="visual-engineering",
  load_skills=["frontend-ui-ux"],
  description="Implement responsive navbar with animations",
  run_in_background=true
)
\`\`\`
`

/** 工具执行输入接口 */
interface ToolExecuteInput {
  tool: string
  sessionID: string
  callID: string
  agent?: string
}

/** 工具执行输出接口 */
interface ToolExecuteOutput {
  title: string
  output: string
  metadata: unknown
}

/**
 * 会话状态接口
 * 跟踪每个会话的委托使用情况
 */
interface SessionState {
  /** 是否已使用委托工具 */
  delegationUsed: boolean
  /** 是否已显示提醒 */
  reminderShown: boolean
  /** 可委托工具调用次数 */
  toolCallCount: number
}

/**
 * 创建 Category+Skill 提醒钩子
 * 
 * 在 PostToolUse 阶段监控编排代理的工具使用情况，
 * 当检测到应该委托但未委托的模式时，注入提醒信息。
 * 
 * @param _ctx - 插件上下文（未使用）
 * @returns PostToolUse 和 Event 钩子对象
 */
export function createCategorySkillReminderHook(_ctx: PluginInput) {
  /** 会话状态存储 */
  const sessionStates = new Map<string, SessionState>()

  /**
   * 获取或创建会话状态
   * @param sessionID - 会话 ID
   * @returns 会话状态对象
   */
  function getOrCreateState(sessionID: string): SessionState {
    if (!sessionStates.has(sessionID)) {
      sessionStates.set(sessionID, {
        delegationUsed: false,
        reminderShown: false,
        toolCallCount: 0,
      })
    }
    return sessionStates.get(sessionID)!
  }

  /**
   * 检查是否为目标编排代理
   * @param sessionID - 会话 ID
   * @param inputAgent - 输入的代理名称（可选）
   * @returns 是否为目标代理
   */
  function isTargetAgent(sessionID: string, inputAgent?: string): boolean {
    const agent = getSessionAgent(sessionID) ?? inputAgent
    if (!agent) return false
    const agentLower = agent.toLowerCase()
    return TARGET_AGENTS.has(agentLower) || 
           agentLower.includes("sisyphus") || 
           agentLower.includes("atlas")
  }

  /**
   * PostToolUse 钩子处理函数
   * 监控工具调用并在必要时注入提醒
   */
  const toolExecuteAfter = async (
    input: ToolExecuteInput,
    output: ToolExecuteOutput,
  ) => {
    const { tool, sessionID } = input
    const toolLower = tool.toLowerCase()

    if (!isTargetAgent(sessionID, input.agent)) {
      return
    }

    const state = getOrCreateState(sessionID)

    if (DELEGATION_TOOLS.has(toolLower)) {
      state.delegationUsed = true
      log("[category-skill-reminder] Delegation tool used", { sessionID, tool })
      return
    }

    if (!DELEGATABLE_WORK_TOOLS.has(toolLower)) {
      return
    }

    state.toolCallCount++

    if (state.toolCallCount >= 3 && !state.delegationUsed && !state.reminderShown) {
      output.output += REMINDER_MESSAGE
      state.reminderShown = true
      log("[category-skill-reminder] Reminder injected", { 
        sessionID, 
        toolCallCount: state.toolCallCount 
      })
    }
  }

  /**
   * Event 钩子处理函数
   * 清理已删除或压缩会话的状态
   */
  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        sessionStates.delete(sessionInfo.id)
      }
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ??
        (props?.info as { id?: string } | undefined)?.id) as string | undefined
      if (sessionID) {
        sessionStates.delete(sessionID)
      }
    }
  }

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  }
}
