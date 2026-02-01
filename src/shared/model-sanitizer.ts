/**
 * 命令来源类型
 * Command source type
 * 
 * - claude-code: 来自Claude Code的命令（不应包含model字段）
 * - opencode: 来自OpenCode的命令（可以包含model字段）
 */
type CommandSource = "claude-code" | "opencode"

/**
 * 清理模型字段
 * Sanitize model field
 * 
 * 为什么需要这个函数？(Why this function?)
 * - Claude Code的命令不应该包含model字段（由系统自动选择）
 * - OpenCode的命令可以显式指定model
 * - 确保类型安全和数据一致性
 * 
 * @param model - 模型字段值（可能是任意类型）
 * @param source - 命令来源（默认为claude-code）
 * @returns 清理后的模型名称，如果不应该包含则返回undefined
 */
export function sanitizeModelField(model: unknown, source: CommandSource = "claude-code"): string | undefined {
  // Claude Code命令不应包含model字段
  // Claude Code commands should not contain model field
  if (source === "claude-code") {
    return undefined
  }
  
  // OpenCode命令可以包含有效的model字符串
  // OpenCode commands can contain valid model string
  if (typeof model === "string" && model.trim().length > 0) {
    return model.trim()
  }
  return undefined
}
