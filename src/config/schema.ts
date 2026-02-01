/**
 * @fileoverview Oh My OpenCode 配置架构定义
 * 
 * 这个文件定义了插件的完整配置架构，使用Zod进行运行时验证。
 * 
 * **配置文件位置：**
 * - 项目配置：`.opencode/oh-my-opencode.json`
 * - 用户配置：`~/.config/opencode/oh-my-opencode.json`
 * - 配置优先级：项目 > 用户 > 默认
 * 
 * **支持格式：**
 * - JSON：标准JSON格式
 * - JSONC：支持注释和尾随逗号
 * 
 * @module config/schema
 */

import { z } from "zod"
import { AnyMcpNameSchema, McpNameSchema } from "../mcp/types"

// ============================================================================
// 权限配置架构
// ============================================================================

/**
 * 权限值枚举
 * - ask: 每次执行前询问用户
 * - allow: 自动允许执行
 * - deny: 拒绝执行
 */
const PermissionValue = z.enum(["ask", "allow", "deny"])

/**
 * Bash权限配置
 * 可以是简单的权限值，或者针对特定命令的权限映射
 * @example
 * // 简单模式：所有bash命令都需要询问
 * "bash": "ask"
 * 
 * // 细粒度模式：针对特定命令设置权限
 * "bash": {
 *   "rm": "ask",
 *   "git": "allow",
 *   "npm": "allow"
 * }
 */
const BashPermission = z.union([
  PermissionValue,
  z.record(z.string(), PermissionValue),
])

/**
 * 代理权限配置架构
 * 控制代理可以执行的操作类型
 */
const AgentPermissionSchema = z.object({
  /** 编辑文件权限 */
  edit: PermissionValue.optional(),
  /** Bash命令执行权限 */
  bash: BashPermission.optional(),
  /** Web获取权限 */
  webfetch: PermissionValue.optional(),
  /** 死循环保护权限（防止代理陷入无限循环） */
  doom_loop: PermissionValue.optional(),
  /** 外部目录访问权限 */
  external_directory: PermissionValue.optional(),
})

// ============================================================================
// 代理和技能名称枚举
// ============================================================================

/**
 * 内置代理名称枚举
 * 这些是oh-my-opencode提供的专业化AI代理
 */
export const BuiltinAgentNameSchema = z.enum([
  "sisyphus",           // 主编排器（Opus 4.5）
  "prometheus",         // 战略规划器
  "oracle",             // 架构咨询和调试（GPT 5.2）
  "librarian",          // 文档搜索和代码探索（Sonnet 4.5）
  "explore",            // 快速代码库grep（Grok Code）
  "multimodal-looker",  // PDF/图像分析（Gemini 3 Flash）
  "metis",              // 计划顾问
  "momus",              // 计划评审
  "atlas",              // 高级编排器
])

/**
 * 内置技能名称枚举
 * 这些是oh-my-opencode提供的专业化技能
 */
export const BuiltinSkillNameSchema = z.enum([
  "playwright",         // 浏览器自动化（Playwright MCP）
  "agent-browser",      // 代理浏览器（Vercel agent-browser）
  "frontend-ui-ux",     // 前端UI/UX开发
  "git-master",         // Git操作（原子提交、rebase等）
])

/**
 * 可覆盖的代理名称枚举
 * 这些代理的配置可以通过agents配置项覆盖
 */
export const OverridableAgentNameSchema = z.enum([
  "build",              // OpenCode内置构建代理
  "plan",               // OpenCode内置计划代理
  "sisyphus",           // 主编排器
  "sisyphus-junior",    // Sisyphus Junior执行器
  "OpenCode-Builder",   // OpenCode构建器
  "prometheus",         // 战略规划器
  "metis",              // 计划顾问
  "momus",              // 计划评审
  "oracle",             // 架构咨询
  "librarian",          // 文档搜索
  "explore",            // 代码探索
  "multimodal-looker",  // 多模态分析
  "atlas",              // 高级编排器
])

export const AgentNameSchema = BuiltinAgentNameSchema

export const HookNameSchema = z.enum([
  "todo-continuation-enforcer",
  "context-window-monitor",
  "session-recovery",
  "session-notification",
  "comment-checker",
  "grep-output-truncator",
  "tool-output-truncator",
  "directory-agents-injector",
  "directory-readme-injector",
  "empty-task-response-detector",
  "think-mode",
  "anthropic-context-window-limit-recovery",
  "rules-injector",
  "background-notification",
  "auto-update-checker",
  "startup-toast",
  "keyword-detector",
  "agent-usage-reminder",
  "non-interactive-env",
  "interactive-bash-session",

  "thinking-block-validator",
  "ralph-loop",
  "category-skill-reminder",

  "compaction-context-injector",
  "claude-code-hooks",
  "auto-slash-command",
  "edit-error-recovery",
  "delegate-task-retry",
  "prometheus-md-only",
  "sisyphus-junior-notepad",
  "start-work",
  "atlas",
])

export const BuiltinCommandNameSchema = z.enum([
  "init-deep",
  "start-work",
])

// ============================================================================
// 代理覆盖配置架构
// ============================================================================

/**
 * 代理覆盖配置架构
 * 用于自定义任何代理的行为、模型、温度等参数
 * 
 * @example
 * ```json
 * {
 *   "agents": {
 *     "sisyphus": {
 *       "category": "ultrabrain",
 *       "temperature": 0.1,
 *       "skills": ["git-master"],
 *       "permission": {
 *         "bash": "allow",
 *         "edit": "allow"
 *       }
 *     }
 *   }
 * }
 * ```
 */
export const AgentOverrideConfigSchema = z.object({
  /** @deprecated 已弃用，请使用 `category` 代替。模型将从分类默认值继承。 */
  model: z.string().optional(),
  
  /** 模型变体（如 "high"、"medium"、"low"） */
  variant: z.string().optional(),
  
  /** 分类名称，从CategoryConfig继承模型和其他设置 */
  category: z.string().optional(),
  
  /** 要注入到代理提示词中的技能名称列表 */
  skills: z.array(z.string()).optional(),
  
  /** 温度参数（0-2），控制输出的随机性。代码生成建议0.1-0.3 */
  temperature: z.number().min(0).max(2).optional(),
  
  /** Top-p采样参数（0-1），控制输出的多样性 */
  top_p: z.number().min(0).max(1).optional(),
  
  /** 完全替换代理的提示词 */
  prompt: z.string().optional(),
  
  /** 追加到代理提示词末尾的内容 */
  prompt_append: z.string().optional(),
  
  /** 工具启用/禁用配置，键为工具名，值为是否启用 */
  tools: z.record(z.string(), z.boolean()).optional(),
  
  /** 是否禁用此代理 */
  disable: z.boolean().optional(),
  
  /** 代理描述，显示在delegate_task提示词中 */
  description: z.string().optional(),
  
  /** 代理模式：subagent（仅子代理）、primary（仅主代理）、all（全部） */
  mode: z.enum(["subagent", "primary", "all"]).optional(),
  
  /** 代理颜色（十六进制格式，如 "#FF5733"） */
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  
  /** 代理权限配置 */
  permission: AgentPermissionSchema.optional(),
  
  /** 最大响应token数。直接传递给OpenCode SDK。 */
  maxTokens: z.number().optional(),
  
  /** 扩展思考配置（Anthropic专用）。覆盖分类和默认设置。 */
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  
  /** 推理努力级别（OpenAI专用）。覆盖分类和默认设置。 */
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  
  /** 文本详细程度级别 */
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  
  /** 提供商特定选项。直接传递给OpenCode SDK。 */
  providerOptions: z.record(z.string(), z.unknown()).optional(),
})

export const AgentOverridesSchema = z.object({
  build: AgentOverrideConfigSchema.optional(),
  plan: AgentOverrideConfigSchema.optional(),
  sisyphus: AgentOverrideConfigSchema.optional(),
  "sisyphus-junior": AgentOverrideConfigSchema.optional(),
  "OpenCode-Builder": AgentOverrideConfigSchema.optional(),
  prometheus: AgentOverrideConfigSchema.optional(),
  metis: AgentOverrideConfigSchema.optional(),
  momus: AgentOverrideConfigSchema.optional(),
  oracle: AgentOverrideConfigSchema.optional(),
  librarian: AgentOverrideConfigSchema.optional(),
  explore: AgentOverrideConfigSchema.optional(),
  "multimodal-looker": AgentOverrideConfigSchema.optional(),
  atlas: AgentOverrideConfigSchema.optional(),
})

export const ClaudeCodeConfigSchema = z.object({
  mcp: z.boolean().optional(),
  commands: z.boolean().optional(),
  skills: z.boolean().optional(),
  agents: z.boolean().optional(),
  hooks: z.boolean().optional(),
  plugins: z.boolean().optional(),
  plugins_override: z.record(z.string(), z.boolean()).optional(),
})

export const SisyphusAgentConfigSchema = z.object({
  disabled: z.boolean().optional(),
  default_builder_enabled: z.boolean().optional(),
  planner_enabled: z.boolean().optional(),
  replace_plan: z.boolean().optional(),
})

export const CategoryConfigSchema = z.object({
  /** Human-readable description of the category's purpose. Shown in delegate_task prompt. */
  description: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  prompt_append: z.string().optional(),
  /** Mark agent as unstable - forces background mode for monitoring. Auto-enabled for gemini models. */
  is_unstable_agent: z.boolean().optional(),
})

export const BuiltinCategoryNameSchema = z.enum([
  "visual-engineering",
  "ultrabrain",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
])

export const CategoriesConfigSchema = z.record(z.string(), CategoryConfigSchema)

export const CommentCheckerConfigSchema = z.object({
  /** Custom prompt to replace the default warning message. Use {{comments}} placeholder for detected comments XML. */
  custom_prompt: z.string().optional(),
})

export const DynamicContextPruningConfigSchema = z.object({
  /** Enable dynamic context pruning (default: false) */
  enabled: z.boolean().default(false),
  /** Notification level: off, minimal, or detailed (default: detailed) */
  notification: z.enum(["off", "minimal", "detailed"]).default("detailed"),
  /** Turn protection - prevent pruning recent tool outputs */
  turn_protection: z.object({
    enabled: z.boolean().default(true),
    turns: z.number().min(1).max(10).default(3),
  }).optional(),
  /** Tools that should never be pruned */
  protected_tools: z.array(z.string()).default([
    "task", "todowrite", "todoread",
    "lsp_rename",
    "session_read", "session_write", "session_search",
  ]),
  /** Pruning strategies configuration */
  strategies: z.object({
    /** Remove duplicate tool calls (same tool + same args) */
    deduplication: z.object({
      enabled: z.boolean().default(true),
    }).optional(),
    /** Prune write inputs when file subsequently read */
    supersede_writes: z.object({
      enabled: z.boolean().default(true),
      /** Aggressive mode: prune any write if ANY subsequent read */
      aggressive: z.boolean().default(false),
    }).optional(),
    /** Prune errored tool inputs after N turns */
    purge_errors: z.object({
      enabled: z.boolean().default(true),
      turns: z.number().min(1).max(20).default(5),
    }).optional(),
  }).optional(),
})

export const ExperimentalConfigSchema = z.object({
  aggressive_truncation: z.boolean().optional(),
  auto_resume: z.boolean().optional(),
  /** Truncate all tool outputs, not just whitelisted tools (default: false). Tool output truncator is enabled by default - disable via disabled_hooks. */
  truncate_all_tool_outputs: z.boolean().optional(),
  /** Dynamic context pruning configuration */
  dynamic_context_pruning: DynamicContextPruningConfigSchema.optional(),
})

export const SkillSourceSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    recursive: z.boolean().optional(),
    glob: z.string().optional(),
  }),
])

export const SkillDefinitionSchema = z.object({
  description: z.string().optional(),
  template: z.string().optional(),
  from: z.string().optional(),
  model: z.string().optional(),
  agent: z.string().optional(),
  subtask: z.boolean().optional(),
  "argument-hint": z.string().optional(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  "allowed-tools": z.array(z.string()).optional(),
  disable: z.boolean().optional(),
})

export const SkillEntrySchema = z.union([
  z.boolean(),
  SkillDefinitionSchema,
])

export const SkillsConfigSchema = z.union([
  z.array(z.string()),
  z.record(z.string(), SkillEntrySchema).and(z.object({
    sources: z.array(SkillSourceSchema).optional(),
    enable: z.array(z.string()).optional(),
    disable: z.array(z.string()).optional(),
  }).partial()),
])

export const RalphLoopConfigSchema = z.object({
  /** Enable ralph loop functionality (default: false - opt-in feature) */
  enabled: z.boolean().default(false),
  /** Default max iterations if not specified in command (default: 100) */
  default_max_iterations: z.number().min(1).max(1000).default(100),
  /** Custom state file directory relative to project root (default: .opencode/) */
  state_dir: z.string().optional(),
})

export const BackgroundTaskConfigSchema = z.object({
  defaultConcurrency: z.number().min(1).optional(),
  providerConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  modelConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  /** Stale timeout in milliseconds - interrupt tasks with no activity for this duration (default: 180000 = 3 minutes, minimum: 60000 = 1 minute) */
  staleTimeoutMs: z.number().min(60000).optional(),
})

export const NotificationConfigSchema = z.object({
  /** Force enable session-notification even if external notification plugins are detected (default: false) */
  force_enable: z.boolean().optional(),
})

export const GitMasterConfigSchema = z.object({
  /** Add "Ultraworked with Sisyphus" footer to commit messages (default: true) */
  commit_footer: z.boolean().default(true),
  /** Add "Co-authored-by: Sisyphus" trailer to commit messages (default: true) */
  include_co_authored_by: z.boolean().default(true),
})

export const BrowserAutomationProviderSchema = z.enum(["playwright", "agent-browser", "dev-browser"])

export const BrowserAutomationConfigSchema = z.object({
  /**
   * Browser automation provider to use for the "playwright" skill.
   * - "playwright": Uses Playwright MCP server (@playwright/mcp) - default
   * - "agent-browser": Uses Vercel's agent-browser CLI (requires: bun add -g agent-browser)
   * - "dev-browser": Uses dev-browser skill with persistent browser state
   */
  provider: BrowserAutomationProviderSchema.default("playwright"),
})

export const TmuxLayoutSchema = z.enum([
  'main-horizontal',  // main pane top, agent panes bottom stack
  'main-vertical',    // main pane left, agent panes right stack (default)
  'tiled',            // all panes same size grid
  'even-horizontal',  // all panes horizontal row
  'even-vertical',    // all panes vertical stack
])

export const TmuxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  layout: TmuxLayoutSchema.default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60),
  main_pane_min_width: z.number().min(40).default(120),
  agent_pane_min_width: z.number().min(20).default(40),
})

export const SisyphusTasksConfigSchema = z.object({
  /** Enable Sisyphus Tasks system (default: false) */
  enabled: z.boolean().default(false),
  /** Storage path for tasks (default: .sisyphus/tasks) */
  storage_path: z.string().default(".sisyphus/tasks"),
  /** Enable Claude Code path compatibility mode */
  claude_code_compat: z.boolean().default(false),
})

export const SisyphusSwarmConfigSchema = z.object({
  /** Enable Sisyphus Swarm system (default: false) */
  enabled: z.boolean().default(false),
  /** Storage path for teams (default: .sisyphus/teams) */
  storage_path: z.string().default(".sisyphus/teams"),
  /** UI mode: toast notifications, tmux panes, or both */
  ui_mode: z.enum(["toast", "tmux", "both"]).default("toast"),
})

export const SisyphusConfigSchema = z.object({
  tasks: SisyphusTasksConfigSchema.optional(),
  swarm: SisyphusSwarmConfigSchema.optional(),
})
// ============================================================================
// 主配置架构
// ============================================================================

/**
 * Oh My OpenCode 主配置架构
 * 
 * 这是插件的根配置对象，包含所有可配置选项。
 * 
 * **配置文件示例：**
 * ```json
 * {
 *   "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/schema.json",
 *   "disabled_hooks": ["comment-checker"],
 *   "agents": {
 *     "sisyphus": {
 *       "temperature": 0.1
 *     }
 *   },
 *   "auto_update": true
 * }
 * ```
 * 
 * @see {@link https://github.com/code-yeongyu/oh-my-opencode/blob/master/docs/configurations.md} 完整配置文档
 */
export const OhMyOpenCodeConfigSchema = z.object({
  /** JSON Schema引用，用于IDE自动补全和验证 */
  $schema: z.string().optional(),
  
  /** 禁用的MCP服务器列表（如 ["websearch", "context7"]） */
  disabled_mcps: z.array(AnyMcpNameSchema).optional(),
  
  /** 禁用的代理列表（如 ["oracle", "librarian"]） */
  disabled_agents: z.array(BuiltinAgentNameSchema).optional(),
  
  /** 禁用的技能列表（如 ["playwright", "git-master"]） */
  disabled_skills: z.array(BuiltinSkillNameSchema).optional(),
  
  /** 禁用的钩子列表（如 ["comment-checker", "todo-continuation-enforcer"]） */
  disabled_hooks: z.array(HookNameSchema).optional(),
  
  /** 禁用的命令列表（如 ["init-deep", "start-work"]） */
  disabled_commands: z.array(BuiltinCommandNameSchema).optional(),
  
  /** 代理覆盖配置，用于自定义代理行为 */
  agents: AgentOverridesSchema.optional(),
  
  /** 分类配置，用于定义任务委托的分类和默认模型 */
  categories: CategoriesConfigSchema.optional(),
  
  /** Claude Code兼容层配置 */
  claude_code: ClaudeCodeConfigSchema.optional(),
  
  /** Sisyphus代理配置（主编排器） */
  sisyphus_agent: SisyphusAgentConfigSchema.optional(),
  
  /** 注释检查器配置 */
  comment_checker: CommentCheckerConfigSchema.optional(),
  
  /** 实验性功能配置 */
  experimental: ExperimentalConfigSchema.optional(),
  
  /** 是否启用自动更新检查（默认：true） */
  auto_update: z.boolean().optional(),
  
  /** 技能配置，用于加载自定义技能 */
  skills: SkillsConfigSchema.optional(),
  
  /** Ralph循环配置（自引用开发循环） */
  ralph_loop: RalphLoopConfigSchema.optional(),
  
  /** 后台任务配置（并发限制等） */
  background_task: BackgroundTaskConfigSchema.optional(),
  
  /** 通知配置 */
  notification: NotificationConfigSchema.optional(),
  
  /** Git Master配置（提交消息格式等） */
  git_master: GitMasterConfigSchema.optional(),
  
  /** 浏览器自动化引擎配置 */
  browser_automation_engine: BrowserAutomationConfigSchema.optional(),
  
  /** Tmux集成配置 */
  tmux: TmuxConfigSchema.optional(),
  
  /** Sisyphus系统配置（任务和团队） */
  sisyphus: SisyphusConfigSchema.optional(),
})

export type OhMyOpenCodeConfig = z.infer<typeof OhMyOpenCodeConfigSchema>
export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>
export type AgentOverrides = z.infer<typeof AgentOverridesSchema>
export type BackgroundTaskConfig = z.infer<typeof BackgroundTaskConfigSchema>
export type AgentName = z.infer<typeof AgentNameSchema>
export type HookName = z.infer<typeof HookNameSchema>
export type BuiltinCommandName = z.infer<typeof BuiltinCommandNameSchema>
export type BuiltinSkillName = z.infer<typeof BuiltinSkillNameSchema>
export type SisyphusAgentConfig = z.infer<typeof SisyphusAgentConfigSchema>
export type CommentCheckerConfig = z.infer<typeof CommentCheckerConfigSchema>
export type ExperimentalConfig = z.infer<typeof ExperimentalConfigSchema>
export type DynamicContextPruningConfig = z.infer<typeof DynamicContextPruningConfigSchema>
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>
export type RalphLoopConfig = z.infer<typeof RalphLoopConfigSchema>
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>
export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>
export type BuiltinCategoryName = z.infer<typeof BuiltinCategoryNameSchema>
export type GitMasterConfig = z.infer<typeof GitMasterConfigSchema>
export type BrowserAutomationProvider = z.infer<typeof BrowserAutomationProviderSchema>
export type BrowserAutomationConfig = z.infer<typeof BrowserAutomationConfigSchema>
export type TmuxConfig = z.infer<typeof TmuxConfigSchema>
export type TmuxLayout = z.infer<typeof TmuxLayoutSchema>
export type SisyphusTasksConfig = z.infer<typeof SisyphusTasksConfigSchema>
export type SisyphusSwarmConfig = z.infer<typeof SisyphusSwarmConfigSchema>
export type SisyphusConfig = z.infer<typeof SisyphusConfigSchema>

export { AnyMcpNameSchema, type AnyMcpName, McpNameSchema, type McpName } from "../mcp/types"
