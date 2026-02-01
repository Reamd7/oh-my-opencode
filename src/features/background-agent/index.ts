/**
 * @fileoverview 后台代理系统 - 核心任务编排引擎
 * 
 * 这是 oh-my-opencode 的任务编排核心，负责：
 * 1. 后台任务生命周期管理（launch → poll → complete）
 * 2. 并发控制和资源管理
 * 3. 任务状态跟踪和进度监控
 * 4. 稳定性检测和自动清理
 * 
 * ## 核心组件
 * 
 * ### BackgroundManager
 * 后台任务管理器，提供以下功能：
 * - `launch()`: 启动新的后台任务
 * - `poll()`: 轮询任务状态（2秒间隔）
 * - `complete()`: 完成任务并清理资源
 * - `cancel()`: 取消正在运行的任务
 * 
 * ### ConcurrencyManager
 * 并发控制管理器，负责：
 * - 每个提供商/模型的并发限制
 * - 槽位分配和释放
 * - 队列管理和优先级调度
 * 
 * ## 使用示例
 * 
 * ```typescript
 * // 启动后台任务
 * const taskId = await backgroundManager.launch({
 *   description: "探索代码库",
 *   prompt: "找到所有React组件",
 *   agent: "explore",
 *   parentSessionID: session.id,
 *   parentMessageID: message.id
 * });
 * 
 * // 轮询任务状态
 * const status = await backgroundManager.poll(taskId);
 * 
 * // 获取任务结果
 * const result = await backgroundManager.complete(taskId);
 * ```
 * 
 * ## 配置
 * 
 * ```jsonc
 * {
 *   "background_tasks": {
 *     "concurrency_limits": {
 *       "anthropic/claude-opus-4-5": 3,
 *       "openai/gpt-5.2": 5
 *     },
 *     "stability_threshold": 3,  // 3次轮询无变化 = 空闲
 *     "poll_interval": 2000,     // 2秒轮询间隔
 *     "ttl": 1800000,            // 30分钟超时
 *     "stale_timeout": 180000    // 3分钟无响应超时
 *   }
 * }
 * ```
 * 
 * @module features/background-agent
 */

export * from "./types"
export { BackgroundManager } from "./manager"
export { ConcurrencyManager } from "./concurrency"
