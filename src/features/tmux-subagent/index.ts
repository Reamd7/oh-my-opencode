/**
 * @fileoverview Tmux子代理系统
 * 
 * 支持交互式后台会话和窗格管理：
 * - 窗格布局管理 (main-vertical, main-horizontal等)
 * - 会话状态查询
 * - 决策引擎: 自动选择最佳窗格
 * - 动作执行器: 执行tmux命令
 * 
 * @module features/tmux-subagent
 */

export * from "./manager"
export * from "./types"
export * from "./pane-state-querier"
export * from "./decision-engine"
export * from "./action-executor"
