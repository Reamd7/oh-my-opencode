import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { log } from "./logger"
import { getOpenCodeCacheDir } from "./data-path"
import { readProviderModelsCache, hasProviderModelsCache } from "./connected-providers-cache"

/**
 * 模糊匹配模型名称
 * Fuzzy match a target model name against available models
 * 
 * 为什么需要模糊匹配？(Why fuzzy matching?)
 * - 用户可能输入 "claude-opus-4-5"，但实际模型名是 "claude-opus-4.5"
 * - 不同provider可能使用不同的命名格式
 * - 支持部分匹配：输入 "gpt-5.2" 可以匹配 "openai/gpt-5.2-codex"
 * 
 * @param target - 要搜索的模型名称或子串（如 "gpt-5.2", "claude-opus"）
 * @param available - 可用模型名称集合，格式为 "provider/model-name"
 * @param providers - 可选的provider过滤列表（如 ["openai", "anthropic"]）
 * @returns 匹配的模型名称，如果未找到则返回null
 * 
 * 匹配优先级 (Matching priority):
 * 1. 精确匹配（如果存在）
 * 2. 最短模型名（更具体）
 * 
 * 匹配规则：不区分大小写的子串匹配
 * 如果提供了providers数组，只考虑以 "provider/" 开头的模型
 * 
 * @example
 * const available = new Set(["openai/gpt-5.2", "openai/gpt-5.2-codex", "anthropic/claude-opus-4-5"])
 * fuzzyMatchModel("gpt-5.2", available) // → "openai/gpt-5.2"
 * fuzzyMatchModel("claude", available, ["openai"]) // → null (provider filter excludes anthropic)
 */
/**
 * 规范化模型名称（处理版本号格式差异）
 * Normalize model name (handle version number format differences)
 * 
 * 将 claude-opus-4-5 和 claude-opus-4.5 统一为 claude-opus-4.5
 * 这是必要的，因为不同来源可能使用不同的格式
 */
function normalizeModelName(name: string): string {
	return name
		.toLowerCase()
		.replace(/claude-(opus|sonnet|haiku)-4-5/g, "claude-$1-4.5")
		.replace(/claude-(opus|sonnet|haiku)-4\.5/g, "claude-$1-4.5")
}

export function fuzzyMatchModel(
	target: string,
	available: Set<string>,
	providers?: string[],
): string | null {
	log("[fuzzyMatchModel] called", { target, availableCount: available.size, providers })

	if (available.size === 0) {
		log("[fuzzyMatchModel] empty available set")
		return null
	}

	const targetNormalized = normalizeModelName(target)

	// 按provider过滤（如果指定）
	// Filter by providers if specified
	let candidates = Array.from(available)
	if (providers && providers.length > 0) {
		const providerSet = new Set(providers)
		candidates = candidates.filter((model) => {
			const [provider] = model.split("/")
			return providerSet.has(provider)
		})
		log("[fuzzyMatchModel] filtered by providers", { candidateCount: candidates.length, candidates: candidates.slice(0, 10) })
	}

	if (candidates.length === 0) {
		log("[fuzzyMatchModel] no candidates after filter")
		return null
	}

	// 查找所有匹配项（不区分大小写的子串匹配 + 规范化）
	// Find all matches (case-insensitive substring match with normalization)
	const matches = candidates.filter((model) =>
		normalizeModelName(model).includes(targetNormalized),
	)

	log("[fuzzyMatchModel] substring matches", { targetNormalized, matchCount: matches.length, matches })

	if (matches.length === 0) {
		return null
	}

	// 优先级1: 精确匹配（规范化后）
	// Priority 1: Exact match (normalized)
	const exactMatch = matches.find((model) => normalizeModelName(model) === targetNormalized)
	if (exactMatch) {
		log("[fuzzyMatchModel] exact match found", { exactMatch })
		return exactMatch
	}

	// 优先级2: 最短模型名（更具体）
	// Priority 2: Shorter model name (more specific)
	// 例如：gpt-5.2 优先于 gpt-5.2-codex
	const result = matches.reduce((shortest, current) =>
		current.length < shortest.length ? current : shortest,
	)
	log("[fuzzyMatchModel] shortest match", { result })
	return result
}

/**
 * 获取已连接的provider列表
 * Get list of connected providers
 */
export async function getConnectedProviders(client: any): Promise<string[]> {
	if (!client?.provider?.list) {
		log("[getConnectedProviders] client.provider.list not available")
		return []
	}

	try {
		const result = await client.provider.list()
		const connected = result.data?.connected ?? []
		log("[getConnectedProviders] connected providers", { count: connected.length, providers: connected })
		return connected
	} catch (err) {
		log("[getConnectedProviders] SDK error", { error: String(err) })
		return []
	}
}

/**
 * 获取可用模型列表
 * Fetch available models list
 * 
 * 数据源优先级 (Data source priority):
 * 1. provider-models.json 缓存（推荐，包含白名单过滤）
 * 2. models.json 缓存（回退，无白名单过滤）
 * 
 * 缓存机制说明 (Cache mechanism):
 * - provider-models.json: 由updateConnectedProvidersCache()生成，包含每个provider的模型列表
 * - models.json: OpenCode原生缓存，包含所有provider和模型信息
 * - 如果connectedProviders未知，返回空集合以触发快速回退逻辑
 * 
 * @param _client - OpenCode client（当前未使用，保留用于未来扩展）
 * @param options - 选项，包含已连接的provider列表
 * @returns 可用模型集合，格式为 "provider/model-id"
 */
export async function fetchAvailableModels(
	_client?: any,
	options?: { connectedProviders?: string[] | null }
): Promise<Set<string>> {
	const connectedProvidersUnknown = options?.connectedProviders === null || options?.connectedProviders === undefined

	log("[fetchAvailableModels] CALLED", { 
		connectedProvidersUnknown,
		connectedProviders: options?.connectedProviders 
	})

	// 如果provider列表未知，返回空集合以触发快速回退
	// If provider list unknown, return empty set to trigger fast fallback
	if (connectedProvidersUnknown) {
		log("[fetchAvailableModels] connected providers unknown, returning empty set for fallback resolution")
		return new Set<string>()
	}

	const connectedProviders = options!.connectedProviders!
	const connectedSet = new Set(connectedProviders)
	const modelSet = new Set<string>()

	// 优先使用provider-models缓存（包含白名单过滤）
	// Prefer provider-models cache (includes whitelist filtering)
	const providerModelsCache = readProviderModelsCache()
	if (providerModelsCache) {
		log("[fetchAvailableModels] using provider-models cache (whitelist-filtered)")
		
		for (const [providerId, modelIds] of Object.entries(providerModelsCache.models)) {
			if (!connectedSet.has(providerId)) {
				continue
			}
			for (const modelId of modelIds) {
				modelSet.add(`${providerId}/${modelId}`)
			}
		}

		log("[fetchAvailableModels] parsed from provider-models cache", {
			count: modelSet.size,
			connectedProviders: connectedProviders.slice(0, 5)
		})

		return modelSet
	}

	// 回退到models.json（OpenCode原生缓存）
	// Fallback to models.json (OpenCode native cache)
	log("[fetchAvailableModels] provider-models cache not found, falling back to models.json")
	const cacheFile = join(getOpenCodeCacheDir(), "models.json")

	if (!existsSync(cacheFile)) {
		log("[fetchAvailableModels] models.json cache file not found, returning empty set")
		return modelSet
	}

	try {
		const content = readFileSync(cacheFile, "utf-8")
		const data = JSON.parse(content) as Record<string, { id?: string; models?: Record<string, { id?: string }> }>

		const providerIds = Object.keys(data)
		log("[fetchAvailableModels] providers found in models.json", { count: providerIds.length, providers: providerIds.slice(0, 10) })

		for (const providerId of providerIds) {
			if (!connectedSet.has(providerId)) {
				continue
			}

			const provider = data[providerId]
			const models = provider?.models
			if (!models || typeof models !== "object") continue

			for (const modelKey of Object.keys(models)) {
				modelSet.add(`${providerId}/${modelKey}`)
			}
		}

		log("[fetchAvailableModels] parsed models from models.json (NO whitelist filtering)", {
			count: modelSet.size,
			connectedProviders: connectedProviders.slice(0, 5)
		})

		return modelSet
	} catch (err) {
		log("[fetchAvailableModels] error", { error: String(err) })
		return modelSet
	}
}

export function __resetModelCache(): void {}

export function isModelCacheAvailable(): boolean {
	if (hasProviderModelsCache()) {
		return true
	}
	const cacheFile = join(getOpenCodeCacheDir(), "models.json")
	return existsSync(cacheFile)
}
