/**
 * Ralph Loop 类型定义
 * 
 * RalphLoopState: 循环状态（持久化到文件）
 * - active: 循环是否激活
 * - iteration: 当前迭代次数
 * - max_iterations: 最大迭代限制
 * - completion_promise: 完成标记字符串（如"DONE"）
 * - started_at: 循环启动时间（ISO 8601）
 * - prompt: 原始任务提示
 * - session_id: 关联的会话ID
 * - ultrawork: 是否为ultrawork模式
 * 
 * RalphLoopOptions: 钩子配置选项
 * - config: Ralph Loop配置
 * - getTranscriptPath: 获取transcript文件路径的函数
 * - apiTimeout: API调用超时时间（毫秒）
 * - checkSessionExists: 检查会话是否存在的函数
 */

import type { RalphLoopConfig } from "../../config"

export interface RalphLoopState {
  active: boolean
  iteration: number
  max_iterations: number
  completion_promise: string
  started_at: string
  prompt: string
  session_id?: string
  ultrawork?: boolean
}

export interface RalphLoopOptions {
  config?: RalphLoopConfig
  getTranscriptPath?: (sessionId: string) => string
  apiTimeout?: number
  checkSessionExists?: (sessionId: string) => Promise<boolean>
}
