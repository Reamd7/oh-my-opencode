/**
 * 共享日志工具 - 用于插件的文件日志记录
 * Shared logging utility for the plugin
 * 
 * 日志文件位置: /tmp/oh-my-opencode.log
 * Log file location: /tmp/oh-my-opencode.log
 * 
 * 用途:
 * - 后台任务可见性 (16+ 模块使用)
 * - 调试插件行为
 * - 追踪异步操作
 * 
 * Usage:
 * - Background task visibility (used by 16+ modules)
 * - Debug plugin behavior
 * - Track async operations
 * 
 * @module logger
 */

import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const logFile = path.join(os.tmpdir(), "oh-my-opencode.log")

/**
 * 记录日志消息到文件
 * Log a message to the log file
 * 
 * @param message - 日志消息 / Log message
 * @param data - 可选的附加数据 (将被JSON序列化) / Optional additional data (will be JSON serialized)
 * 
 * @example
 * ```typescript
 * log("Background task started", { taskId: "123", agent: "sisyphus" })
 * // Output: [2026-01-29T10:30:00.000Z] Background task started {"taskId":"123","agent":"sisyphus"}
 * ```
 */
export function log(message: string, data?: unknown): void {
  try {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${message} ${data ? JSON.stringify(data) : ""}\n`
    fs.appendFileSync(logFile, logEntry)
  } catch {
    // 静默失败 - 日志不应该影响主流程
    // Fail silently - logging should not affect main flow
  }
}

/**
 * 获取日志文件路径
 * Get the log file path
 * 
 * @returns 日志文件的绝对路径 / Absolute path to the log file
 */
export function getLogFilePath(): string {
  return logFile
}
