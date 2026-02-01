/**
 * @fileoverview 技能MCP管理器
 * 
 * 管理技能嵌入的MCP服务器生命周期：
 * - 懒加载: 首次调用时创建客户端
 * - 传输协议: stdio、http (SSE/Streamable)
 * - 自动清理: 5分钟空闲后关闭
 * 
 * @module features/skill-mcp-manager
 */

export * from "./types"
export { SkillMcpManager } from "./manager"
