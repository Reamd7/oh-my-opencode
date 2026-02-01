/**
 * LSP工具定义 - 6个核心LSP操作
 * 
 * 提供代码智能分析的工具接口：
 * - lsp_goto_definition: 跳转到定义
 * - lsp_find_references: 查找所有引用
 * - lsp_symbols: 符号搜索（文档/工作区）
 * - lsp_diagnostics: 错误和警告诊断
 * - lsp_prepare_rename: 重命名前验证
 * - lsp_rename: 跨文件重命名
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import {
  DEFAULT_MAX_REFERENCES,
  DEFAULT_MAX_SYMBOLS,
  DEFAULT_MAX_DIAGNOSTICS,
} from "./constants"
import {
  withLspClient,
  formatLocation,
  formatDocumentSymbol,
  formatSymbolInfo,
  formatDiagnostic,
  filterDiagnosticsBySeverity,
  formatPrepareRenameResult,
  applyWorkspaceEdit,
  formatApplyResult,
} from "./utils"
import type {
  Location,
  LocationLink,
  DocumentSymbol,
  SymbolInfo,
  Diagnostic,
  PrepareRenameResult,
  PrepareRenameDefaultBehavior,
  WorkspaceEdit,
} from "./types"

/**
 * 跳转到定义
 * 
 * 使用场景：
 * - 查找函数/类/变量的定义位置
 * - 代码导航和理解
 * 
 * 示例：
 * - 光标在函数调用上 -> 跳转到函数定义
 * - 光标在import上 -> 跳转到模块定义
 */
export const lsp_goto_definition: ToolDefinition = tool({
  description: "Jump to symbol definition. Find WHERE something is defined.",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("1-based"),
    character: tool.schema.number().min(0).describe("0-based"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.definition(args.filePath, args.line, args.character)) as
          | Location
          | Location[]
          | LocationLink[]
          | null
      })

      if (!result) {
        const output = "No definition found"
        return output
      }

      const locations = Array.isArray(result) ? result : [result]
      if (locations.length === 0) {
        const output = "No definition found"
        return output
      }

      const output = locations.map(formatLocation).join("\n")
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

/**
 * 查找所有引用
 * 
 * 使用场景：
 * - 重构前分析影响范围
 * - 查找函数/变量的所有使用位置
 * - 代码审查和理解
 * 
 * 示例：
 * - 重命名前查看所有引用位置
 * - 删除函数前确认无引用
 */
export const lsp_find_references: ToolDefinition = tool({
  description: "Find ALL usages/references of a symbol across the entire workspace.",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("1-based"),
    character: tool.schema.number().min(0).describe("0-based"),
    includeDeclaration: tool.schema.boolean().optional().describe("Include the declaration itself"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.references(args.filePath, args.line, args.character, args.includeDeclaration ?? true)) as
          | Location[]
          | null
      })

      if (!result || result.length === 0) {
        const output = "No references found"
        return output
      }

      const total = result.length
      const truncated = total > DEFAULT_MAX_REFERENCES
      const limited = truncated ? result.slice(0, DEFAULT_MAX_REFERENCES) : result
      const lines = limited.map(formatLocation)
      if (truncated) {
        lines.unshift(`Found ${total} references (showing first ${DEFAULT_MAX_REFERENCES}):`)
      }
      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

/**
 * 符号搜索
 * 
 * 两种模式：
 * - document: 获取文件大纲（所有符号）
 * - workspace: 跨项目搜索符号
 * 
 * 使用场景：
 * - 快速查找类/函数/变量
 * - 生成文件大纲
 * - 代码导航
 */
export const lsp_symbols: ToolDefinition = tool({
  description: "Get symbols from file (document) or search across workspace. Use scope='document' for file outline, scope='workspace' for project-wide symbol search.",
  args: {
    filePath: tool.schema.string().describe("File path for LSP context"),
    scope: tool.schema.enum(["document", "workspace"]).default("document").describe("'document' for file symbols, 'workspace' for project-wide search"),
    query: tool.schema.string().optional().describe("Symbol name to search (required for workspace scope)"),
    limit: tool.schema.number().optional().describe("Max results (default 50)"),
  },
  execute: async (args, context) => {
    try {
      const scope = args.scope ?? "document"
      
      if (scope === "workspace") {
        if (!args.query) {
          return "Error: 'query' is required for workspace scope"
        }
        
        const result = await withLspClient(args.filePath, async (client) => {
          return (await client.workspaceSymbols(args.query!)) as SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return "No symbols found"
        }

        const total = result.length
        const limit = Math.min(args.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
        const truncated = total > limit
        const limited = result.slice(0, limit)
        const lines = limited.map(formatSymbolInfo)
        if (truncated) {
          lines.unshift(`Found ${total} symbols (showing first ${limit}):`)
        }
        return lines.join("\n")
      } else {
        const result = await withLspClient(args.filePath, async (client) => {
          return (await client.documentSymbols(args.filePath)) as DocumentSymbol[] | SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return "No symbols found"
        }

        const total = result.length
        const limit = Math.min(args.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
        const truncated = total > limit
        const limited = truncated ? result.slice(0, limit) : result

        const lines: string[] = []
        if (truncated) {
          lines.push(`Found ${total} symbols (showing first ${limit}):`)
        }

        if ("range" in limited[0]) {
          lines.push(...(limited as DocumentSymbol[]).map((s) => formatDocumentSymbol(s)))
        } else {
          lines.push(...(limited as SymbolInfo[]).map(formatSymbolInfo))
        }
        return lines.join("\n")
      }
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

/**
 * 获取诊断信息
 * 
 * 在构建前检测错误和警告，比运行构建更快。
 * 
 * 使用场景：
 * - 代码提交前检查错误
 * - 重构后验证无破坏
 * - 快速类型检查
 * 
 * 严重级别：
 * - error: 编译错误
 * - warning: 警告
 * - information: 信息提示
 * - hint: 优化建议
 */
export const lsp_diagnostics: ToolDefinition = tool({
  description: "Get errors, warnings, hints from language server BEFORE running build.",
  args: {
    filePath: tool.schema.string(),
    severity: tool.schema
      .enum(["error", "warning", "information", "hint", "all"])
      .optional()
      .describe("Filter by severity level"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.diagnostics(args.filePath)) as { items?: Diagnostic[] } | Diagnostic[] | null
      })

      let diagnostics: Diagnostic[] = []
      if (result) {
        if (Array.isArray(result)) {
          diagnostics = result
        } else if (result.items) {
          diagnostics = result.items
        }
      }

      diagnostics = filterDiagnosticsBySeverity(diagnostics, args.severity)

      if (diagnostics.length === 0) {
        const output = "No diagnostics found"
        return output
      }

      const total = diagnostics.length
      const truncated = total > DEFAULT_MAX_DIAGNOSTICS
      const limited = truncated ? diagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS) : diagnostics
      const lines = limited.map(formatDiagnostic)
      if (truncated) {
        lines.unshift(`Found ${total} diagnostics (showing first ${DEFAULT_MAX_DIAGNOSTICS}):`)
      }
      const output = lines.join("\n")
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      throw new Error(output)
    }
  },
})

/**
 * 重命名前验证
 * 
 * 在执行重命名前检查是否可以安全重命名。
 * 
 * 使用场景：
 * - 避免重命名内置符号
 * - 检查重命名范围
 * - 获取当前符号名称
 * 
 * 注意：必须在lsp_rename之前调用
 */
export const lsp_prepare_rename: ToolDefinition = tool({
  description: "Check if rename is valid. Use BEFORE lsp_rename.",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("1-based"),
    character: tool.schema.number().min(0).describe("0-based"),
  },
  execute: async (args, context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.prepareRename(args.filePath, args.line, args.character)) as
          | PrepareRenameResult
          | PrepareRenameDefaultBehavior
          | null
      })
      const output = formatPrepareRenameResult(result)
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})

/**
 * 跨文件重命名
 * 
 * 自动重命名符号在整个工作区的所有引用。
 * 
 * 使用场景：
 * - 安全重构变量/函数/类名
 * - 跨文件批量重命名
 * 
 * 注意：
 * - 会直接修改文件
 * - 建议先调用lsp_prepare_rename验证
 * - 重命名后建议运行测试
 */
export const lsp_rename: ToolDefinition = tool({
  description: "Rename symbol across entire workspace. APPLIES changes to all files.",
  args: {
    filePath: tool.schema.string(),
    line: tool.schema.number().min(1).describe("1-based"),
    character: tool.schema.number().min(0).describe("0-based"),
    newName: tool.schema.string().describe("New symbol name"),
  },
  execute: async (args, context) => {
    try {
      const edit = await withLspClient(args.filePath, async (client) => {
        return (await client.rename(args.filePath, args.line, args.character, args.newName)) as WorkspaceEdit | null
      })
      const result = applyWorkspaceEdit(edit)
      const output = formatApplyResult(result)
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return output
    }
  },
})
