/**
 * glob - 文件模式匹配工具
 * 
 * ## 功能
 * - 支持通配符模式（星星斜杠, 星号, 问号）
 * - 安全限制（60s超时，100文件限制）
 * - 按修改时间排序
 * - 自动安装ripgrep依赖
 * 
 * ## 使用场景
 * - 查找特定类型的文件
 * - 定位配置文件
 * - 扫描目录结构
 * 
 * ## 示例
 * 查找所有TypeScript文件
 * 查找测试文件
 * 查找配置目录中的JSON文件
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { runRgFiles } from "./cli"
import { resolveGrepCliWithAutoInstall } from "./constants"
import { formatGlobResult } from "./utils"

/**
 * glob工具定义
 * 使用ripgrep的文件列表功能实现高性能文件匹配
 */
export const glob: ToolDefinition = tool({
  description:
    "Fast file pattern matching tool with safety limits (60s timeout, 100 file limit). " +
    "Supports glob patterns like \"**/*.js\" or \"src/**/*.ts\". " +
    "Returns matching file paths sorted by modification time. " +
    "Use this tool when you need to find files by name patterns.",
  args: {
    pattern: tool.schema.string().describe("The glob pattern to match files against"),
    path: tool.schema
      .string()
      .optional()
      .describe(
        "The directory to search in. If not specified, the current working directory will be used. " +
          "IMPORTANT: Omit this field to use the default directory. DO NOT enter \"undefined\" or \"null\" - " +
          "simply omit it for the default behavior. Must be a valid directory path if provided."
      ),
  },
  execute: async (args) => {
    try {
      // 确保ripgrep已安装
      const cli = await resolveGrepCliWithAutoInstall()
      const paths = args.path ? [args.path] : undefined

      // 执行文件匹配
      const result = await runRgFiles(
        {
          pattern: args.pattern,
          paths,
        },
        cli
      )

      // 格式化输出结果
      return formatGlobResult(result)
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})
