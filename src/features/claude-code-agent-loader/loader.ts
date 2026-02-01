/**
 * Claude Code 代理加载器
 * 
 * ## 功能
 * 从 ~/.claude/agents/ 和 .claude/agents/ 加载自定义代理
 * 
 * ## 兼容性
 * 支持Claude Code的代理定义格式（Markdown + YAML frontmatter）
 * 
 * ## 加载优先级
 * .claude/agents/ (项目级) > ~/.claude/agents/ (用户级)
 * 
 * ## 代理格式
 * ```markdown
 * ---
 * name: my-agent
 * description: Agent description
 * tools: read,write,bash
 * ---
 * 
 * Agent prompt content here...
 * ```
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { join, basename } from "path"
import type { AgentConfig } from "@opencode-ai/sdk"
import { parseFrontmatter } from "../../shared/frontmatter"
import { isMarkdownFile } from "../../shared/file-utils"
import { getClaudeConfigDir } from "../../shared"
import type { AgentScope, AgentFrontmatter, LoadedAgent } from "./types"

/**
 * 解析工具配置字符串
 * 将 "read,write,bash" 格式转换为 { read: true, write: true, bash: true }
 */
function parseToolsConfig(toolsStr?: string): Record<string, boolean> | undefined {
  if (!toolsStr) return undefined

  const tools = toolsStr.split(",").map((t) => t.trim()).filter(Boolean)
  if (tools.length === 0) return undefined

  const result: Record<string, boolean> = {}
  for (const tool of tools) {
    result[tool.toLowerCase()] = true
  }
  return result
}

/**
 * 从指定目录加载代理定义
 * 
 * @param agentsDir - 代理目录路径
 * @param scope - 代理作用域（user/project）
 * @returns 加载的代理列表
 * 
 * ## 处理流程
 * 1. 扫描目录中的 .md 文件
 * 2. 解析 YAML frontmatter 获取元数据
 * 3. 提取 body 作为代理 prompt
 * 4. 转换为 OpenCode SDK 格式
 */
function loadAgentsFromDir(agentsDir: string, scope: AgentScope): LoadedAgent[] {
  if (!existsSync(agentsDir)) {
    return []
  }

  const entries = readdirSync(agentsDir, { withFileTypes: true })
  const agents: LoadedAgent[] = []

  for (const entry of entries) {
    if (!isMarkdownFile(entry)) continue

    const agentPath = join(agentsDir, entry.name)
    const agentName = basename(entry.name, ".md")

    try {
      const content = readFileSync(agentPath, "utf-8")
      const { data, body } = parseFrontmatter<AgentFrontmatter>(content)

       const name = data.name || agentName
       const originalDescription = data.description || ""

       // 添加作用域标识，便于区分代理来源
       const formattedDescription = `(${scope}) ${originalDescription}`

       const config: AgentConfig = {
         description: formattedDescription,
         mode: "subagent",
         prompt: body.trim(),
       }

       // 解析工具权限配置
       const toolsConfig = parseToolsConfig(data.tools)
      if (toolsConfig) {
        config.tools = toolsConfig
      }

      agents.push({
        name,
        path: agentPath,
        config,
        scope,
      })
    } catch {
      continue
    }
  }

  return agents
}

export function loadUserAgents(): Record<string, AgentConfig> {
  const userAgentsDir = join(getClaudeConfigDir(), "agents")
  const agents = loadAgentsFromDir(userAgentsDir, "user")

  const result: Record<string, AgentConfig> = {}
  for (const agent of agents) {
    result[agent.name] = agent.config
  }
  return result
}

export function loadProjectAgents(): Record<string, AgentConfig> {
  const projectAgentsDir = join(process.cwd(), ".claude", "agents")
  const agents = loadAgentsFromDir(projectAgentsDir, "project")

  const result: Record<string, AgentConfig> = {}
  for (const agent of agents) {
    result[agent.name] = agent.config
  }
  return result
}
