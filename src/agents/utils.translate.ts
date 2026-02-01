/**
 * @file 代理工厂和配置管理 - 运行时代理构建系统
 * 
 * **核心职责：**
 * 1. 代理工厂注册（agentSources）：所有内置代理的工厂函数
 * 2. 代理构建（buildAgent）：从工厂或配置创建代理实例
 * 3. 模型解析（resolveModelWithFallback）：处理模型回退链
 * 4. 配置合并（mergeAgentConfig）：用户覆盖 + 默认配置
 * 5. 批量创建（createBuiltinAgents）：初始化所有代理
 * 
 * **为什么需要工厂模式：**
 * - 运行时模型选择：用户可以在配置中覆盖任何代理的模型
 * - 动态提示词注入：根据可用代理/工具/技能生成提示词
 * - 技能组合：category + skills 的动态组装
 * - 环境上下文：注入时区、日期等运行时信息
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { BuiltinAgentName, AgentOverrideConfig, AgentOverrides, AgentFactory, AgentPromptMetadata } from "./types"
import type { CategoriesConfig, CategoryConfig, GitMasterConfig } from "../config/schema"
import { createSisyphusAgent } from "./sisyphus"
import { createOracleAgent, ORACLE_PROMPT_METADATA } from "./oracle"
import { createLibrarianAgent, LIBRARIAN_PROMPT_METADATA } from "./librarian"
import { createExploreAgent, EXPLORE_PROMPT_METADATA } from "./explore"
import { createMultimodalLookerAgent, MULTIMODAL_LOOKER_PROMPT_METADATA } from "./multimodal-looker"
import { createMetisAgent } from "./metis"
import { createAtlasAgent } from "./atlas"
import { createMomusAgent } from "./momus"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "./dynamic-agent-prompt-builder"
import { deepMerge, fetchAvailableModels, resolveModelWithFallback, AGENT_MODEL_REQUIREMENTS, findCaseInsensitive, includesCaseInsensitive, readConnectedProvidersCache } from "../shared"
import { DEFAULT_CATEGORIES, CATEGORY_DESCRIPTIONS } from "../tools/delegate-task/constants"
import { resolveMultipleSkills } from "../features/opencode-skill-loader/skill-content"
import { createBuiltinSkills } from "../features/builtin-skills"
import type { LoadedSkill, SkillScope } from "../features/opencode-skill-loader/types"
import type { BrowserAutomationProvider } from "../config/schema"

/**
 * 代理源类型：工厂函数或静态配置
 * 
 * 工厂函数用于大多数代理（需要动态模型选择）
 * 静态配置用于不需要模型参数的简单代理
 */
type AgentSource = AgentFactory | AgentConfig

/**
 * 代理源注册表 - 所有内置代理的工厂函数
 * 
 * 这是代理系统的"构造函数注册表"。新增代理时需要：
 * 1. 在此添加工厂函数
 * 2. 在 types.ts 的 BuiltinAgentName 添加名称
 * 3. 在 schema.ts 的 AgentNameSchema 添加验证
 * 
 * **特殊处理：**
 * - Atlas: 需要 OrchestratorContext 而非简单的模型字符串
 *   因此在 createBuiltinAgents 中特殊处理，此处仅用于类型安全
 */
const agentSources: Record<BuiltinAgentName, AgentSource> = {
  sisyphus: createSisyphusAgent,
  oracle: createOracleAgent,
  librarian: createLibrarianAgent,
  explore: createExploreAgent,
  "multimodal-looker": createMultimodalLookerAgent,
  metis: createMetisAgent,
  momus: createMomusAgent,
  atlas: createAtlasAgent as unknown as AgentFactory,
}

/**
 * 代理元数据注册表 - 用于动态提示词生成
 * 
 * 只有需要在 Sisyphus 提示词中展示的代理才需要元数据。
 * Sisyphus 和 Atlas 自己不需要元数据（它们是编排器，不被委托）。
 * 
 * 元数据用于生成：
 * - Key Triggers（Phase 0）
 * - Tool Selection 表格
 * - Delegation Table
 * - 专用使用指南部分（如 Oracle Usage）
 */
const agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>> = {
  oracle: ORACLE_PROMPT_METADATA,
  librarian: LIBRARIAN_PROMPT_METADATA,
  explore: EXPLORE_PROMPT_METADATA,
  "multimodal-looker": MULTIMODAL_LOOKER_PROMPT_METADATA,
}

/**
 * 类型守卫：判断代理源是否为工厂函数
 */
function isFactory(source: AgentSource): source is AgentFactory {
  return typeof source === "function"
}

/**
 * 构建代理实例 - 从工厂或配置创建完整的代理配置
 * 
 * **构建流程：**
 * 1. 从工厂函数或静态配置创建基础代理
 * 2. 如果代理有 category，应用 category 的模型和温度配置
 * 3. 如果代理有 skills，解析技能并将内容注入提示词前面
 * 
 * **Category 配置覆盖：**
 * - 用户定义的 categories 与 DEFAULT_CATEGORIES 合并
 * - Category 的 model、temperature、variant 会覆盖代理的默认值
 * - 这允许用户统一配置某个领域的所有代理模型
 * 
 * **Skills 注入机制：**
 * - 技能内容注入到提示词最前面（优先级最高）
 * - 多个技能内容用 \n\n 连接
 * - 子代理通过这种方式获得专业知识（如 git-master、playwright）
 * 
 * @param source - 代理工厂函数或静态配置
 * @param model - 模型标识符
 * @param categories - 用户定义的 category 配置
 * @param gitMasterConfig - git-master 技能配置
 * @param browserProvider - 浏览器自动化提供商配置
 * @returns 完整的代理配置对象
 */
export function buildAgent(
  source: AgentSource,
  model: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  browserProvider?: BrowserAutomationProvider
): AgentConfig {
  // 步骤 1: 从工厂或配置创建基础代理
  const base = isFactory(source) ? source(model) : source
  const categoryConfigs: Record<string, CategoryConfig> = categories
    ? { ...DEFAULT_CATEGORIES, ...categories }
    : DEFAULT_CATEGORIES

  // 步骤 2: 应用 category 配置
  const agentWithCategory = base as AgentConfig & { category?: string; skills?: string[]; variant?: string }
  if (agentWithCategory.category) {
    const categoryConfig = categoryConfigs[agentWithCategory.category]
    if (categoryConfig) {
      if (!base.model) {
        base.model = categoryConfig.model
      }
      if (base.temperature === undefined && categoryConfig.temperature !== undefined) {
        base.temperature = categoryConfig.temperature
      }
      if (base.variant === undefined && categoryConfig.variant !== undefined) {
        base.variant = categoryConfig.variant
      }
    }
  }

  // 步骤 3: 注入技能内容到提示词
  if (agentWithCategory.skills?.length) {
    const { resolved } = resolveMultipleSkills(agentWithCategory.skills, { gitMasterConfig, browserProvider })
    if (resolved.size > 0) {
      const skillContent = Array.from(resolved.values()).join("\n\n")
      base.prompt = skillContent + (base.prompt ? "\n\n" + base.prompt : "")
    }
  }

  return base
}

/**
 * 创建 OhMyOpenCode 特定的环境上下文
 * 
 * **为什么注入环境信息：**
 * - 代理需要知道当前时间来正确解释"昨天"、"上周"等相对时间
 * - 时区信息影响日志时间戳的解释
 * - 地区信息影响日期格式和语言选择
 * 
 * **避免重复：**
 * OpenCode 的 system.ts 已提供：工作目录、平台、日期
 * 我们只添加 OpenCode 未提供的字段：具体时间、时区、地区
 * 
 * 参考：https://github.com/code-yeongyu/oh-my-opencode/issues/379
 * 
 * @returns XML 格式的环境上下文标签
 */
export function createEnvContext(): string {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const locale = Intl.DateTimeFormat().resolvedOptions().locale

  const dateStr = now.toLocaleDateString(locale, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  const timeStr = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })

  return `
<omo-env>
  Current date: ${dateStr}
  Current time: ${timeStr}
  Timezone: ${timezone}
  Locale: ${locale}
</omo-env>`
}

/**
 * 合并代理配置 - 用户覆盖 + 默认配置
 * 
 * **合并策略：**
 * - 深度合并：嵌套对象（如 toolRestrictions）会递归合并
 * - `prompt_append` 特殊处理：追加而非替换提示词
 * - 其他字段：直接覆盖基础配置
 * 
 * **为什么需要 prompt_append：**
 * - 用户可能只想添加额外指令，而非完全重写提示词
 * - 保留插件的核心提示词，仅追加自定义内容
 * 
 * @param base - 基础代理配置
 * @param override - 用户覆盖配置
 * @returns 合并后的完整配置
 */
function mergeAgentConfig(
  base: AgentConfig,
  override: AgentOverrideConfig
): AgentConfig {
  const { prompt_append, ...rest } = override
  const merged = deepMerge(base, rest as Partial<AgentConfig>)

  if (prompt_append && merged.prompt) {
    merged.prompt = merged.prompt + "\n" + prompt_append
  }

  return merged
}

/**
 * 映射技能作用域到位置类型
 * 
 * 技能作用域（SkillScope）→ 位置类型（location）的映射：
 * - user/opencode → "user"（用户目录的技能）
 * - project/opencode-project → "project"（项目目录的技能）
 * - 其他 → "plugin"（插件内置技能）
 */
function mapScopeToLocation(scope: SkillScope): AvailableSkill["location"] {
  if (scope === "user" || scope === "opencode") return "user"
  if (scope === "project" || scope === "opencode-project") return "project"
  return "plugin"
}

/**
 * 创建所有内置代理 - 代理系统的初始化入口
 * 
 * **初始化流程：**
 * 1. 获取可用模型列表（从 OpenCode client）
 * 2. 收集元数据：代理、分类、技能
 * 3. 遍历代理源，解析模型回退链
 * 4. 构建代理实例，应用用户覆盖
 * 5. 为 Sisyphus/Atlas 注入动态生成的提示词
 * 
 * **模型解析策略：**
 * - 优先级：UI 选择 → 用户配置 → 回退链 → 系统默认
 * - 回退链：AGENT_MODEL_REQUIREMENTS 定义的模型候选列表
 * - 只有在可用模型列表中的模型才会被使用
 * 
 * **特殊处理：**
 * - Sisyphus: 接收 availableAgents/availableSkills/availableCategories
 * - Atlas: 接收 OrchestratorContext（包含所有元数据）
 * - Librarian: 额外注入环境上下文（时区、日期）
 * 
 * @param disabledAgents - 禁用的代理名称列表（不区分大小写）
 * @param agentOverrides - 用户配置的代理覆盖
 * @param directory - 项目目录（用于环境上下文）
 * @param systemDefaultModel - OpenCode 的系统默认模型
 * @param categories - 用户定义的 category 配置
 * @param gitMasterConfig - git-master 技能配置
 * @param discoveredSkills - 已发现的用户/项目技能
 * @param client - OpenCode client（用于获取可用模型）
 * @param browserProvider - 浏览器自动化提供商
 * @param uiSelectedModel - UI 中用户选择的模型
 * @returns 代理名称 → 代理配置的映射
 */
export async function createBuiltinAgents(
  disabledAgents: string[] = [],
  agentOverrides: AgentOverrides = {},
  directory?: string,
  systemDefaultModel?: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  discoveredSkills: LoadedSkill[] = [],
  client?: any,
  browserProvider?: BrowserAutomationProvider,
  uiSelectedModel?: string
): Promise<Record<string, AgentConfig>> {
  // 步骤 1: 获取可用模型列表（用于模型回退）
  const connectedProviders = readConnectedProvidersCache()
  const availableModels = client 
    ? await fetchAvailableModels(client, { connectedProviders: connectedProviders ?? undefined }) 
    : new Set<string>()

  const result: Record<string, AgentConfig> = {}
  const availableAgents: AvailableAgent[] = []

  // 步骤 2: 收集可用分类（用于 Sisyphus/Atlas 提示词）
  const mergedCategories = categories
    ? { ...DEFAULT_CATEGORIES, ...categories }
    : DEFAULT_CATEGORIES

  const availableCategories: AvailableCategory[] = Object.entries(mergedCategories).map(([name]) => ({
    name,
    description: categories?.[name]?.description ?? CATEGORY_DESCRIPTIONS[name] ?? "General tasks",
  }))

  // 步骤 3: 收集可用技能（插件内置 + 用户发现）
  const builtinSkills = createBuiltinSkills({ browserProvider })
  const builtinSkillNames = new Set(builtinSkills.map(s => s.name))

  const builtinAvailable: AvailableSkill[] = builtinSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: "plugin" as const,
  }))

  const discoveredAvailable: AvailableSkill[] = discoveredSkills
    .filter(s => !builtinSkillNames.has(s.name))
    .map((skill) => ({
      name: skill.name,
      description: skill.definition.description ?? "",
      location: mapScopeToLocation(skill.scope),
    }))

  const availableSkills: AvailableSkill[] = [...builtinAvailable, ...discoveredAvailable]

   // 步骤 4: 遍历代理源，构建普通代理（Sisyphus 和 Atlas 最后单独处理）
   for (const [name, source] of Object.entries(agentSources)) {
     const agentName = name as BuiltinAgentName

     // Sisyphus 和 Atlas 需要元数据，最后单独构建
     if (agentName === "sisyphus") continue
     if (agentName === "atlas") continue
     if (includesCaseInsensitive(disabledAgents, agentName)) continue

    const override = findCaseInsensitive(agentOverrides, agentName)
    const requirement = AGENT_MODEL_REQUIREMENTS[agentName]
    
    // 解析模型：UI 选择 → 用户配置 → 回退链 → 系统默认
    const resolution = resolveModelWithFallback({
      uiSelectedModel,
      userModel: override?.model,
      fallbackChain: requirement?.fallbackChain,
      availableModels,
      systemDefaultModel,
    })
    if (!resolution) continue
    const { model, variant: resolvedVariant } = resolution

    let config = buildAgent(source, model, mergedCategories, gitMasterConfig, browserProvider)
    
    // 应用来自覆盖配置或解析的回退链的 variant
    if (override?.variant) {
      config = { ...config, variant: override.variant }
    } else if (resolvedVariant) {
      config = { ...config, variant: resolvedVariant }
    }

    if (agentName === "librarian" && directory && config.prompt) {
      const envContext = createEnvContext()
      config = { ...config, prompt: config.prompt + envContext }
    }

    if (override) {
      config = mergeAgentConfig(config, override)
    }

    result[name] = config

    const metadata = agentMetadata[agentName]
    if (metadata) {
      availableAgents.push({
        name: agentName,
        description: config.description ?? "",
        metadata,
      })
    }
  }

   if (!disabledAgents.includes("sisyphus")) {
     const sisyphusOverride = agentOverrides["sisyphus"]
     const sisyphusRequirement = AGENT_MODEL_REQUIREMENTS["sisyphus"]
    
    const sisyphusResolution = resolveModelWithFallback({
      uiSelectedModel,
      userModel: sisyphusOverride?.model,
      fallbackChain: sisyphusRequirement?.fallbackChain,
      availableModels,
      systemDefaultModel,
    })

    if (sisyphusResolution) {
      const { model: sisyphusModel, variant: sisyphusResolvedVariant } = sisyphusResolution

      let sisyphusConfig = createSisyphusAgent(
        sisyphusModel,
        availableAgents,
        undefined,
        availableSkills,
        availableCategories
      )
      
      if (sisyphusOverride?.variant) {
        sisyphusConfig = { ...sisyphusConfig, variant: sisyphusOverride.variant }
      } else if (sisyphusResolvedVariant) {
        sisyphusConfig = { ...sisyphusConfig, variant: sisyphusResolvedVariant }
      }

      if (directory && sisyphusConfig.prompt) {
        const envContext = createEnvContext()
        sisyphusConfig = { ...sisyphusConfig, prompt: sisyphusConfig.prompt + envContext }
      }

      if (sisyphusOverride) {
        sisyphusConfig = mergeAgentConfig(sisyphusConfig, sisyphusOverride)
      }

      result["sisyphus"] = sisyphusConfig
    }
   }

   if (!disabledAgents.includes("atlas")) {
     const orchestratorOverride = agentOverrides["atlas"]
     const atlasRequirement = AGENT_MODEL_REQUIREMENTS["atlas"]
    
    const atlasResolution = resolveModelWithFallback({
      uiSelectedModel,
      userModel: orchestratorOverride?.model,
      fallbackChain: atlasRequirement?.fallbackChain,
      availableModels,
      systemDefaultModel,
    })
    
    if (atlasResolution) {
      const { model: atlasModel, variant: atlasResolvedVariant } = atlasResolution

      let orchestratorConfig = createAtlasAgent({
        model: atlasModel,
        availableAgents,
        availableSkills,
        userCategories: categories,
      })
      
      if (orchestratorOverride?.variant) {
        orchestratorConfig = { ...orchestratorConfig, variant: orchestratorOverride.variant }
      } else if (atlasResolvedVariant) {
        orchestratorConfig = { ...orchestratorConfig, variant: atlasResolvedVariant }
      }

      if (orchestratorOverride) {
        orchestratorConfig = mergeAgentConfig(orchestratorConfig, orchestratorOverride)
      }

      result["atlas"] = orchestratorConfig
    }
   }

   return result
 }
