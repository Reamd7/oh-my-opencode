/**
 * background-task - 后台任务管理工具
 * 
 * ## 功能概述
 * 管理异步后台任务的生命周期，支持并行执行和结果收集。
 * 
 * ## 核心工具
 * - **background_output**: 获取后台任务结果
 * - **background_cancel**: 取消后台任务
 * 
 * ## 使用流程
 * 1. delegate_task(background=true) → 返回task_id
 * 2. 继续其他工作
 * 3. background_output(task_id) → 收集结果
 * 4. （可选）background_cancel(task_id) → 取消任务
 * 
 * ## 并行策略
 * - 支持10+个并行任务
 * - 自动通知任务完成
 * - 避免阻塞主流程
 * 
 * ## 状态管理
 * - pending: 等待执行
 * - running: 执行中
 * - completed: 已完成
 * - cancelled: 已取消
 * - failed: 执行失败
 */

export {
  createBackgroundOutput,
  createBackgroundCancel,
} from "./tools"

export type * from "./types"
export * from "./constants"
