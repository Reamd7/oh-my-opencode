/**
 * 后台任务状态
 * - pending: 等待中（等待并发槽位）
 * - running: 运行中
 * - completed: 已完成
 * - error: 错误
 * - cancelled: 已取消
 */
export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "error"
  | "cancelled"

/**
 * 任务进度信息
 */
export interface TaskProgress {
  /** 工具调用次数 */
  toolCalls: number
  /** 最后调用的工具名称 */
  lastTool?: string
  /** 最后更新时间 */
  lastUpdate: Date
  /** 最后的消息内容 */
  lastMessage?: string
  /** 最后消息时间 */
  lastMessageAt?: Date
}

/**
 * 后台任务完整信息
 */
export interface BackgroundTask {
  /** 任务唯一ID */
  id: string
  /** 任务会话ID（启动后分配） */
  sessionID?: string
  /** 父会话ID */
  parentSessionID: string
  /** 父消息ID */
  parentMessageID: string
  /** 任务描述 */
  description: string
  /** 任务提示词 */
  prompt: string
  /** 代理名称 */
  agent: string
  /** 任务状态 */
  status: BackgroundTaskStatus
  /** 入队时间 */
  queuedAt?: Date
  /** 开始时间 */
  startedAt?: Date
  /** 完成时间 */
  completedAt?: Date
  /** 任务结果 */
  result?: string
  /** 错误信息 */
  error?: string
  /** 进度信息 */
  progress?: TaskProgress
  /** 父会话的模型信息 */
  parentModel?: { providerID: string; modelID: string }
  /** 任务使用的模型信息 */
  model?: { providerID: string; modelID: string; variant?: string }
  /** 活动并发槽位键 */
  concurrencyKey?: string
  /** 持久化并发组键（用于恢复时重新获取槽位） */
  concurrencyGroup?: string
  /** 父会话的代理名称（用于通知） */
  parentAgent?: string

  /** 最后消息数（用于稳定性检测） */
  lastMsgCount?: number
  /** 连续稳定轮询次数（消息数不变） */
  stablePolls?: number
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
  parentMessageID: string
  parentModel?: { providerID: string; modelID: string }
  parentAgent?: string
  model?: { providerID: string; modelID: string; variant?: string }
  skills?: string[]
  skillContent?: string
}

export interface ResumeInput {
  sessionId: string
  prompt: string
  parentSessionID: string
  parentMessageID: string
  parentModel?: { providerID: string; modelID: string }
  parentAgent?: string
}
