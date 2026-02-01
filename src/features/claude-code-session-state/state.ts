/**
 * Claude Code 会话状态管理
 * 
 * ## 功能
 * 持久化子代理的 session_id 和状态，确保代理会话可以跨会话恢复
 * 
 * ## 作用
 * - 跟踪主会话和子代理会话
 * - 维护会话到代理的映射关系
 * - 支持会话恢复和清理
 * 
 * ## 存储位置
 * 内存存储（Set 和 Map），不持久化到文件系统
 * 
 * ## 使用场景
 * - 后台代理任务管理
 * - 子代理会话跟踪
 * - 会话生命周期管理
 */

// 子代理会话集合
export const subagentSessions = new Set<string>()

// 主会话ID（当前活动的主会话）
let _mainSessionID: string | undefined

export function setMainSession(id: string | undefined) {
  _mainSessionID = id
}

export function getMainSessionID(): string | undefined {
  return _mainSessionID
}

/** @internal For testing only */
export function _resetForTesting(): void {
  _mainSessionID = undefined
  subagentSessions.clear()
  sessionAgentMap.clear()
}

// 会话到代理的映射表（sessionID -> agentName）
const sessionAgentMap = new Map<string, string>()

/**
 * 设置会话的代理（仅在首次设置时生效）
 * 用于初始化会话时绑定代理
 */
export function setSessionAgent(sessionID: string, agent: string): void {
  if (!sessionAgentMap.has(sessionID)) {
    sessionAgentMap.set(sessionID, agent)
  }
}

/**
 * 更新会话的代理（强制覆盖）
 * 用于会话切换代理时更新映射
 */
export function updateSessionAgent(sessionID: string, agent: string): void {
  sessionAgentMap.set(sessionID, agent)
}

/**
 * 获取会话关联的代理名称
 */
export function getSessionAgent(sessionID: string): string | undefined {
  return sessionAgentMap.get(sessionID)
}

/**
 * 清除会话的代理映射
 * 用于会话结束时清理资源
 */
export function clearSessionAgent(sessionID: string): void {
  sessionAgentMap.delete(sessionID)
}
