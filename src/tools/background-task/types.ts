/**
 * 后台任务启动参数
 */
export interface BackgroundTaskArgs {
  /** 任务简短描述（显示在状态中） */
  description: string
  /** 完整的任务提示词 */
  prompt: string
  /** 要使用的代理类型 */
  agent: string
}

/**
 * 后台任务输出获取参数
 */
export interface BackgroundOutputArgs {
  /** 要获取输出的任务ID */
  task_id: string
  /** 是否等待任务完成（默认: false）。系统会自动通知完成，很少需要阻塞 */
  block?: boolean
  /** 最大等待时间（毫秒，默认: 60000，最大: 600000） */
  timeout?: number
}

/**
 * 后台任务取消参数
 */
export interface BackgroundCancelArgs {
  /** 要取消的任务ID（当all=false时必需） */
  taskId?: string
  /** 是否取消所有运行中的后台任务（默认: false） */
  all?: boolean
}
