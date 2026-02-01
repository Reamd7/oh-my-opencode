/**
 * LSP工具 - Language Server Protocol集成
 * 
 * 提供6个核心LSP工具，用于代码智能分析：
 * - lsp_goto_definition: 跳转到定义
 * - lsp_find_references: 查找所有引用
 * - lsp_symbols: 符号搜索（文档/工作区）
 * - lsp_diagnostics: 错误和警告诊断
 * - lsp_prepare_rename: 重命名前验证
 * - lsp_rename: 跨文件重命名
 * 
 * 支持的语言服务器：
 * - TypeScript/JavaScript (typescript-language-server)
 * - Python (pyright, pylsp)
 * - Go (gopls)
 * - Rust (rust-analyzer)
 * - 以及更多...
 */
export * from "./types"
export * from "./constants"
export * from "./config"
export * from "./client"
export * from "./utils"
// NOTE: lsp_servers removed - duplicates OpenCode's built-in LspServers
export { lsp_goto_definition, lsp_find_references, lsp_symbols, lsp_diagnostics, lsp_prepare_rename, lsp_rename } from "./tools"
