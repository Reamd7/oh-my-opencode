/**
 * 会话恢复类型定义
 * 
 * 定义持久化存储的消息和部件结构
 * 这些类型对应OpenCode存储在 ~/.opencode/storage/ 中的JSON文件格式
 */

/**
 * Thinking部件类型
 * - thinking: 标准thinking块
 * - redacted_thinking: 已编辑的thinking块
 * - reasoning: 推理块（某些模型使用）
 */
export type ThinkingPartType = "thinking" | "redacted_thinking" | "reasoning"

/**
 * 元数据部件类型
 * - step-start: 步骤开始标记
 * - step-finish: 步骤完成标记
 */
export type MetaPartType = "step-start" | "step-finish"

/**
 * 内容部件类型
 * - text: 文本内容
 * - tool: 工具调用（存储格式）
 * - tool_use: 工具调用（API格式）
 * - tool_result: 工具结果
 */
export type ContentPartType = "text" | "tool" | "tool_use" | "tool_result"

/**
 * 存储的消息元数据
 * 对应 ~/.opencode/storage/message/{sessionID}/{messageID}.json
 */
export interface StoredMessageMeta {
  /** 消息ID */
  id: string
  /** 会话ID */
  sessionID: string
  /** 角色：用户或助手 */
  role: "user" | "assistant"
  /** 父消息ID（用于消息链） */
  parentID?: string
  /** 时间戳 */
  time?: {
    /** 创建时间 */
    created: number
    /** 完成时间 */
    completed?: number
  }
  /** 错误信息（如果消息失败） */
  error?: unknown
}

/**
 * 存储的文本部件
 * 对应 ~/.opencode/storage/part/{messageID}/{partID}.json
 */
export interface StoredTextPart {
  /** 部件ID */
  id: string
  /** 会话ID */
  sessionID: string
  /** 消息ID */
  messageID: string
  /** 部件类型 */
  type: "text"
  /** 文本内容 */
  text: string
  /** 是否为合成内容（恢复时注入的占位符） */
  synthetic?: boolean
  /** 是否被忽略 */
  ignored?: boolean
}

/**
 * 存储的工具部件
 * 对应 ~/.opencode/storage/part/{messageID}/{partID}.json
 */
export interface StoredToolPart {
  /** 部件ID */
  id: string
  /** 会话ID */
  sessionID: string
  /** 消息ID */
  messageID: string
  /** 部件类型 */
  type: "tool"
  /** 工具调用ID */
  callID: string
  /** 工具名称 */
  tool: string
  /** 工具状态 */
  state: {
    /** 执行状态 */
    status: "pending" | "running" | "completed" | "error"
    /** 输入参数 */
    input: Record<string, unknown>
    /** 输出结果 */
    output?: string
    /** 错误信息 */
    error?: string
  }
}

/**
 * 存储的推理部件
 * 对应 ~/.opencode/storage/part/{messageID}/{partID}.json
 */
export interface StoredReasoningPart {
  /** 部件ID */
  id: string
  /** 会话ID */
  sessionID: string
  /** 消息ID */
  messageID: string
  /** 部件类型 */
  type: "reasoning"
  /** 推理内容 */
  text: string
}

/**
 * 存储的步骤部件
 * 对应 ~/.opencode/storage/part/{messageID}/{partID}.json
 */
export interface StoredStepPart {
  /** 部件ID */
  id: string
  /** 会话ID */
  sessionID: string
  /** 消息ID */
  messageID: string
  /** 部件类型 */
  type: "step-start" | "step-finish"
}

/**
 * 存储的部件联合类型
 * 包含所有可能的部件类型
 */
export type StoredPart = StoredTextPart | StoredToolPart | StoredReasoningPart | StoredStepPart | {
  id: string
  sessionID: string
  messageID: string
  type: string
  [key: string]: unknown
}

/**
 * 消息数据（从API获取）
 * 包含消息元信息和部件列表
 */
export interface MessageData {
  /** 消息元信息 */
  info?: {
    /** 消息ID */
    id?: string
    /** 角色 */
    role?: string
    /** 会话ID */
    sessionID?: string
    /** 父消息ID */
    parentID?: string
    /** 错误信息 */
    error?: unknown
    /** 使用的代理 */
    agent?: string
    /** 使用的模型 */
    model?: {
      providerID: string
      modelID: string
    }
    /** 系统提示 */
    system?: string
    /** 可用工具 */
    tools?: Record<string, boolean>
  }
  /** 消息部件列表 */
  parts?: Array<{
    type: string
    id?: string
    text?: string
    thinking?: string
    name?: string
    input?: Record<string, unknown>
    callID?: string
  }>
}

/**
 * 恢复配置
 * 用于在修复错误后恢复会话
 */
export interface ResumeConfig {
  /** 会话ID */
  sessionID: string
  /** 代理名称（保持与原会话一致） */
  agent?: string
  /** 模型配置（保持与原会话一致） */
  model?: {
    providerID: string
    modelID: string
  }
}
