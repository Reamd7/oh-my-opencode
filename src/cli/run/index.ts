/**
 * CLI运行命令
 * 
 * ## 功能
 * 启动OpenCode会话并执行任务，强制Todo完成
 * 
 * ## 特性
 * - 自动创建OpenCode会话
 * - 发送用户提示并等待完成
 * - 监控Todo列表完成状态
 * - 会话错误时自动退出
 * - 支持超时控制
 * - 支持自定义服务器端口（OPENCODE_SERVER_PORT）
 * 
 * ## 使用
 * ```bash
 * bunx oh-my-opencode run "实现用户登录功能"
 * bunx oh-my-opencode run "修复bug #123" --timeout=3600000
 * ```
 * 
 * ## 工作流程
 * 1. 启动OpenCode服务器
 * 2. 创建会话（带重试机制）
 * 3. 发送用户提示
 * 4. 轮询会话状态
 * 5. 检查Todo完成条件
 * 6. 所有任务完成后退出
 */
export { run } from "./runner"
export type { RunOptions, RunContext } from "./types"
