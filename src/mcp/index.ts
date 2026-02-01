/**
 * MCP（Model Context Protocol）配置系统
 * 
 * ## 三层MCP架构
 * 
 * ### 1. Built-in MCP（本文件）
 * 内置的远程MCP服务器，开箱即用：
 * - websearch: Exa AI网络搜索（实时网页搜索）
 * - context7: 官方文档检索（库文档查询）
 * - grep_app: GitHub代码搜索（开源代码示例）
 * 
 * ### 2. Claude Code兼容层
 * 支持.mcp.json配置文件，兼容Claude Code的MCP配置
 * - 支持${VAR}环境变量展开
 * - 支持stdio和remote两种传输方式
 * 
 * ### 3. Skill-embedded MCP
 * 技能内嵌的MCP配置（YAML frontmatter）
 * - 由skill-mcp-manager处理
 * - 技能可以声明自己需要的MCP服务
 * 
 * ## 内置MCP服务器
 * 
 * | 名称 | URL | 用途 | 认证 |
 * |------|-----|------|------|
 * | websearch | mcp.exa.ai | 实时网络搜索 | EXA_API_KEY（可选） |
 * | context7 | mcp.context7.com | 库文档检索 | CONTEXT7_API_KEY（可选） |
 * | grep_app | mcp.grep.app | GitHub代码搜索 | 无需认证 |
 * 
 * ## 禁用MCP
 * 用户可以在配置中禁用特定MCP：
 * ```json
 * {
 *   "disabled_mcps": ["websearch", "context7"]
 * }
 * ```
 */
import { websearch } from "./websearch"
import { context7 } from "./context7"
import { grep_app } from "./grep-app"
import type { McpName } from "./types"

export { McpNameSchema, type McpName } from "./types"

/**
 * 远程MCP配置类型
 * 
 * 定义远程MCP服务器的配置结构。
 * 所有内置MCP都使用HTTP/SSE传输协议（remote类型）。
 * 
 * **字段说明：**
 * - type: "remote" - 使用HTTP/SSE传输协议（与stdio相对）
 * - url: MCP服务器的HTTP端点地址
 * - enabled: 是否启用此MCP服务器
 * - headers: 可选的HTTP请求头（用于认证等）
 * - oauth: false - 禁用OAuth自动检测（使用API密钥认证）
 * 
 * @interface RemoteMcpConfig
 */
type RemoteMcpConfig = {
  type: "remote"
  url: string
  enabled: boolean
  headers?: Record<string, string>
  oauth?: false
}

/**
 * 所有内置MCP服务器的配置映射
 * 
 * 包含oh-my-opencode提供的三个内置MCP服务器：
 * - websearch: Exa AI网络搜索
 * - context7: 官方文档检索
 * - grep_app: GitHub代码搜索
 * 
 * 用户可以通过配置文件的disabled_mcps字段禁用特定MCP。
 * 
 * @constant
 * @type {Record<McpName, RemoteMcpConfig>}
 */
const allBuiltinMcps: Record<McpName, RemoteMcpConfig> = {
  websearch,
  context7,
  grep_app,
}

/**
 * 创建内置MCP配置
 * 
 * 根据禁用列表过滤并返回启用的MCP配置。
 * 这是MCP系统的工厂函数，在插件初始化时调用。
 * 
 * **工作流程：**
 * 1. 遍历所有内置MCP配置
 * 2. 检查每个MCP是否在禁用列表中
 * 3. 仅返回未被禁用的MCP配置
 * 
 * **使用场景：**
 * - 插件初始化时根据用户配置创建MCP
 * - 用户可通过disabled_mcps配置项禁用不需要的MCP
 * - 减少不必要的网络请求和API调用
 * 
 * **示例：**
 * ```typescript
 * // 启用所有MCP
 * const mcps = createBuiltinMcps()
 * 
 * // 禁用websearch和context7
 * const mcps = createBuiltinMcps(["websearch", "context7"])
 * // 结果：仅包含grep_app
 * ```
 * 
 * @param disabledMcps - 要禁用的MCP名称列表（默认为空数组）
 * @returns MCP配置对象，仅包含启用的MCP
 */
export function createBuiltinMcps(disabledMcps: string[] = []) {
  const mcps: Record<string, RemoteMcpConfig> = {}

  for (const [name, config] of Object.entries(allBuiltinMcps)) {
    if (!disabledMcps.includes(name)) {
      mcps[name] = config
    }
  }

  return mcps
}
