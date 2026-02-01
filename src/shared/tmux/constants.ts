/**
 * Tmux 后台 session 状态检查的轮询间隔（毫秒）
 * 用于定期检查后台 agent session 是否仍在运行
 */
export const POLL_INTERVAL_BACKGROUND_MS = 2000

/**
 * Session 超时时间（毫秒）
 * 超过此时间无活动的 session 将被视为过期
 */
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Session 丢失后的宽限期（毫秒）
 * 在此期间内 session 可能恢复，超过后将执行清理
 */
export const SESSION_MISSING_GRACE_MS = 6000

/**
 * Session 就绪状态轮询间隔（毫秒）
 * 创建新 session 后等待其就绪的检查频率
 */
export const SESSION_READY_POLL_INTERVAL_MS = 500

/**
 * Session 就绪等待超时（毫秒）
 * 超过此时间 session 仍未就绪则认为启动失败
 */
export const SESSION_READY_TIMEOUT_MS = 10_000
