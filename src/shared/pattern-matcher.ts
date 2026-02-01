/**
 * 模式匹配器 - Claude Code hooks的工具名称匹配
 * Pattern matcher - Tool name matching for Claude Code hooks
 * 
 * 功能:
 * - 支持通配符匹配 (*)
 * - 支持多模式匹配 (用 | 分隔)
 * - 大小写不敏感匹配
 * 
 * Features:
 * - Supports wildcard matching (*)
 * - Supports multiple patterns (separated by |)
 * - Case-insensitive matching
 * 
 * @module pattern-matcher
 */

import type { ClaudeHooksConfig, HookMatcher } from "../hooks/claude-code-hooks/types"

/**
 * 检查工具名称是否匹配模式
 * Check if tool name matches pattern
 * 
 * 支持的模式:
 * - "read" - 精确匹配
 * - "read|write" - 多个模式 (OR)
 * - "read*" - 通配符匹配
 * - "" - 空模式匹配所有
 * 
 * Supported patterns:
 * - "read" - Exact match
 * - "read|write" - Multiple patterns (OR)
 * - "read*" - Wildcard match
 * - "" - Empty pattern matches all
 * 
 * @param toolName - 要匹配的工具名称
 * @param matcher - 匹配模式字符串
 * @returns true 如果匹配
 */
export function matchesToolMatcher(toolName: string, matcher: string): boolean {
  if (!matcher) {
    return true
  }
  const patterns = matcher.split("|").map((p) => p.trim())
  return patterns.some((p) => {
    if (p.includes("*")) {
      const regex = new RegExp(`^${p.replace(/\*/g, ".*")}$`, "i")
      return regex.test(toolName)
    }
    return p.toLowerCase() === toolName.toLowerCase()
  })
}

/**
 * 查找匹配的hooks
 * Find matching hooks
 * 
 * @param config - Claude hooks配置
 * @param eventName - 事件名称 (如 "PreToolUse")
 * @param toolName - 可选的工具名称过滤
 * @returns 匹配的hook列表
 */
export function findMatchingHooks(
  config: ClaudeHooksConfig,
  eventName: keyof ClaudeHooksConfig,
  toolName?: string
): HookMatcher[] {
  const hookMatchers = config[eventName]
  if (!hookMatchers) return []

  return hookMatchers.filter((hookMatcher) => {
    if (!toolName) return true
    return matchesToolMatcher(toolName, hookMatcher.matcher)
  })
}
