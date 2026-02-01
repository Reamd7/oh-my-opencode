/**
 * 上下文注入源标识符
 * 每个源注册的上下文将被合并并一起注入
 * 
 * Source identifier for context injection
 * Each source registers context that will be merged and injected together
 */
export type ContextSourceType =
  | "keyword-detector"    // 关键词检测器
  | "rules-injector"      // 规则注入器
  | "directory-agents"    // 目录AGENTS.md
  | "directory-readme"    // 目录README.md
  | "custom"              // 自定义源

/**
 * 上下文优先级
 * 高优先级的上下文会出现在合并输出的前面
 * 
 * Priority levels for context ordering
 * Higher priority contexts appear first in the merged output
 */
export type ContextPriority = "critical" | "high" | "normal" | "low"

/**
 * 单个上下文条目
 * 
 * A single context entry registered by a source
 */
export interface ContextEntry {
  /** 条目唯一标识符 | Unique identifier for this entry within the source */
  id: string
  /** 注册此上下文的源 | The source that registered this context */
  source: ContextSourceType
  /** 要注入的实际内容 | The actual context content to inject */
  content: string
  /** 排序优先级（默认：normal）| Priority for ordering (default: normal) */
  priority: ContextPriority
  /** 注册时间戳 | Timestamp when registered */
  timestamp: number
  /** 可选元数据（用于调试/日志）| Optional metadata for debugging/logging */
  metadata?: Record<string, unknown>
}

/**
 * 注册上下文的选项
 * 
 * Options for registering context
 */
export interface RegisterContextOptions {
  /** 上下文条目唯一ID（用于去重）| Unique ID for this context entry (used for deduplication) */
  id: string
  /** 源标识符 | Source identifier */
  source: ContextSourceType
  /** 要注入的内容 | The content to inject */
  content: string
  /** 排序优先级（默认：normal）| Priority for ordering (default: normal) */
  priority?: ContextPriority
  /** 可选元数据 | Optional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Result of getting pending context for a session
 */
export interface PendingContext {
  /** Merged context string, ready for injection */
  merged: string
  /** Individual entries that were merged */
  entries: ContextEntry[]
  /** Whether there's any content to inject */
  hasContent: boolean
}

/**
 * Message context from the original user message
 * Used when injecting to match the message format
 */
export interface MessageContext {
  agent?: string
  model?: {
    providerID?: string
    modelID?: string
  }
  path?: {
    cwd?: string
    root?: string
  }
  tools?: Record<string, boolean>
}

/**
 * Output parts from chat.message hook
 */
export interface OutputParts {
  parts: Array<{ type: string; text?: string; [key: string]: unknown }>
}

/**
 * Injection strategy
 */
export type InjectionStrategy = "prepend-parts" | "storage" | "auto"
