/**
 * @file 动态代理提示词构建器 - oh-my-opencode 的核心创新
 * 
 * **为什么需要动态构建提示词？**
 * 
 * 传统方式：将代理信息硬编码在提示词中
 * 问题：
 * - 新增代理需要手动更新 Sisyphus 提示词的多个位置
 * - 代理信息不一致（工具列表过时、技能描述错误）
 * - 配置启用/禁用代理后提示词没有反映变化
 * 
 * 动态构建方式：基于元数据在运行时生成提示词
 * 优势：
 * - 代理信息始终最新（工具列表、技能定义、其他代理）
 * - 新增代理只需定义元数据，提示词自动包含
 * - 配置变更自动反映到提示词
 * - 统一的信息源，避免不一致
 * 
 * **架构设计：**
 * 
 * 1. 元数据收集：从各代理的 PROMPT_METADATA 收集信息
 * 2. 动态组装：根据元数据生成提示词各部分（Key Triggers, Tool Selection, Delegation Table）
 * 3. 注入提示词：将生成的部分插入 Sisyphus/Atlas 的提示词模板
 * 
 * 这个文件是元数据驱动设计的核心实现。
 */

import type { AgentPromptMetadata, BuiltinAgentName } from "./types"

/**
 * 可用代理信息
 * 
 * 用于在 Sisyphus 提示词中展示当前可用的代理。
 * 这些信息从配置中动态计算（考虑禁用的代理）。
 */
export interface AvailableAgent {
  name: BuiltinAgentName
  description: string
  metadata: AgentPromptMetadata
}

/**
 * 可用工具信息
 * 
 * 用于在 Tool Selection 表格中展示工具。
 * 工具按类别分组（lsp_*, ast_grep, search 等）以简化展示。
 */
export interface AvailableTool {
  name: string
  category: "lsp" | "ast" | "search" | "session" | "command" | "other"
}

/**
 * 可用技能信息
 * 
 * 用于在 Category + Skills Delegation 部分展示技能。
 * `location` 表示技能来源（插件内置、用户、项目）。
 */
export interface AvailableSkill {
  name: string
  description: string
  location: "user" | "project" | "plugin"
}

/**
 * 可用分类信息
 * 
 * 用于展示 delegate_task 的 category 参数可选值。
 * 描述帮助 Sisyphus 选择最合适的分类。
 */
export interface AvailableCategory {
  name: string
  description: string
}

/**
 * 工具分类器
 * 
 * 将工具名称列表按类别分组，用于在 Tool Selection 表格中简洁展示。
 * 
 * 分类规则：
 * - `lsp_*` → lsp（代码重构、跳转、引用查找）
 * - `ast_grep*` → ast（AST 级别的代码搜索和替换）
 * - grep/glob → search（文件搜索）
 * - `session_*` → session（会话管理）
 * - slashcommand → command（斜杠命令）
 * - 其他 → other
 * 
 * 分组后的展示格式："`grep`, `glob`, `lsp_*`, `ast_grep`"
 * 这样可以避免列出几十个 lsp_* 工具名称，保持提示词简洁。
 */
export function categorizeTools(toolNames: string[]): AvailableTool[] {
  return toolNames.map((name) => {
    let category: AvailableTool["category"] = "other"
    if (name.startsWith("lsp_")) {
      category = "lsp"
    } else if (name.startsWith("ast_grep")) {
      category = "ast"
    } else if (name === "grep" || name === "glob") {
      category = "search"
    } else if (name.startsWith("session_")) {
      category = "session"
    } else if (name === "slashcommand") {
      category = "command"
    }
    return { name, category }
  })
}

/**
 * 工具格式化器 - 生成提示词中的工具展示字符串
 * 
 * 将分类后的工具列表转换为简洁的展示格式。
 * 使用通配符（lsp_*, ast_grep）避免提示词过长。
 * 
 * 输出示例："`grep`, `glob`, `lsp_*`, `ast_grep`"
 * 
 * 优先级顺序：search → lsp → ast
 * 这个顺序反映了工具的使用频率（搜索工具最常用）。
 */
function formatToolsForPrompt(tools: AvailableTool[]): string {
  const lspTools = tools.filter((t) => t.category === "lsp")
  const astTools = tools.filter((t) => t.category === "ast")
  const searchTools = tools.filter((t) => t.category === "search")

  const parts: string[] = []

  if (searchTools.length > 0) {
    parts.push(...searchTools.map((t) => `\`${t.name}\``))
  }

  if (lspTools.length > 0) {
    parts.push("`lsp_*`")
  }

  if (astTools.length > 0) {
    parts.push("`ast_grep`")
  }

  return parts.join(", ")
}

/**
 * 构建 Key Triggers 部分 - Phase 0 关键决策点
 * 
 * Key Triggers 出现在 Sisyphus 提示词的 Phase 0（意图识别阶段），
 * 影响主代理的初始决策，在任务分类之前就触发特定行为。
 * 
 * 例如：
 * - "External library mentioned → fire librarian background"
 * - "Complex architecture → consult Oracle"
 * 
 * 为什么重要：
 * - 避免主代理在探索阶段浪费时间
 * - 提前启动并行任务（librarian/explore 后台运行）
 * - 确保复杂任务获得正确的专家支持
 * 
 * @param agents - 当前可用的代理列表
 * @returns Markdown 格式的 Key Triggers 部分，如果没有触发器则返回空字符串
 */
export function buildKeyTriggersSection(agents: AvailableAgent[], _skills: AvailableSkill[] = []): string {
  const keyTriggers = agents
    .filter((a) => a.metadata.keyTrigger)
    .map((a) => `- ${a.metadata.keyTrigger}`)

  if (keyTriggers.length === 0) return ""

  return `### 关键触发器（在分类之前检查）：

${keyTriggers.join("\n")}
- **"调查" + "创建 PR"** → 不仅仅是研究。预期完整的实现周期。`
}

/**
 * 构建 Tool & Agent Selection 表格 - 成本感知的资源选择指南
 * 
 * 这个表格是 Sisyphus 决策的核心参考，按成本排序展示可用资源：
 * FREE（直接工具）→ CHEAP（快速代理）→ EXPENSIVE（高质量代理）
 * 
 * 表格结构：
 * | Resource              | Cost      | When to Use                    |
 * |-----------------------|-----------|--------------------------------|
 * | grep, glob, lsp_*     | FREE      | Not Complex, Scope Clear       |
 * | explore agent         | CHEAP     | Fast codebase grep             |
 * | librarian agent       | CHEAP     | Docs, GitHub search            |
 * | oracle agent          | EXPENSIVE | Complex architecture, debugging |
 * 
 * 为什么按成本排序：
 * - 引导 Sisyphus 优先使用低成本资源
 * - 避免过度使用昂贵的代理（如 Oracle）
 * - 实现成本感知的任务分解策略
 * 
 * @param agents - 当前可用的代理列表
 * @param tools - 当前可用的工具列表
 * @returns Markdown 表格格式的资源选择指南
 */
export function buildToolSelectionTable(
  agents: AvailableAgent[],
  tools: AvailableTool[] = [],
  _skills: AvailableSkill[] = []
): string {
  const rows: string[] = [
    "### 工具与代理选择：",
    "",
  ]

  rows.push("| 资源 | 成本 | 何时使用 |")
  rows.push("|----------|------|-------------|")

  if (tools.length > 0) {
    const toolsDisplay = formatToolsForPrompt(tools)
    rows.push(`| ${toolsDisplay} | 免费 | 不复杂、范围明确、无隐含假设 |`)
  }

  // 按成本排序：FREE < CHEAP < EXPENSIVE
  const costOrder = { FREE: 0, CHEAP: 1, EXPENSIVE: 2 }
  const sortedAgents = [...agents]
    .filter((a) => a.metadata.category !== "utility")
    .sort((a, b) => costOrder[a.metadata.cost] - costOrder[b.metadata.cost])

  for (const agent of sortedAgents) {
    const shortDesc = agent.description.split(".")[0] || agent.description
    rows.push(`| \`${agent.name}\` 代理 | ${agent.metadata.cost} | ${shortDesc} |`)
  }

  rows.push("")
  rows.push("**默认流程**：explore/librarian（后台）+ 工具 → oracle（如需要）")

  return rows.join("\n")
}

export function buildExploreSection(agents: AvailableAgent[]): string {
  const exploreAgent = agents.find((a) => a.name === "explore")
  if (!exploreAgent) return ""

  const useWhen = exploreAgent.metadata.useWhen || []
  const avoidWhen = exploreAgent.metadata.avoidWhen || []

  return `### Explore 代理 = 上下文 Grep

将其作为**对等工具**使用，而非后备方案。自由启动。

| 使用直接工具 | 使用 Explore 代理 |
|------------------|-------------------|
${avoidWhen.map((w) => `| ${w} |  |`).join("\n")}
${useWhen.map((w) => `|  | ${w} |`).join("\n")}`
}

export function buildLibrarianSection(agents: AvailableAgent[]): string {
  const librarianAgent = agents.find((a) => a.name === "librarian")
  if (!librarianAgent) return ""

  const useWhen = librarianAgent.metadata.useWhen || []

  return `### Librarian 代理 = 参考 Grep

搜索**外部参考**（文档、开源软件、网络）。当涉及不熟悉的库时主动启动。

| 上下文 Grep（内部） | 参考 Grep（外部） |
|----------------------------|---------------------------|
| 搜索我们的代码库 | 搜索外部资源 |
| 在此仓库中查找模式 | 在其他仓库中查找示例 |
| 我们的代码如何工作？ | 这个库如何工作？ |
| 项目特定逻辑 | 官方 API 文档 |
| | 库的最佳实践和特性 |
| | 开源实现示例 |

**触发短语**（立即启动 librarian）：
${useWhen.map((w) => `- "${w}"`).join("\n")}`
}

export function buildDelegationTable(agents: AvailableAgent[]): string {
  const rows: string[] = [
    "### 委托表：",
    "",
    "| 领域 | 委托给 | 触发器 |",
    "|--------|-------------|---------|",
  ]

  for (const agent of agents) {
    for (const trigger of agent.metadata.triggers) {
      rows.push(`| ${trigger.domain} | \`${agent.name}\` | ${trigger.trigger} |`)
    }
  }

  return rows.join("\n")
}

/**
 * 构建 Category + Skills Delegation 指南 - delegate_task 的完整使用说明
 * 
 * 这是 oh-my-opencode 的核心创新之一：将 category（领域优化模型）和 skill（专业知识注入）
 * 结合起来，实现精确的任务委托。
 * 
 * **Category（分类）：**
 * - 每个 category 配置了针对该领域优化的模型
 * - 例如："visual-engineering" 使用 Gemini 3 Pro（前端专家）
 * - 例如："ultrabrain" 使用高推理能力模型（复杂架构）
 * 
 * **Skill（技能）：**
 * - 技能向子代理注入专业知识（如 playwright、git-master）
 * - 子代理是无状态的，只知道你告诉它的内容
 * - 遗漏相关技能 = 子代理缺少关键知识 = 次优输出
 * 
 * **强制协议：**
 * 提示词要求 Sisyphus：
 * 1. 评估所有技能的相关性
 * 2. 如果不包含某个技能，必须书面说明理由
 * 3. 强制思考过程，避免懒惰遗漏
 * 
 * 这个函数生成包含完整使用协议的指南部分。
 * 
 * @param categories - 可用的任务分类列表
 * @param skills - 可用的技能列表
 * @returns Markdown 格式的完整委托指南，包括强制协议
 */
export function buildCategorySkillsDelegationGuide(categories: AvailableCategory[], skills: AvailableSkill[]): string {
  if (categories.length === 0 && skills.length === 0) return ""

  const categoryRows = categories.map((c) => {
    const desc = c.description || c.name
    return `| \`${c.name}\` | ${desc} |`
  })

  const skillRows = skills.map((s) => {
    const desc = s.description.split(".")[0] || s.description
    return `| \`${s.name}\` | ${desc} |`
  })

  return `### 分类 + 技能委托系统

**delegate_task() 结合分类和技能以实现最佳任务执行。**

#### 可用分类（领域优化模型）

每个分类都配置了针对该领域优化的模型。阅读描述以了解何时使用。

| 分类 | 领域 / 最适合 |
|----------|-------------------|
${categoryRows.join("\n")}

#### 可用技能（领域专业知识注入）

技能向子代理注入专业指令。阅读描述以了解每个技能何时适用。

| 技能 | 专业领域 |
|-------|------------------|
${skillRows.join("\n")}

---

### 强制要求：分类 + 技能选择协议

**步骤 1：选择分类**
- 阅读每个分类的描述
- 将任务需求与分类领域匹配
- 选择领域最适合任务的分类

**步骤 2：评估所有技能**
对于上面列出的每个技能，问自己：
> "这个技能的专业领域是否与我的任务重叠？"

- 如果是 → 包含在 \`load_skills=[...]\` 中
- 如果否 → 你必须说明理由（见下文）

**步骤 3：说明遗漏理由**

如果你选择不包含可能相关的技能，你必须提供：

\`\`\`
技能评估 "[skill-name]"：
- 技能领域：[技能描述所说的内容]
- 任务领域：[你的任务是关于什么的]
- 决定：遗漏
- 理由：[领域不重叠的具体解释]
\`\`\`

**为什么说明理由是强制性的：**
- 强制你实际阅读技能描述
- 防止懒惰地遗漏可能有用的技能
- 子代理是无状态的 - 它们只知道你告诉它们的内容
- 遗漏相关技能 = 次优输出

---

### 委托模式

\`\`\`typescript
delegate_task(
  category="[selected-category]",
  load_skills=["skill-1", "skill-2"],  // 包含所有相关技能
  prompt="..."
)
\`\`\`

**反模式（会产生糟糕的结果）：**
\`\`\`typescript
delegate_task(category="...", load_skills=[], prompt="...")  // 空的 load_skills 且没有说明理由
\`\`\``
}

export function buildOracleSection(agents: AvailableAgent[]): string {
  const oracleAgent = agents.find((a) => a.name === "oracle")
  if (!oracleAgent) return ""

  const useWhen = oracleAgent.metadata.useWhen || []
  const avoidWhen = oracleAgent.metadata.avoidWhen || []

  return `<Oracle_Usage>
## Oracle — 只读高智商顾问

Oracle 是一个只读、昂贵、高质量的推理模型，用于调试和架构。仅供咨询。

### 何时咨询：

| 触发器 | 行动 |
|---------|--------|
${useWhen.map((w) => `| ${w} | 先咨询 Oracle，然后实现 |`).join("\n")}

### 何时不咨询：

${avoidWhen.map((w) => `- ${w}`).join("\n")}

### 使用模式：
在调用前简要宣布"因 [原因] 咨询 Oracle"。

**例外**：这是唯一在行动前宣布的情况。对于所有其他工作，立即开始，无需状态更新。
</Oracle_Usage>`
}

export function buildHardBlocksSection(): string {
  const blocks = [
    "| 类型错误抑制（`as any`、`@ts-ignore`） | 绝不 |",
    "| 未经明确请求的提交 | 绝不 |",
    "| 对未读代码进行推测 | 绝不 |",
    "| 失败后将代码留在损坏状态 | 绝不 |",
  ]

  return `## 硬性限制（绝不违反）

| 约束 | 无例外 |
|------------|---------------|
${blocks.join("\n")}`
}

export function buildAntiPatternsSection(): string {
  const patterns = [
    "| **类型安全** | `as any`、`@ts-ignore`、`@ts-expect-error` |",
    "| **错误处理** | 空的 catch 块 `catch(e) {}` |",
    "| **测试** | 删除失败的测试以'通过' |",
    "| **搜索** | 为单行拼写错误或明显的语法错误启动代理 |",
    "| **调试** | 散弹式调试、随机更改 |",
  ]

  return `## 反模式（阻止性违规）

| 类别 | 禁止 |
|----------|-----------|
${patterns.join("\n")}`
}

export function buildUltraworkSection(
  agents: AvailableAgent[],
  categories: AvailableCategory[],
  skills: AvailableSkill[]
): string {
  const lines: string[] = []

  if (categories.length > 0) {
    lines.push("**分类**（用于实现任务）：")
    for (const cat of categories) {
      const shortDesc = cat.description || cat.name
      lines.push(`- \`${cat.name}\`：${shortDesc}`)
    }
    lines.push("")
  }

  if (skills.length > 0) {
    lines.push("**技能**（与分类结合 - 评估所有相关性）：")
    for (const skill of skills) {
      const shortDesc = skill.description.split(".")[0] || skill.description
      lines.push(`- \`${skill.name}\`：${shortDesc}`)
    }
    lines.push("")
  }

  if (agents.length > 0) {
    const ultraworkAgentPriority = ["explore", "librarian", "plan", "oracle"]
    const sortedAgents = [...agents].sort((a, b) => {
      const aIdx = ultraworkAgentPriority.indexOf(a.name)
      const bIdx = ultraworkAgentPriority.indexOf(b.name)
      if (aIdx === -1 && bIdx === -1) return 0
      if (aIdx === -1) return 1
      if (bIdx === -1) return -1
      return aIdx - bIdx
    })

    lines.push("**代理**（用于专业咨询/探索）：")
    for (const agent of sortedAgents) {
      const shortDesc = agent.description.split(".")[0] || agent.description
      const suffix = agent.name === "explore" || agent.name === "librarian" ? "（多个）" : ""
      lines.push(`- \`${agent.name}${suffix}\`：${shortDesc}`)
    }
  }

  return lines.join("\n")
}
