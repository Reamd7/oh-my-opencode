/**
 * Doctor检查项注册中心
 * 
 * ## 14+项健康检查
 * 
 * ### installation（安装检查）
 * - opencode: OpenCode CLI可用性
 * - plugin: oh-my-opencode插件安装状态
 * 
 * ### configuration（配置检查）
 * - config: JSONC配置文件有效性和Zod验证
 * - model-resolution: 模型解析配置检查
 * 
 * ### authentication（认证检查）
 * - anthropic: ANTHROPIC_API_KEY环境变量
 * - openai: OPENAI_API_KEY环境变量
 * - google: GOOGLE_API_KEY环境变量
 * 
 * ### dependencies（依赖检查）
 * - ast-grep: AST-Grep CLI工具
 * - comment-checker: Comment Checker工具
 * - gh-cli: GitHub CLI工具
 * 
 * ### tools（工具检查）
 * - lsp: LSP服务器连接性
 * - mcp: MCP服务器验证
 * 
 * ### updates（更新检查）
 * - version: 版本比较和更新提示
 * 
 * ## 如何添加新检查
 * 1. 在checks/目录创建新文件（如my-check.ts）
 * 2. 导出getXXXCheckDefinition()工厂函数
 * 3. 在本文件导入并添加到getAllCheckDefinitions()
 */
import type { CheckDefinition } from "../types"
import { getOpenCodeCheckDefinition } from "./opencode"
import { getPluginCheckDefinition } from "./plugin"
import { getConfigCheckDefinition } from "./config"
import { getModelResolutionCheckDefinition } from "./model-resolution"
import { getAuthCheckDefinitions } from "./auth"
import { getDependencyCheckDefinitions } from "./dependencies"
import { getGhCliCheckDefinition } from "./gh"
import { getLspCheckDefinition } from "./lsp"
import { getMcpCheckDefinitions } from "./mcp"
import { getVersionCheckDefinition } from "./version"

export * from "./opencode"
export * from "./plugin"
export * from "./config"
export * from "./model-resolution"
export * from "./auth"
export * from "./dependencies"
export * from "./gh"
export * from "./lsp"
export * from "./mcp"
export * from "./version"

/**
 * 获取所有检查定义
 * 
 * @returns 所有检查项的定义数组（14+项）
 */
export function getAllCheckDefinitions(): CheckDefinition[] {
  return [
    getOpenCodeCheckDefinition(),
    getPluginCheckDefinition(),
    getConfigCheckDefinition(),
    getModelResolutionCheckDefinition(),
    ...getAuthCheckDefinitions(),
    ...getDependencyCheckDefinitions(),
    getGhCliCheckDefinition(),
    getLspCheckDefinition(),
    ...getMcpCheckDefinitions(),
    getVersionCheckDefinition(),
  ]
}
