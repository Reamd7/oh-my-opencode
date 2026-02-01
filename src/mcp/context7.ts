/**
 * Context7官方文档检索MCP
 * 
 * ## 功能
 * 提供库和框架的官方文档检索能力
 * 
 * ## 认证
 * - 可选：设置CONTEXT7_API_KEY环境变量以提高查询速率限制
 * - 无需认证也可使用基础功能
 * 
 * ## 工具
 * - resolve-library-id: 解析库名称到Context7兼容的库ID
 * - query-docs: 查询特定库的文档和代码示例
 * 
 * ## 使用场景
 * - 查询React、Next.js等框架的官方文档
 * - 获取库的API使用示例
 * - 查找最佳实践和配置方法
 * 
 * ## 工作流程
 * 1. 使用resolve-library-id获取库ID（如/vercel/next.js）
 * 2. 使用query-docs查询该库的文档
 */

/**
 * Context7 MCP配置对象
 * 
 * 配置Context7远程MCP服务器，用于检索库和框架的官方文档。
 * 
 * **配置说明：**
 * - type: "remote" - 使用HTTP/SSE传输协议
 * - url: Context7 MCP服务器地址
 * - enabled: true - 默认启用
 * - headers: 可选的认证头，使用CONTEXT7_API_KEY环境变量
 * - oauth: false - 不使用OAuth认证，使用API密钥头认证
 * 
 * **环境变量：**
 * - CONTEXT7_API_KEY: 可选，设置后可提高查询速率限制
 * 
 * **使用示例：**
 * ```typescript
 * // 1. 解析库ID
 * resolve-library-id({ libraryName: "next.js", query: "routing" })
 * // 返回: "/vercel/next.js"
 * 
 * // 2. 查询文档
 * query-docs({ libraryId: "/vercel/next.js", query: "app router setup" })
 * // 返回: 相关文档和代码示例
 * ```
 * 
 * @constant
 * @type {RemoteMcpConfig}
 */
export const context7 = {
  type: "remote" as const,
  url: "https://mcp.context7.com/mcp",
  enabled: true,
  headers: process.env.CONTEXT7_API_KEY
    ? { Authorization: `Bearer ${process.env.CONTEXT7_API_KEY}` }
    : undefined,
  // Disable OAuth auto-detection - Context7 uses API key header, not OAuth
  oauth: false as const,
}
