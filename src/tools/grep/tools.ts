/**
 * grep - 高性能文本搜索工具
 * 
 * ## 功能概述
 * 基于 ripgrep 的高性能文本搜索工具，支持正则表达式和文件过滤。
 * 
 * ## 核心能力
 * - **正则表达式**: 支持完整的正则语法（如 "log.*Error", "function\\s+\\w+"）
 * - **文件过滤**: 通过 include 参数限制搜索范围（如 "*.ts", "*.{js,jsx}"）
 * - **安全限制**: 60秒超时，10MB输出限制，防止长时间阻塞
 * - **智能排序**: 按文件修改时间排序结果
 * 
 * ## 使用场景
 * - 搜索代码中的特定模式（函数调用、变量引用）
 * - 查找错误日志和调试信息
 * - 定位 TODO/FIXME 注释
 * - 跨文件查找字符串
 * 
 * ## 与其他搜索工具的区别
 * - **grep**: 正则表达式文本搜索（本工具）
 * - **glob**: 文件名模式匹配（如 "**\/*.ts"）
 * - **ast_grep**: 基于 AST 的结构化代码搜索
 * - **lsp_symbols**: 基于语言服务器的符号搜索
 * 
 * ## 示例
 * ```typescript
 * // 搜索错误日志
 * grep(pattern="log.*Error", include="*.ts")
 * 
 * // 查找函数定义
 * grep(pattern="function\\s+\\w+", path="src/")
 * 
 * // 搜索 TODO 注释
 * grep(pattern="TODO:", include="*.{ts,tsx,js,jsx}")
 * ```
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { runRg } from "./cli"
import { formatGrepResult } from "./utils"

/**
 * grep 工具定义
 * 
 * 使用 ripgrep 作为底层实现，提供高性能文本搜索能力。
 * ripgrep 是用 Rust 编写的搜索工具，比传统 grep 快 10-100 倍。
 * 
 * 工作流程：
 * 1. 接收搜索参数（pattern, include, path）
 * 2. 转换为 ripgrep 命令行参数
 * 3. 执行搜索（60秒超时保护）
 * 4. 格式化输出结果
 * 5. 返回匹配的文件路径和行号
 */
export const grep: ToolDefinition = tool({
  description:
    "Fast content search tool with safety limits (60s timeout, 10MB output). " +
    "Searches file contents using regular expressions. " +
    "Supports full regex syntax (eg. \"log.*Error\", \"function\\s+\\w+\", etc.). " +
    "Filter files by pattern with the include parameter (eg. \"*.js\", \"*.{ts,tsx}\"). " +
    "Returns file paths with matches sorted by modification time.",
  args: {
    pattern: tool.schema.string().describe("The regex pattern to search for in file contents"),
    include: tool.schema
      .string()
      .optional()
      .describe("File pattern to include in the search (e.g. \"*.js\", \"*.{ts,tsx}\")"),
    path: tool.schema
      .string()
      .optional()
      .describe("The directory to search in. Defaults to the current working directory."),
  },
  execute: async (args) => {
    try {
      // 转换参数为 ripgrep 格式
      // include: "*.ts" -> globs: ["*.ts"]
      // path: "src/" -> paths: ["src/"]
      const globs = args.include ? [args.include] : undefined
      const paths = args.path ? [args.path] : undefined

      // 执行 ripgrep 搜索
      // context: 0 表示不包含上下文行（只返回匹配行）
      // 如果需要上下文，可以设置为正数（如 context: 2 表示前后各 2 行）
      const result = await runRg({
        pattern: args.pattern,
        paths,
        globs,
        context: 0,
      })

      // 格式化输出结果
      // 将 ripgrep 的原始输出转换为人类可读的格式
      // 格式: "文件路径:行号:匹配内容"
      return formatGrepResult(result)
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})
