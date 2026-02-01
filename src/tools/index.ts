/**
 * Oh My OpenCode 工具系统 - 主入口模块
 * 
 * 本模块是工具系统的桶导出（barrel export）入口，负责：
 * 1. 聚合所有内置工具的定义
 * 2. 导出工具工厂函数（用于需要上下文的工具）
 * 3. 提供统一的工具注册接口
 * 
 * ## 工具系统架构
 * 
 * Oh My OpenCode 提供 20+ 个专业工具，分为以下几类：
 * 
 * ### 1. 代码分析工具（LSP & AST）
 * - **LSP 工具**（6个）：基于语言服务器协议的精确代码分析
 *   - lsp_goto_definition: 跳转到定义
 *   - lsp_find_references: 查找所有引用
 *   - lsp_symbols: 获取符号列表（文档/工作区）
 *   - lsp_diagnostics: 获取诊断信息（错误/警告）
 *   - lsp_prepare_rename: 检查重命名可行性
 *   - lsp_rename: 跨文件重命名符号
 * 
 * - **AST-Grep 工具**（2个）：基于抽象语法树的结构化搜索
 *   - ast_grep_search: 使用 AST 模式搜索代码（支持 25 种语言）
 *   - ast_grep_replace: 使用 AST 模式替换代码（支持元变量）
 * 
 * ### 2. 文本搜索工具
 * - **grep**: 高性能文本搜索（60s 超时，10MB 输出限制）
 * - **glob**: 文件模式匹配（60s 超时，100 文件限制）
 * 
 * ### 3. 代理协调工具
 * - **delegate_task**: 基于类别的任务委托（路由到专业代理）
 * - **call_omo_agent**: 直接调用特定代理（explore/librarian）
 * - **background_output**: 获取后台任务输出
 * - **background_cancel**: 取消后台任务
 * 
 * ### 4. 会话管理工具
 * - **session_list**: 列出所有会话
 * - **session_read**: 读取会话消息
 * - **session_search**: 搜索会话内容
 * - **session_info**: 获取会话元数据
 * 
 * ### 5. 技能与扩展工具
 * - **skill**: 加载和执行内置技能
 * - **skill_mcp**: MCP 服务器集成（工具/资源/提示）
 * - **slashcommand**: 斜杠命令执行
 * 
 * ### 6. 系统工具
 * - **interactive_bash**: Tmux 交互式终端管理
 * - **look_at**: 多模态文件分析（PDF/图片）
 * 
 * ## 工具注册模式
 * 
 * ### 模式 1: 直接导出（Direct ToolDefinition）
 * 适用于无状态工具，直接导出 ToolDefinition 对象：
 * ```typescript
 * export const grep: ToolDefinition = tool({
 *   description: "...",
 *   args: { pattern: tool.schema.string() },
 *   execute: async (args) => result,
 * })
 * ```
 * 这些工具直接注册到 `builtinTools` 对象中。
 * 
 * ### 模式 2: 工厂函数（Factory Function）
 * 适用于需要上下文的工具（如 BackgroundManager、OpencodeClient）：
 * ```typescript
 * export function createDelegateTask(ctx, manager): ToolDefinition {
 *   return tool({ execute: async (args) => { // 使用 ctx } })
 * }
 * ```
 * 这些工具通过工厂函数创建，在插件初始化时注入依赖。
 * 
 * ## 命名约定
 * - 工具名称：snake_case（如 `lsp_goto_definition`）
 * - 工厂函数：camelCase（如 `createDelegateTask`）
 * - 目录名称：kebab-case（如 `delegate-task/`）
 */

// ============================================================================
// LSP 工具导入
// ============================================================================
// LSP（Language Server Protocol）工具提供精确的代码分析能力
// 这些工具直接与 TypeScript/JavaScript 语言服务器通信
import {
  lsp_goto_definition,    // 跳转到符号定义位置
  lsp_find_references,    // 查找符号的所有引用
  lsp_symbols,            // 获取文档或工作区的符号列表
  lsp_diagnostics,        // 获取诊断信息（错误、警告、提示）
  lsp_prepare_rename,     // 检查符号是否可以重命名
  lsp_rename,             // 跨文件重命名符号
  lspManager,             // LSP 客户端管理器（用于生命周期管理）
} from "./lsp"

// 导出 LSP 管理器供外部使用（如 hooks 中的生命周期管理）
export { lspManager }

// ============================================================================
// AST-Grep 工具导入
// ============================================================================
// AST-Grep 提供基于抽象语法树的结构化代码搜索和替换
// 支持 25 种编程语言，使用元变量（$VAR）进行模式匹配
import {
  ast_grep_search,   // 使用 AST 模式搜索代码
  ast_grep_replace,  // 使用 AST 模式替换代码（支持元变量重写）
} from "./ast-grep"

// ============================================================================
// 文本搜索工具导入
// ============================================================================
// 高性能文本搜索工具，用于快速定位代码片段
import { grep } from "./grep"  // 正则表达式文本搜索（60s 超时，10MB 输出限制）
import { glob } from "./glob"  // 文件模式匹配（60s 超时，100 文件限制）

// ============================================================================
// 斜杠命令工具导出
// ============================================================================
// 斜杠命令系统允许用户通过 `/command` 语法执行预定义的工作流
export { createSlashcommandTool, discoverCommandsSync } from "./slashcommand"

// ============================================================================
// 会话管理工具导入
// ============================================================================
// 会话管理工具提供对 OpenCode 会话历史的访问和搜索能力
import {
  session_list,    // 列出所有会话（支持日期过滤）
  session_read,    // 读取会话消息（支持 todos/transcript）
  session_search,  // 全文搜索会话内容
  session_info,    // 获取会话元数据和统计信息
} from "./session-manager"

// 导出会话存储工具函数
export { sessionExists } from "./session-manager/storage"

// ============================================================================
// 系统工具导出
// ============================================================================
// 交互式 Bash 工具（Tmux 集成）和多模态文件分析工具
export { interactive_bash, startBackgroundCheck as startTmuxCheck } from "./interactive-bash"

// ============================================================================
// 技能系统工具导出
// ============================================================================
// 技能系统允许加载和执行预定义的工作流和最佳实践
export { createSkillTool } from "./skill"        // 加载和执行技能
export { createSkillMcpTool } from "./skill-mcp" // MCP 服务器集成（工具/资源/提示）

// ============================================================================
// 后台任务工具导入
// ============================================================================
// 后台任务工具用于管理异步代理任务的生命周期
import {
  createBackgroundOutput,  // 获取后台任务的输出结果
  createBackgroundCancel,  // 取消正在运行的后台任务
} from "./background-task"

// ============================================================================
// 类型导入
// ============================================================================
import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../features/background-agent"

type OpencodeClient = PluginInput["client"]

// ============================================================================
// 代理协调工具导出
// ============================================================================
// 这些工具使用工厂模式，因为它们需要运行时上下文（BackgroundManager、OpencodeClient）
export { createCallOmoAgent } from "./call-omo-agent"  // 直接调用 explore/librarian 代理
export { createLookAt } from "./look-at"                // 多模态文件分析（PDF/图片）
export { createDelegateTask } from "./delegate-task"    // 基于类别的任务委托

// ============================================================================
// 后台任务工具工厂函数
// ============================================================================
/**
 * 创建后台任务管理工具
 * 
 * 这些工具需要 BackgroundManager 和 OpencodeClient 实例，
 * 因此使用工厂函数模式在插件初始化时创建。
 * 
 * @param manager - 后台任务管理器实例
 * @param client - OpenCode 客户端实例
 * @returns 包含 background_output 和 background_cancel 的工具对象
 */
export function createBackgroundTools(manager: BackgroundManager, client: OpencodeClient): Record<string, ToolDefinition> {
  return {
    background_output: createBackgroundOutput(manager, client),
    background_cancel: createBackgroundCancel(manager, client),
  }
}

// ============================================================================
// 内置工具注册表
// ============================================================================
/**
 * 内置工具注册表
 * 
 * 这个对象包含所有无状态工具的定义，这些工具可以直接注册到插件中。
 * 
 * ## 工具分类：
 * 
 * ### LSP 工具（6个）
 * - lsp_goto_definition: 跳转到定义
 * - lsp_find_references: 查找引用
 * - lsp_symbols: 符号列表
 * - lsp_diagnostics: 诊断信息
 * - lsp_prepare_rename: 重命名检查
 * - lsp_rename: 重命名符号
 * 
 * ### AST-Grep 工具（2个）
 * - ast_grep_search: AST 搜索
 * - ast_grep_replace: AST 替换
 * 
 * ### 文本搜索工具（2个）
 * - grep: 正则搜索
 * - glob: 文件匹配
 * 
 * ### 会话管理工具（4个）
 * - session_list: 列出会话
 * - session_read: 读取会话
 * - session_search: 搜索会话
 * - session_info: 会话信息
 * 
 * ## 注意事项：
 * - 需要上下文的工具（如 delegate_task、call_omo_agent）不在此列表中
 * - 这些工具通过工厂函数在插件初始化时创建
 * - 所有工具都使用 Zod schema 进行参数验证
 */
export const builtinTools: Record<string, ToolDefinition> = {
  // LSP 工具
  lsp_goto_definition,
  lsp_find_references,
  lsp_symbols,
  lsp_diagnostics,
  lsp_prepare_rename,
  lsp_rename,
  
  // AST-Grep 工具
  ast_grep_search,
  ast_grep_replace,
  
  // 文本搜索工具
  grep,
  glob,
  
  // 会话管理工具
  session_list,
  session_read,
  session_search,
  session_info,
}
