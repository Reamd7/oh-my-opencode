/**
 * @fileoverview 任务通知管理器
 * 
 * UI通知系统，实时显示后台任务状态：
 * - 任务启动通知: 显示新任务信息
 * - 任务列表: 展示所有运行中和排队中的任务
 * - 任务完成通知: 显示完成时间和剩余任务
 * 
 * ## 核心功能
 * - 并发可视化: 显示当前运行/排队任务数量
 * - 时长追踪: 实时显示任务运行时长
 * - 模型回退提示: 标记使用回退模型的任务
 * 
 * ## 通知类型
 * - [BG]: 后台任务运行中
 * - [RUN]: 前台任务运行中
 * - [Q]: 后台任务排队中
 * - [W]: 前台任务等待中
 * 
 * @module features/task-toast-manager
 */

export { TaskToastManager, getTaskToastManager, initTaskToastManager } from "./manager"
export type { TrackedTask, TaskStatus, TaskToastOptions, ModelFallbackInfo } from "./types"
