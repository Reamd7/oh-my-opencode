/**
 * @fileoverview 钩子消息注入器
 * 
 * 允许钩子向OpenCode消息流注入合成消息：
 * - 系统通知: 警告、提示、状态更新
 * - 上下文补充: 动态添加背景信息
 * - 代理通信: 跨会话消息传递
 * 
 * ## 核心功能
 * - 消息元数据继承: 自动从最近消息继承agent/model/tools
 * - 原子写入: 确保消息和部件同时写入
 * - 合成标记: synthetic=true标识非用户消息
 * 
 * ## 使用场景
 * - PreToolUse钩子注入警告
 * - PostToolUse钩子注入结果摘要
 * - UserPromptSubmit钩子注入上下文
 * 
 * @module features/hook-message-injector
 */

export { injectHookMessage, findNearestMessageWithFields, findFirstMessageWithAgent } from "./injector"
export type { StoredMessage } from "./injector"
export type { MessageMeta, OriginalMessageContext, TextPart, ToolPermission } from "./types"
export { MESSAGE_STORAGE } from "./constants"
