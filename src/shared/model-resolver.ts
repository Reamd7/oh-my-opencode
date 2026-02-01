import { log } from "./logger"
import { fuzzyMatchModel } from "./model-availability"
import type { FallbackEntry } from "./model-requirements"
import { readConnectedProvidersCache } from "./connected-providers-cache"

/**
 * 模型解析输入参数（简化版）
 * Model resolution input parameters (simplified version)
 */
export type ModelResolutionInput = {
	userModel?: string
	inheritedModel?: string
	systemDefault?: string
}

/**
 * 模型来源类型
 * Model source type
 * - override: 用户显式指定（UI选择或配置文件）
 * - provider-fallback: 从回退链中解析
 * - system-default: 系统默认模型
 */
export type ModelSource =
	| "override"
	| "provider-fallback"
	| "system-default"

/**
 * 模型解析结果
 * Model resolution result
 */
export type ModelResolutionResult = {
	model: string
	source: ModelSource
	variant?: string
}

/**
 * 扩展的模型解析输入参数（带回退链）
 * Extended model resolution input parameters (with fallback chain)
 */
export type ExtendedModelResolutionInput = {
	uiSelectedModel?: string
	userModel?: string
	fallbackChain?: FallbackEntry[]
	availableModels: Set<string>
	systemDefaultModel?: string
}

/**
 * 规范化模型名称（去除空白字符）
 * Normalize model name (trim whitespace)
 */
function normalizeModel(model?: string): string | undefined {
	const trimmed = model?.trim()
	return trimmed || undefined
}

/**
 * 简单模型解析（不带回退链）
 * Simple model resolution (without fallback chain)
 * 优先级：userModel > inheritedModel > systemDefault
 */
export function resolveModel(input: ModelResolutionInput): string | undefined {
	return (
		normalizeModel(input.userModel) ??
		normalizeModel(input.inheritedModel) ??
		input.systemDefault
	)
}

/**
 * 带回退链的模型解析（核心函数）
 * Model resolution with fallback chain (core function)
 * 
 * 3步解析流程 (3-step resolution process):
 * 1. Override（覆盖）: UI选择 > 配置文件指定
 * 2. Fallback（回退）: 遍历回退链，使用模糊匹配查找可用模型
 * 3. Default（默认）: 使用系统默认模型
 * 
 * 回退链机制 (Fallback chain mechanism):
 * - 每个agent/category都有预定义的回退链（见model-requirements.ts）
 * - 回退链按优先级排序：[首选模型, 次选模型, 兜底模型]
 * - 支持多provider：如果anthropic不可用，自动尝试github-copilot/opencode
 * - 使用模糊匹配：claude-opus-4-5 可以匹配 claude-opus-4.5
 * 
 * 为什么需要回退链？(Why fallback chain?)
 * - 用户可能没有订阅某个provider（如OpenAI）
 * - 某些模型可能暂时不可用
 * - 不同provider提供相同模型（如anthropic和github-copilot都有claude）
 * - 确保系统在任何情况下都能找到可用模型
 */
export function resolveModelWithFallback(
	input: ExtendedModelResolutionInput,
): ModelResolutionResult | undefined {
	const { uiSelectedModel, userModel, fallbackChain, availableModels, systemDefaultModel } = input

	// 步骤1: UI选择（最高优先级 - 尊重用户在OpenCode UI中的模型选择）
	// Step 1: UI Selection (highest priority - respects user's model choice in OpenCode UI)
	const normalizedUiModel = normalizeModel(uiSelectedModel)
	if (normalizedUiModel) {
		log("Model resolved via UI selection", { model: normalizedUiModel })
		return { model: normalizedUiModel, source: "override" }
	}

	// 步骤2: 配置覆盖（来自oh-my-opencode.json）
	// Step 2: Config Override (from oh-my-opencode.json)
	const normalizedUserModel = normalizeModel(userModel)
	if (normalizedUserModel) {
		log("Model resolved via config override", { model: normalizedUserModel })
		return { model: normalizedUserModel, source: "override" }
	}

	// 步骤3: Provider回退链（带可用性检查）
	// Step 3: Provider fallback chain (with availability check)
	if (fallbackChain && fallbackChain.length > 0) {
		// 如果没有模型缓存，使用connected providers缓存进行快速回退
		// If no model cache, use connected providers cache for fast fallback
		if (availableModels.size === 0) {
			const connectedProviders = readConnectedProvidersCache()
			const connectedSet = connectedProviders ? new Set(connectedProviders) : null

			if (connectedSet === null) {
				log("Model fallback chain skipped (no connected providers cache) - falling through to system default")
			} else {
				// 遍历回退链，找到第一个已连接的provider
				// Iterate fallback chain, find first connected provider
				for (const entry of fallbackChain) {
					for (const provider of entry.providers) {
						if (connectedSet.has(provider)) {
							const model = `${provider}/${entry.model}`
							log("Model resolved via fallback chain (no model cache, using connected provider)", { 
								provider, 
								model: entry.model, 
								variant: entry.variant,
							})
							return { model, source: "provider-fallback", variant: entry.variant }
						}
					}
				}
				log("No connected provider found in fallback chain, falling through to system default")
			}
		}

		// 使用模糊匹配在可用模型中查找
		// Use fuzzy matching to find in available models
		for (const entry of fallbackChain) {
			for (const provider of entry.providers) {
				const fullModel = `${provider}/${entry.model}`
				const match = fuzzyMatchModel(fullModel, availableModels, [provider])
				if (match) {
					log("Model resolved via fallback chain (availability confirmed)", { provider, model: entry.model, match, variant: entry.variant })
					return { model: match, source: "provider-fallback", variant: entry.variant }
				}
			}
		}
		log("No available model found in fallback chain, falling through to system default")
	}

	// 步骤4: 系统默认（如果提供）
	// Step 4: System default (if provided)
	if (systemDefaultModel === undefined) {
		log("No model resolved - systemDefaultModel not configured")
		return undefined
	}

	log("Model resolved via system default", { model: systemDefaultModel })
	return { model: systemDefaultModel, source: "system-default" }
}
