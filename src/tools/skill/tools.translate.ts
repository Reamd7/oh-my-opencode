/**
 * skill + skill-mcp - 技能系统
 * 
 * ## 功能
 * - skill: 加载和执行内置技能
 * - skill-mcp: 调用技能嵌入的MCP服务器
 * - find_skills: 列出所有可用技能
 * - use_skill: 读取技能内容
 * 
 * ## 技能来源（优先级从高到低）
 * 1. Project: .opencode/skills/ (项目级)
 * 2. Personal: ~/.config/opencode/skills/ (用户级)
 * 3. Superpowers: 内置技能 (系统级)
 * 
 * ## 技能类型
 * - playwright: 浏览器自动化
 * - git-master: Git原子提交
 * - frontend-ui-ux: 前端UI/UX设计
 * 
 * ## MCP集成
 * 技能可以在YAML frontmatter中定义MCP服务器
 * 使用skill_mcp工具调用这些服务器的工具/资源/提示
 */
import { dirname } from "node:path"
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { TOOL_DESCRIPTION_NO_SKILLS, TOOL_DESCRIPTION_PREFIX } from "./constants"
import type { SkillArgs, SkillInfo, SkillLoadOptions } from "./types"
import type { LoadedSkill } from "../../features/opencode-skill-loader"
import { getAllSkills, extractSkillTemplate } from "../../features/opencode-skill-loader/skill-content"
import { injectGitMasterConfig } from "../../features/opencode-skill-loader/skill-content"
import type { SkillMcpManager, SkillMcpClientInfo, SkillMcpServerContext } from "../../features/skill-mcp-manager"
import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js"

function loadedSkillToInfo(skill: LoadedSkill): SkillInfo {
  return {
    name: skill.name,
    description: skill.definition.description || "",
    location: skill.path,
    scope: skill.scope,
    license: skill.license,
    compatibility: skill.compatibility,
    metadata: skill.metadata,
    allowedTools: skill.allowedTools,
  }
}

function formatSkillsXml(skills: SkillInfo[]): string {
  if (skills.length === 0) return ""

  const skillsXml = skills.map(skill => {
    const lines = [
      "  <skill>",
      `    <name>${skill.name}</name>`,
      `    <description>${skill.description}</description>`,
    ]
    if (skill.compatibility) {
      lines.push(`    <compatibility>${skill.compatibility}</compatibility>`)
    }
    lines.push("  </skill>")
    return lines.join("\n")
  }).join("\n")

  return `\n\n<available_skills>\n${skillsXml}\n</available_skills>`
}

async function extractSkillBody(skill: LoadedSkill): Promise<string> {
  if (skill.lazyContent) {
    const fullTemplate = await skill.lazyContent.load()
    const templateMatch = fullTemplate.match(/<skill-instruction>([\s\S]*?)<\/skill-instruction>/)
    return templateMatch ? templateMatch[1].trim() : fullTemplate
  }

  if (skill.path) {
    return extractSkillTemplate(skill)
  }

  const templateMatch = skill.definition.template?.match(/<skill-instruction>([\s\S]*?)<\/skill-instruction>/)
  return templateMatch ? templateMatch[1].trim() : skill.definition.template || ""
}

async function formatMcpCapabilities(
  skill: LoadedSkill,
  manager: SkillMcpManager,
  sessionID: string
): Promise<string | null> {
  if (!skill.mcpConfig || Object.keys(skill.mcpConfig).length === 0) {
    return null
  }

  const sections: string[] = ["", "## 可用的MCP服务器", ""]

  for (const [serverName, config] of Object.entries(skill.mcpConfig)) {
    const info: SkillMcpClientInfo = {
      serverName,
      skillName: skill.name,
      sessionID,
    }
    const context: SkillMcpServerContext = {
      config,
      skillName: skill.name,
    }

    sections.push(`### ${serverName}`)
    sections.push("")

    try {
      const [tools, resources, prompts] = await Promise.all([
        manager.listTools(info, context).catch(() => []),
        manager.listResources(info, context).catch(() => []),
        manager.listPrompts(info, context).catch(() => []),
      ])

      if (tools.length > 0) {
        sections.push("**工具：**")
        sections.push("")
        for (const t of tools as Tool[]) {
          sections.push(`#### \`${t.name}\``)
          if (t.description) {
            sections.push(t.description)
          }
          sections.push("")
          sections.push("**输入模式：**")
          sections.push("```json")
          sections.push(JSON.stringify(t.inputSchema, null, 2))
          sections.push("```")
          sections.push("")
        }
      }
      if (resources.length > 0) {
        sections.push(`**资源：** ${resources.map((r: Resource) => r.uri).join(", ")}`)
      }
      if (prompts.length > 0) {
        sections.push(`**提示词：** ${prompts.map((p: Prompt) => p.name).join(", ")}`)
      }

      if (tools.length === 0 && resources.length === 0 && prompts.length === 0) {
        sections.push("*未发现任何能力*")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sections.push(`*连接失败：${errorMessage.split("\n")[0]}*`)
    }

    sections.push("")
    sections.push(`使用 \`skill_mcp\` 工具并设置 \`mcp_name="${serverName}"\` 来调用。`)
    sections.push("")
  }

  return sections.join("\n")
}

/**
 * 创建skill工具
 * 
 * @param options - 技能加载选项
 * @returns skill工具定义
 * 
 * 该工具支持：
 * - 懒加载技能列表
 * - 缓存技能描述
 * - MCP服务器集成
 * - git-master配置注入
 */
export function createSkillTool(options: SkillLoadOptions = {}): ToolDefinition {
  let cachedSkills: LoadedSkill[] | null = null
  let cachedDescription: string | null = null

  // 获取所有可用技能（带缓存）
  const getSkills = async (): Promise<LoadedSkill[]> => {
    if (options.skills) return options.skills
    if (cachedSkills) return cachedSkills
    cachedSkills = await getAllSkills()
    return cachedSkills
  }

  const getDescription = async (): Promise<string> => {
    if (cachedDescription) return cachedDescription
    const skills = await getSkills()
    const skillInfos = skills.map(loadedSkillToInfo)
    cachedDescription = skillInfos.length === 0
      ? TOOL_DESCRIPTION_NO_SKILLS
      : TOOL_DESCRIPTION_PREFIX + formatSkillsXml(skillInfos)
    return cachedDescription
  }

  if (options.skills) {
    const skillInfos = options.skills.map(loadedSkillToInfo)
    cachedDescription = skillInfos.length === 0
      ? TOOL_DESCRIPTION_NO_SKILLS
      : TOOL_DESCRIPTION_PREFIX + formatSkillsXml(skillInfos)
  } else {
    getDescription()
  }

  return tool({
    get description() {
      return cachedDescription ?? TOOL_DESCRIPTION_PREFIX
    },
    args: {
      name: tool.schema.string().describe("available_skills中的技能标识符（例如：'code-review'）"),
    },
    async execute(args: SkillArgs, ctx?: { agent?: string }) {
      // 查找请求的技能
      const skills = await getSkills()
      const skill = skills.find(s => s.name === args.name)

      if (!skill) {
        const available = skills.map(s => s.name).join(", ")
        throw new Error(`未找到技能 "${args.name}"。可用技能：${available || "无"}`)
      }

      // 检查代理权限
      if (skill.definition.agent && (!ctx?.agent || skill.definition.agent !== ctx.agent)) {
        throw new Error(`技能 "${args.name}" 仅限代理 "${skill.definition.agent}" 使用`)
      }

      // 提取技能内容
      let body = await extractSkillBody(skill)

      // git-master特殊处理：注入配置
      if (args.name === "git-master") {
        body = injectGitMasterConfig(body, options.gitMasterConfig)
      }

      // 确定技能基础目录
      const dir = skill.path ? dirname(skill.path) : skill.resolvedPath || process.cwd()

      // 构建输出
      const output = [
        `## 技能：${skill.name}`,
        "",
        `**基础目录**：${dir}`,
        "",
        body,
      ]

      // 添加MCP能力信息
      if (options.mcpManager && options.getSessionID && skill.mcpConfig) {
        const mcpInfo = await formatMcpCapabilities(
          skill,
          options.mcpManager,
          options.getSessionID()
        )
        if (mcpInfo) {
          output.push(mcpInfo)
        }
      }

      return output.join("\n")
    },
  })
}

export const skill: ToolDefinition = createSkillTool()
