import type { AgentConfig } from "@opencode-ai/sdk"
import { isGptModel } from "./types"
import type { AgentOverrideConfig } from "../config/schema"
import {
  createAgentToolRestrictions,
  type PermissionValue,
} from "../shared/permission-compat"

const SISYPHUS_JUNIOR_PROMPT = `<Role>
Sisyphus-Junior (小西西弗斯) - 来自 OhMyOpenCode 的专注执行者。
直接执行任务。绝不委托或派生其他代理。
</Role>

<Critical_Constraints>
被阻止的操作（尝试将失败）：
- task 工具：已阻止
- delegate_task 工具：已阻止

允许的操作：call_omo_agent - 你可以派生 explore/librarian 代理进行研究。
你独自完成实现工作。不委托实现任务。
</Critical_Constraints>

<Todo_Discipline>
待办列表强制要求（不可协商）：
- 2+ 步骤 → 首先使用 todowrite，原子化分解
- 开始前标记为 in_progress（一次只能一个）
- 每步完成后立即标记为 completed
- 绝不批量完成

多步骤工作没有待办列表 = 工作未完成。
</Todo_Discipline>

<Verification>
任务未完成的标志：
- 修改的文件上 lsp_diagnostics 未通过
- 构建未通过（如果适用）
- 所有待办事项未标记为已完成
</Verification>

<Style>
- 立即开始。不要确认。
- 匹配用户的沟通风格。
- 简洁 > 冗长。
</Style>`

function buildSisyphusJuniorPrompt(promptAppend?: string): string {
  if (!promptAppend) return SISYPHUS_JUNIOR_PROMPT
  return SISYPHUS_JUNIOR_PROMPT + "\n\n" + promptAppend
}

// Core tools that Sisyphus-Junior must NEVER have access to
// Note: call_omo_agent is ALLOWED so subagents can spawn explore/librarian
const BLOCKED_TOOLS = ["task", "delegate_task"]

export const SISYPHUS_JUNIOR_DEFAULTS = {
  model: "anthropic/claude-sonnet-4-5",
  temperature: 0.1,
} as const

export function createSisyphusJuniorAgentWithOverrides(
  override: AgentOverrideConfig | undefined,
  systemDefaultModel?: string
): AgentConfig {
  if (override?.disable) {
    override = undefined
  }

  const model = override?.model ?? systemDefaultModel ?? SISYPHUS_JUNIOR_DEFAULTS.model
  const temperature = override?.temperature ?? SISYPHUS_JUNIOR_DEFAULTS.temperature

  const promptAppend = override?.prompt_append
  const prompt = buildSisyphusJuniorPrompt(promptAppend)

  const baseRestrictions = createAgentToolRestrictions(BLOCKED_TOOLS)

  const userPermission = (override?.permission ?? {}) as Record<string, PermissionValue>
  const basePermission = baseRestrictions.permission
  const merged: Record<string, PermissionValue> = { ...userPermission }
  for (const tool of BLOCKED_TOOLS) {
    merged[tool] = "deny"
  }
  merged.call_omo_agent = "allow"
  const toolsConfig = { permission: { ...merged, ...basePermission } }

  const base: AgentConfig = {
    description: override?.description ??
      "Sisyphus-Junior (小西西弗斯) - 专注的任务执行者。同样的纪律，不委托。",
    mode: "subagent" as const,
    model,
    temperature,
    maxTokens: 64000,
    prompt,
    color: override?.color ?? "#20B2AA",
    ...toolsConfig,
  }

  if (override?.top_p !== undefined) {
    base.top_p = override.top_p
  }

  if (isGptModel(model)) {
    return { ...base, reasoningEffort: "medium" } as AgentConfig
  }

  return {
    ...base,
    thinking: { type: "enabled", budgetTokens: 32000 },
  } as AgentConfig
}
