/**
 * MCP类型定义
 * 
 * ## McpName
 * 内置MCP服务器的名称枚举：
 * - websearch: Exa AI网络搜索
 * - context7: 官方文档检索
 * - grep_app: GitHub代码搜索
 * 
 * ## AnyMcpName
 * 任意MCP名称（包括用户自定义的MCP）
 * 用于支持.mcp.json和skill-embedded MCP
 */
import { z } from "zod"

/**
 * 内置MCP名称的Zod schema
 * 
 * 定义oh-my-opencode提供的三个内置MCP服务器的名称枚举。
 * 用于配置验证和类型安全。
 * 
 * **内置MCP列表：**
 * - websearch: Exa AI网络搜索服务
 * - context7: 官方文档检索服务
 * - grep_app: GitHub代码搜索服务
 * 
 * **使用场景：**
 * - 配置文件验证：确保disabled_mcps中的名称有效
 * - 类型推断：自动生成McpName类型
 * - 运行时检查：验证MCP名称的合法性
 * 
 * @constant
 * @type {z.ZodEnum<["websearch", "context7", "grep_app"]>}
 */
export const McpNameSchema = z.enum(["websearch", "context7", "grep_app"])

/**
 * 内置MCP名称类型
 * 
 * 从McpNameSchema推断的TypeScript类型。
 * 表示三个内置MCP服务器之一的名称。
 * 
 * @type {"websearch" | "context7" | "grep_app"}
 */
export type McpName = z.infer<typeof McpNameSchema>

/**
 * 任意MCP名称的Zod schema
 * 
 * 允许任意非空字符串作为MCP名称。
 * 用于支持用户自定义的MCP服务器，包括：
 * - .mcp.json中定义的MCP
 * - skill-embedded MCP（技能内嵌的MCP）
 * 
 * **与McpNameSchema的区别：**
 * - McpNameSchema: 仅限内置MCP（websearch, context7, grep_app）
 * - AnyMcpNameSchema: 允许任意MCP名称，包括用户自定义
 * 
 * **使用场景：**
 * - disabled_mcps配置：用户可以禁用任意MCP，包括自定义的
 * - MCP注册表：支持动态注册新的MCP服务器
 * - 技能系统：技能可以声明依赖任意MCP
 * 
 * @constant
 * @type {z.ZodString}
 */
export const AnyMcpNameSchema = z.string().min(1)

/**
 * 任意MCP名称类型
 * 
 * 从AnyMcpNameSchema推断的TypeScript类型。
 * 表示任意非空字符串，可以是内置MCP或用户自定义MCP的名称。
 * 
 * **示例：**
 * ```typescript
 * // 内置MCP
 * const builtinMcp: AnyMcpName = "websearch"
 * 
 * // 用户自定义MCP
 * const customMcp: AnyMcpName = "my-custom-mcp"
 * 
 * // .mcp.json中的MCP
 * const claudeCodeMcp: AnyMcpName = "filesystem"
 * ```
 * 
 * @type {string}
 */
export type AnyMcpName = z.infer<typeof AnyMcpNameSchema>
