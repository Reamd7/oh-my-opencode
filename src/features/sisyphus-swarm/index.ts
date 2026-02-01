/**
 * @fileoverview Sisyphus代理群 - 邮箱通信系统
 * 
 * 代理间异步消息传递机制，支持多种协议消息：
 * - 权限请求/响应: permission_request/permission_response
 * - 任务分配/完成: task_assignment/task_completed
 * - 团队管理: join_request/join_approved/join_rejected
 * - 计划审批: plan_approval_request/plan_approval_response
 * - 关闭请求: shutdown_request/shutdown_approved/shutdown_rejected
 * 
 * ## 存储位置
 * - 默认: .sisyphus/teams/{teamName}/inboxes/{agentName}.json
 * - Claude Code兼容: ~/.claude/teams/
 * 
 * ## 核心功能
 * - 邮箱系统: 每个代理独立收件箱
 * - 协议消息: 类型安全的消息格式
 * - 已读标记: 消息状态追踪
 * 
 * ## 使用场景
 * - 多代理协作: 任务分配和状态同步
 * - 权限管理: 跨代理权限请求
 * - 团队协调: 代理加入和退出
 * 
 * @module features/sisyphus-swarm
 */

export * from "./mailbox/types"
