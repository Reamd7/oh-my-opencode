/**
 * Exa AI网络搜索MCP
 * 
 * ## 功能
 * 提供实时网络搜索能力，使用Exa AI的搜索引擎
 * 
 * ## 认证
 * - 可选：设置EXA_API_KEY环境变量以提高搜索质量和速率限制
 * - 无需认证也可使用基础功能
 * 
 * ## 工具
 * - web_search_exa: 执行网络搜索并返回相关结果
 * 
 * ## 使用场景
 * - 查找最新技术文档
 * - 搜索错误解决方案
 * - 获取实时信息
 */

/**
 * Exa AI网络搜索MCP配置对象
 * 
 * 配置Exa AI远程MCP服务器，提供实时网络搜索能力。
 * Exa AI是专为AI代理优化的搜索引擎，返回结构化、高质量的搜索结果。
 * 
 * **配置说明：**
 * - type: "remote" - 使用HTTP/SSE传输协议
 * - url: Exa AI MCP服务器地址，仅启用web_search_exa工具
 * - enabled: true - 默认启用
 * - headers: 可选的API密钥头，使用EXA_API_KEY环境变量
 * - oauth: false - 不使用OAuth认证，使用API密钥头认证
 * 
 * **环境变量：**
 * - EXA_API_KEY: 可选，设置后可提高搜索质量和速率限制
 *   - 无密钥：基础功能可用，但有速率限制
 *   - 有密钥：更高质量结果，更高速率限制
 * 
 * **使用示例：**
 * ```typescript
 * // 1. 搜索最新技术文档
 * web_search_exa({
 *   query: "Next.js 15 app router migration guide",
 *   numResults: 5
 * })
 * 
 * // 2. 搜索错误解决方案
 * web_search_exa({
 *   query: "TypeError: Cannot read property of undefined React",
 *   type: "deep"  // 深度搜索模式
 * })
 * 
 * // 3. 获取实时信息
 * web_search_exa({
 *   query: "latest TypeScript 5.7 features",
 *   type: "auto"  // 自动选择搜索模式
 * })
 * ```
 * 
 * **搜索模式：**
 * - auto: 平衡模式，适合大多数查询（默认）
 * - fast: 快速模式，返回速度优先
 * - deep: 深度模式，结果质量优先
 * 
 * **与传统搜索引擎的区别：**
 * - 为AI优化：返回结构化数据，易于LLM处理
 * - 高质量结果：过滤低质量内容，聚焦技术文档
 * - 上下文理解：理解技术术语和编程概念
 * 
 * @constant
 * @type {RemoteMcpConfig}
 */
export const websearch = {
  type: "remote" as const,
  url: "https://mcp.exa.ai/mcp?tools=web_search_exa",
  enabled: true,
  headers: process.env.EXA_API_KEY
    ? { "x-api-key": process.env.EXA_API_KEY }
    : undefined,
  // Disable OAuth auto-detection - Exa uses API key header, not OAuth
  oauth: false as const,
}
