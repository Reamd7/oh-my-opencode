/**
 * Grep.app GitHub代码搜索MCP
 * 
 * ## 功能
 * 在100万+公开GitHub仓库中搜索代码示例
 * 
 * ## 认证
 * - 无需认证，完全免费使用
 * 
 * ## 工具
 * - searchGitHub: 搜索GitHub代码
 *   - 支持字面量代码模式搜索（如'useState('）
 *   - 支持正则表达式搜索（useRegexp=true）
 *   - 可按语言、仓库、文件路径过滤
 * 
 * ## 使用场景
 * - 查找真实世界的代码使用示例
 * - 学习API的正确用法
 * - 发现最佳实践和常见模式
 * - 查看库的实际集成方式
 * 
 * ## 搜索技巧
 * - 搜索实际代码而非关键词（✓ 'useState(' ✗ 'react hooks'）
 * - 使用language参数过滤语言（如['TypeScript', 'TSX']）
 * - 使用正则表达式匹配复杂模式（如'(?s)useEffect\\(\\(\\) => {.*cleanup'）
 */

/**
 * Grep.app MCP配置对象
 * 
 * 配置Grep.app远程MCP服务器，用于在GitHub公开仓库中搜索代码示例。
 * 
 * **配置说明：**
 * - type: "remote" - 使用HTTP/SSE传输协议
 * - url: Grep.app MCP服务器地址
 * - enabled: true - 默认启用
 * - oauth: false - 不使用OAuth认证，完全免费
 * 
 * **特点：**
 * - 无需认证：完全免费使用，无需API密钥
 * - 海量代码库：覆盖100万+公开GitHub仓库
 * - 智能搜索：支持字面量和正则表达式两种搜索模式
 * - 精确过滤：可按编程语言、仓库、文件路径过滤结果
 * 
 * **使用示例：**
 * ```typescript
 * // 1. 字面量搜索：查找useState的使用示例
 * searchGitHub({
 *   query: "useState(",
 *   language: ["TypeScript", "TSX"],
 *   matchCase: false
 * })
 * 
 * // 2. 正则表达式搜索：查找useEffect清理函数模式
 * searchGitHub({
 *   query: "(?s)useEffect\\(\\(\\) => {.*removeEventListener",
 *   useRegexp: true,
 *   language: ["TypeScript"]
 * })
 * 
 * // 3. 仓库过滤：只搜索特定组织的代码
 * searchGitHub({
 *   query: "getServerSession",
 *   repo: "vercel/",
 *   language: ["TypeScript"]
 * })
 * ```
 * 
 * **搜索最佳实践：**
 * - ✅ 搜索实际代码：'useState(' 而非 'react hooks'
 * - ✅ 使用language过滤：避免无关语言的结果
 * - ✅ 正则跨行匹配：使用(?s)前缀匹配多行代码
 * - ❌ 避免关键词搜索：'authentication' 不如 'getServerSession'
 * 
 * @constant
 * @type {RemoteMcpConfig}
 */
export const grep_app = {
  type: "remote" as const,
  url: "https://mcp.grep.app",
  enabled: true,
  oauth: false as const,
}
