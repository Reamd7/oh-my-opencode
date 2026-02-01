/**
 * 后台任务通知钩子 - 处理后台代理任务完成通知
 * Background notification hook - Handles background agent task completion notifications
 * 
 * 此钩子将事件路由到 BackgroundManager 进行处理
 * This hook routes events to BackgroundManager for processing
 * 
 * 通知机制：
 * Notification mechanism:
 * - 通知通过 session.prompt({ noReply }) 直接从 manager 发送 / Notifications sent directly via session.prompt({ noReply }) from manager
 * - 此钩子仅负责事件路由 / This hook only handles event routing
 * - 不阻塞主流程 / Does not block main flow
 * 
 * 通知格式：
 * Notification format:
 * - 任务完成状态 / Task completion status
 * - 任务输出摘要 / Task output summary
 * - session_id 用于恢复 / session_id for resumption
 * 
 * UI 集成：
 * UI integration:
 * - 通过 session.prompt 注入到对话流 / Injected into conversation flow via session.prompt
 * - noReply 标志防止 AI 响应通知 / noReply flag prevents AI from responding to notifications
 */
import type { BackgroundManager } from "../../features/background-agent"

interface Event {
  type: string
  properties?: Record<string, unknown>
}

interface EventInput {
  event: Event
}

/**
 * 创建后台通知钩子
 * Creates background notification hook
 * 
 * @param manager - 后台代理管理器实例 / Background agent manager instance
 * @returns 事件钩子对象 / Event hook object
 */
export function createBackgroundNotificationHook(manager: BackgroundManager) {
  const eventHandler = async ({ event }: EventInput) => {
    manager.handleEvent(event)
  }

  return {
    event: eventHandler,
  }
}

export type { BackgroundNotificationHookConfig } from "./types"
