import type { OhMyOpenCodeConfig } from "../config"
import { findCaseInsensitive } from "./case-insensitive"
import { AGENT_MODEL_REQUIREMENTS, CATEGORY_MODEL_REQUIREMENTS } from "./model-requirements"

/**
 * 解析agent的variant配置
 * Resolve agent variant configuration
 * 
 * Variant说明 (Variant explanation):
 * - Variant控制模型的推理深度/质量（如high, max, medium）
 * - 优先级：agent.variant > category.variant
 * 
 * @param config - OhMyOpenCode配置
 * @param agentName - Agent名称
 * @returns Variant字符串，如果未配置则返回undefined
 */
export function resolveAgentVariant(
  config: OhMyOpenCodeConfig,
  agentName?: string
): string | undefined {
  if (!agentName) {
    return undefined
  }

  const agentOverrides = config.agents as
    | Record<string, { variant?: string; category?: string }>
    | undefined
  const agentOverride = agentOverrides ? findCaseInsensitive(agentOverrides, agentName) : undefined
  if (!agentOverride) {
    return undefined
  }

  // 优先使用agent级别的variant配置
  // Prefer agent-level variant configuration
  if (agentOverride.variant) {
    return agentOverride.variant
  }

  // 回退到category级别的variant配置
  // Fallback to category-level variant configuration
  const categoryName = agentOverride.category
  if (!categoryName) {
    return undefined
  }

  return config.categories?.[categoryName]?.variant
}

/**
 * 为当前模型解析variant
 * Resolve variant for current model
 * 
 * 根据agent和当前使用的provider，从回退链中查找对应的variant
 * Find corresponding variant from fallback chain based on agent and current provider
 * 
 * @param config - OhMyOpenCode配置
 * @param agentName - Agent名称
 * @param currentModel - 当前使用的模型（包含providerID和modelID）
 * @returns Variant字符串，如果未找到则返回undefined
 */
export function resolveVariantForModel(
  config: OhMyOpenCodeConfig,
  agentName: string,
  currentModel: { providerID: string; modelID: string },
): string | undefined {
  // 优先从agent的回退链中查找
  // First try to find from agent's fallback chain
  const agentRequirement = AGENT_MODEL_REQUIREMENTS[agentName]
  if (agentRequirement) {
    return findVariantInChain(agentRequirement.fallbackChain, currentModel.providerID)
  }

  // 回退到category的回退链
  // Fallback to category's fallback chain
  const agentOverrides = config.agents as
    | Record<string, { category?: string }>
    | undefined
  const agentOverride = agentOverrides ? findCaseInsensitive(agentOverrides, agentName) : undefined
  const categoryName = agentOverride?.category
  if (categoryName) {
    const categoryRequirement = CATEGORY_MODEL_REQUIREMENTS[categoryName]
    if (categoryRequirement) {
      return findVariantInChain(categoryRequirement.fallbackChain, currentModel.providerID)
    }
  }

  return undefined
}

/**
 * 在回退链中查找provider对应的variant
 * Find variant for provider in fallback chain
 */
function findVariantInChain(
  fallbackChain: { providers: string[]; model: string; variant?: string }[],
  providerID: string,
): string | undefined {
  for (const entry of fallbackChain) {
    if (entry.providers.includes(providerID)) {
      return entry.variant
    }
  }
  return undefined
}

/**
 * 应用agent的variant到消息
 * Apply agent variant to message
 * 
 * 如果消息未指定variant，则使用agent配置的variant
 * If message doesn't specify variant, use agent's configured variant
 */
export function applyAgentVariant(
  config: OhMyOpenCodeConfig,
  agentName: string | undefined,
  message: { variant?: string }
): void {
  const variant = resolveAgentVariant(config, agentName)
  if (variant !== undefined && message.variant === undefined) {
    message.variant = variant
  }
}
