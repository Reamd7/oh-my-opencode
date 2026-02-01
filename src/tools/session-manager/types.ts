/**
 * 会话消息结构
 * 
 * 表示一条完整的对话消息（用户或助手）。
 * 每条消息可以包含多个部分（文本、思考、工具调用等）。
 */
export interface SessionMessage {
  /** 消息唯一标识符 */
  id: string
  /** 消息角色：用户或助手 */
  role: "user" | "assistant"
  /** 代理名称（如果是助手消息） */
  agent?: string
  /** 时间戳信息 */
  time?: {
    created: number
    updated?: number
  }
  /** 消息部分数组 */
  parts: MessagePart[]
}

/**
 * 消息部分结构
 * 
 * 消息的组成单元，可以是文本、思考过程、工具调用或工具结果。
 * 这种分段设计允许精细控制消息的不同组成部分。
 */
export interface MessagePart {
  /** 部分唯一标识符 */
  id: string
  /** 部分类型：text, thinking, tool_use, tool_result 等 */
  type: string
  /** 文本内容（type=text） */
  text?: string
  /** 思考内容（type=thinking） */
  thinking?: string
  /** 工具名称（type=tool_use） */
  tool?: string
  /** 工具调用 ID */
  callID?: string
  /** 工具输入参数（type=tool_use） */
  input?: Record<string, unknown>
  /** 工具输出结果（type=tool_result） */
  output?: string
  /** 错误信息（type=tool_result） */
  error?: string
}

/**
 * 会话信息摘要
 * 
 * 包含会话的元数据和统计信息，不包含完整消息内容。
 * 用于快速浏览和筛选会话。
 */
export interface SessionInfo {
  /** 会话 ID */
  id: string
  /** 消息总数 */
  message_count: number
  /** 第一条消息时间 */
  first_message?: Date
  /** 最后一条消息时间 */
  last_message?: Date
  /** 使用的代理列表 */
  agents_used: string[]
  /** 是否有 Todo 列表 */
  has_todos: boolean
  /** 是否有 Transcript 日志 */
  has_transcript: boolean
  /** Todo 列表（如果有） */
  todos?: TodoItem[]
  /** Transcript 条目数（如果有） */
  transcript_entries?: number
}

/**
 * Todo 项目结构
 * 
 * 表示会话中的一个任务项。
 */
export interface TodoItem {
  /** Todo ID */
  id: string
  /** 任务内容描述 */
  content: string
  /** 任务状态 */
  status: "pending" | "in_progress" | "completed" | "cancelled"
  /** 优先级（可选） */
  priority?: string
}

/**
 * 搜索结果结构
 * 
 * 表示一个搜索匹配项，包含匹配的消息和上下文摘录。
 */
export interface SearchResult {
  /** 会话 ID */
  session_id: string
  /** 消息 ID */
  message_id: string
  /** 消息角色 */
  role: string
  /** 匹配上下文摘录（前后各 50 字符） */
  excerpt: string
  /** 匹配次数 */
  match_count: number
  /** 消息时间戳 */
  timestamp?: number
}

export interface SessionMetadata {
  id: string
  version?: string
  projectID: string
  directory: string
  title?: string
  parentID?: string
  time: {
    created: number
    updated: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
}

export interface SessionListArgs {
  limit?: number
  offset?: number
  from_date?: string
  to_date?: string
  project_path?: string
}

export interface SessionReadArgs {
  session_id: string
  include_todos?: boolean
  include_transcript?: boolean
  limit?: number
}

export interface SessionSearchArgs {
  query: string
  session_id?: string
  case_sensitive?: boolean
  limit?: number
}

export interface SessionInfoArgs {
  session_id: string
}

export interface SessionDeleteArgs {
  session_id: string
  confirm: boolean
}
