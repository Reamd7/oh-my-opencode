/**
 * 轮询间隔（毫秒）
 * 
 * 控制检查任务状态的频率。
 * 默认 500ms，在性能和响应速度之间取得平衡。
 */
let POLL_INTERVAL_MS = 500

/**
 * 最小稳定时间（毫秒）
 * 
 * 在开始检查消息稳定性之前必须等待的最短时间。
 * 默认 10 秒，避免过早判断任务完成。
 */
let MIN_STABILITY_TIME_MS = 10000

/**
 * 稳定性轮询要求次数
 * 
 * 消息数量需要连续保持不变的轮询次数，才认为任务真正完成。
 * 默认 3 次，确保结果稳定。
 */
let STABILITY_POLLS_REQUIRED = 3

/**
 * 等待会话启动的轮询间隔（毫秒）
 * 
 * 后台任务启动后，等待 sessionID 被设置的轮询间隔。
 * 默认 100ms，快速响应。
 */
let WAIT_FOR_SESSION_INTERVAL_MS = 100

/**
 * 等待会话启动的超时时间（毫秒）
 * 
 * 如果在此时间内 sessionID 仍未设置，则认为任务启动失败。
 * 默认 30 秒。
 */
let WAIT_FOR_SESSION_TIMEOUT_MS = 30000

/**
 * 最大轮询时间（毫秒）
 * 
 * 轮询任务完成的最长等待时间。
 * 默认 10 分钟，超时后返回当前结果。
 */
let MAX_POLL_TIME_MS = 10 * 60 * 1000

/**
 * 会话继续的稳定性等待时间（毫秒）
 * 
 * 继续已有会话时，在开始检查稳定性之前等待的时间。
 * 默认 5 秒，比新会话更短因为上下文已存在。
 */
let SESSION_CONTINUATION_STABILITY_MS = 5000

/**
 * 获取当前的时间配置
 * 
 * @returns 包含所有时间配置参数的对象
 */
export function getTimingConfig() {
  return {
    POLL_INTERVAL_MS,
    MIN_STABILITY_TIME_MS,
    STABILITY_POLLS_REQUIRED,
    WAIT_FOR_SESSION_INTERVAL_MS,
    WAIT_FOR_SESSION_TIMEOUT_MS,
    MAX_POLL_TIME_MS,
    SESSION_CONTINUATION_STABILITY_MS,
  }
}

export function __resetTimingConfig(): void {
  POLL_INTERVAL_MS = 500
  MIN_STABILITY_TIME_MS = 10000
  STABILITY_POLLS_REQUIRED = 3
  WAIT_FOR_SESSION_INTERVAL_MS = 100
  WAIT_FOR_SESSION_TIMEOUT_MS = 30000
  MAX_POLL_TIME_MS = 10 * 60 * 1000
  SESSION_CONTINUATION_STABILITY_MS = 5000
}

export function __setTimingConfig(overrides: Partial<ReturnType<typeof getTimingConfig>>): void {
  if (overrides.POLL_INTERVAL_MS !== undefined) POLL_INTERVAL_MS = overrides.POLL_INTERVAL_MS
  if (overrides.MIN_STABILITY_TIME_MS !== undefined) MIN_STABILITY_TIME_MS = overrides.MIN_STABILITY_TIME_MS
  if (overrides.STABILITY_POLLS_REQUIRED !== undefined) STABILITY_POLLS_REQUIRED = overrides.STABILITY_POLLS_REQUIRED
  if (overrides.WAIT_FOR_SESSION_INTERVAL_MS !== undefined) WAIT_FOR_SESSION_INTERVAL_MS = overrides.WAIT_FOR_SESSION_INTERVAL_MS
  if (overrides.WAIT_FOR_SESSION_TIMEOUT_MS !== undefined) WAIT_FOR_SESSION_TIMEOUT_MS = overrides.WAIT_FOR_SESSION_TIMEOUT_MS
  if (overrides.MAX_POLL_TIME_MS !== undefined) MAX_POLL_TIME_MS = overrides.MAX_POLL_TIME_MS
  if (overrides.SESSION_CONTINUATION_STABILITY_MS !== undefined) SESSION_CONTINUATION_STABILITY_MS = overrides.SESSION_CONTINUATION_STABILITY_MS
}
