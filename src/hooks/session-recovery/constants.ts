/**
 * 会话恢复常量定义
 * 
 * 定义存储路径和部件类型集合
 */
import { join } from "node:path"
import { getOpenCodeStorageDir } from "../../shared/data-path"

/**
 * OpenCode存储根目录
 * 通常为 ~/.opencode/storage/
 */
export const OPENCODE_STORAGE = getOpenCodeStorageDir()

/**
 * 消息存储目录
 * 存储消息元数据：~/.opencode/storage/message/{sessionID}/{messageID}.json
 */
export const MESSAGE_STORAGE = join(OPENCODE_STORAGE, "message")

/**
 * 部件存储目录
 * 存储消息部件：~/.opencode/storage/part/{messageID}/{partID}.json
 */
export const PART_STORAGE = join(OPENCODE_STORAGE, "part")

/**
 * Thinking类型集合
 * 用于识别thinking相关的部件
 */
export const THINKING_TYPES = new Set(["thinking", "redacted_thinking", "reasoning"])

/**
 * 元数据类型集合
 * 用于识别步骤标记部件
 */
export const META_TYPES = new Set(["step-start", "step-finish"])

/**
 * 内容类型集合
 * 用于识别实际内容部件（非thinking、非元数据）
 */
export const CONTENT_TYPES = new Set(["text", "tool", "tool_use", "tool_result"])
