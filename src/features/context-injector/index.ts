/**
 * @fileoverview 上下文自动注入系统
 * 
 * 自动将项目知识库注入到代理上下文中：
 * - AGENTS.md: 项目架构和开发规范
 * - README.md: 项目说明和使用指南
 * - 条件规则: 基于文件类型的特定规则
 * 
 * @module features/context-injector
 */

export { ContextCollector, contextCollector } from "./collector"
export {
  createContextInjectorMessagesTransformHook,
} from "./injector"
export type {
  ContextSourceType,
  ContextPriority,
  ContextEntry,
  RegisterContextOptions,
  PendingContext,
  MessageContext,
  OutputParts,
  InjectionStrategy,
} from "./types"
