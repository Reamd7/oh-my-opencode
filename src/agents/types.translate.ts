import type { AgentConfig } from "@opencode-ai/sdk"

/**
 * 代理工厂函数类型
 * 
 * 接收模型名称，返回完整的代理配置。
 * 这种工厂模式允许在运行时根据用户配置动态选择模型。
 * 
 * @param model - 模型标识符，格式如 "anthropic/claude-opus-4-5" 或 "openai/gpt-5.2"
 * @returns 完整的代理配置对象，包含提示词、工具限制、温度等
 * 
 * @example
 * ```typescript
 * const oracleFactory: AgentFactory = (model) => ({
 *   model,
 *   prompt: "You are Oracle...",
 *   temperature: 0.1,
 *   toolRestrictions: { deniedTools: ["write", "edit"] }
 * })
 * ```
 */
export type AgentFactory = (model: string) => AgentConfig

/**
 * 代理分类 - 用于在 Sisyphus 提示词中分组展示
 * 
 * 不同分类决定代理在主提示词中的位置和上下文：
 * - `exploration`: 探索类代理（explore, librarian），用于快速搜索和信息收集
 * - `specialist`: 专家代理（oracle, multimodal-looker），用于特定领域的深度工作
 * - `advisor`: 顾问代理（metis, momus），用于咨询和审查
 * - `utility`: 工具类代理，用于辅助功能
 * 
 * 分类影响：
 * - Tool Selection 表格中的排序
 * - Delegation Table 中的分组
 * - Key Triggers 部分的优先级
 */
export type AgentCategory = "exploration" | "specialist" | "advisor" | "utility"

/**
 * 代理成本分类 - 用于 Tool Selection 表格
 * 
 * 成本分类帮助 Sisyphus 决定何时使用哪个代理：
 * - `FREE`: 直接工具（grep, glob, lsp_*），零成本，优先使用
 * - `CHEAP`: 快速代理（explore, librarian），低成本，可并行使用多个
 * - `EXPENSIVE`: 高质量代理（oracle），高成本，仅在必要时使用
 * 
 * 这种分类实现了成本感知的代理选择策略。
 */
export type AgentCost = "FREE" | "CHEAP" | "EXPENSIVE"

/**
 * 委托触发器 - 定义何时将任务委托给特定代理
 * 
 * 用于生成 Sisyphus 提示词中的 Delegation Table，明确告诉主代理
 * 在什么情况下应该委托给哪个专家代理。
 * 
 * @example
 * ```typescript
 * // Oracle 的委托触发器示例
 * {
 *   domain: "Architecture decisions",
 *   trigger: "Multi-system tradeoffs, unfamiliar patterns"
 * }
 * 
 * // Librarian 的委托触发器示例
 * {
 *   domain: "External documentation",
 *   trigger: "Unfamiliar library usage, API documentation needed"
 * }
 * ```
 */
export interface DelegationTrigger {
  /** 工作领域（例如 "Frontend UI/UX"、"Architecture decisions"） */
  domain: string
  /** 何时委托的具体条件（例如 "Visual changes only"、"After 2+ failed attempts"） */
  trigger: string
}

/**
 * 代理提示词元数据 - 元数据驱动的提示词生成核心
 * 
 * **为什么使用元数据驱动设计：**
 * - 新增代理时，只需定义元数据，提示词自动更新
 * - 避免手动维护 Sisyphus 提示词中的多个表格和列表
 * - 确保所有代理信息在提示词中保持一致
 * - 支持动态展示可用代理列表（根据配置启用/禁用）
 * 
 * **元数据如何影响提示词生成：**
 * - `category` + `cost` → 决定在 Tool Selection 表格中的位置
 * - `triggers` → 生成 Delegation Table，指导主代理何时委托
 * - `keyTrigger` → 出现在 Phase 0，影响主代理的初始决策
 * - `useWhen`/`avoidWhen` → 生成专门的使用指南部分（如 Oracle 部分）
 * 
 * @example
 * ```typescript
 * // Oracle 的元数据示例
 * export const ORACLE_PROMPT_METADATA: AgentPromptMetadata = {
 *   category: "specialist",
 *   cost: "EXPENSIVE",
 *   triggers: [
 *     { domain: "Architecture decisions", trigger: "Multi-system tradeoffs" },
 *     { domain: "Hard debugging", trigger: "After 2+ failed attempts" }
 *   ],
 *   useWhen: ["Complex architecture design", "After completing significant work"],
 *   avoidWhen: ["Simple file operations", "First attempt at any fix"],
 *   keyTrigger: "Complex architecture or 2+ failed attempts → consult Oracle"
 * }
 * ```
 */
export interface AgentPromptMetadata {
  /** 代理分类，用于在提示词中分组（exploration/specialist/advisor/utility） */
  category: AgentCategory

  /** 成本分类，用于 Tool Selection 表格的排序（FREE/CHEAP/EXPENSIVE） */
  cost: AgentCost

  /** 委托触发器列表，用于生成 Delegation Table */
  triggers: DelegationTrigger[]

  /** 何时使用此代理的场景列表，用于生成详细的使用指南 */
  useWhen?: string[]

  /** 何时不使用此代理的场景列表，避免不必要的调用 */
  avoidWhen?: string[]

  /** 可选的专用提示词部分（Markdown 格式），如 Oracle 的 <Oracle_Usage> 部分 */
  dedicatedSection?: string

  /** 提示词中使用的别名（例如 "Oracle" 而非 "oracle"），用于更友好的展示 */
  promptAlias?: string

  /** Phase 0 关键触发器，出现在意图识别阶段，影响初始决策 */
  keyTrigger?: string
}

/**
 * 判断是否为 GPT 系列模型
 * 
 * 用于模型特定的逻辑处理（如 thinking 配置）。
 * GPT 模型可能需要不同的提示词格式或参数设置。
 */
export function isGptModel(model: string): boolean {
  return model.startsWith("openai/") || model.startsWith("github-copilot/gpt-")
}

/**
 * 内置代理名称联合类型
 * 
 * 所有由 oh-my-opencode 提供的代理。
 * 新增代理时需要在此添加名称，并在 schema.ts 的 AgentNameSchema 中同步更新。
 */
export type BuiltinAgentName =
  | "sisyphus"
  | "oracle"
  | "librarian"
  | "explore"
  | "multimodal-looker"
  | "metis"
  | "momus"
  | "atlas"

/**
 * 可覆盖的代理名称
 * 
 * 包括内置代理和 OpenCode 的默认代理（如 "build"）。
 * 用户可以通过配置文件覆盖这些代理的模型、温度、提示词等。
 */
export type OverridableAgentName =
  | "build"
  | BuiltinAgentName

/**
 * 代理名称（当前等同于 BuiltinAgentName）
 */
export type AgentName = BuiltinAgentName

/**
 * 代理覆盖配置
 * 
 * 允许用户部分覆盖代理配置，而不是完全替换。
 * - 继承自 Partial<AgentConfig>：可覆盖 model, temperature, toolRestrictions 等
 * - `prompt_append`: 在原有提示词后追加内容（而非完全替换）
 * - `variant`: 模型变体（如 "haiku" vs "sonnet"）
 * 
 * @example
 * ```typescript
 * // 在配置文件中覆盖 Oracle 的模型
 * {
 *   "agents": {
 *     "oracle": {
 *       "model": "anthropic/claude-sonnet-4-5",
 *       "temperature": 0.2,
 *       "prompt_append": "Additional instructions..."
 *     }
 *   }
 * }
 * ```
 */
export type AgentOverrideConfig = Partial<AgentConfig> & {
  /** 追加到提示词末尾的内容（不会替换原有提示词） */
  prompt_append?: string
  /** 模型变体标识符 */
  variant?: string
}

/**
 * 代理覆盖配置集合
 * 
 * 用于在配置文件的 `agents` 字段中批量覆盖多个代理。
 */
export type AgentOverrides = Partial<Record<OverridableAgentName, AgentOverrideConfig>>
