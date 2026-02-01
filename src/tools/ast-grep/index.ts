/**
 * AST-grep - 基于AST的结构化代码搜索和替换
 * 
 * ## 功能概述
 * AST-grep使用抽象语法树进行代码搜索，比正则更精确，支持25种语言。
 * 
 * ## 核心工具
 * - **ast_grep_search**: 搜索代码模式
 * - **ast_grep_replace**: 替换代码模式（支持dry-run）
 * 
 * ## 模式语法
 * 使用meta-变量匹配代码：
 * - `$VAR`: 匹配单个节点
 * - `$$$`: 匹配多个节点
 * 
 * 示例：
 * - 搜索: `console.log($MSG)`
 * - 替换: `logger.info($MSG)`
 * 
 * ## 支持语言
 * JavaScript, TypeScript, Python, Java, Rust等25种
 * 
 * ## 使用场景
 * - 代码重构（安全的批量修改）
 * - 模式检测（找出特定代码结构）
 * - 代码质量检查
 */
import type { ToolDefinition } from "@opencode-ai/plugin"
import { ast_grep_search, ast_grep_replace } from "./tools"

export const builtinTools: Record<string, ToolDefinition> = {
  ast_grep_search,
  ast_grep_replace,
}

export { ast_grep_search, ast_grep_replace }
export { ensureAstGrepBinary, getCachedBinaryPath, getCacheDir } from "./downloader"
export { getAstGrepPath, isCliAvailable, ensureCliAvailable, startBackgroundInit } from "./cli"
export { checkEnvironment, formatEnvironmentCheck } from "./constants"
export type { EnvironmentCheckResult } from "./constants"
