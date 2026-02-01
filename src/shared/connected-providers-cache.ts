import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { log } from "./logger"
import { getOmoOpenCodeCacheDir } from "./data-path"

/**
 * Provider缓存系统
 * Provider caching system
 * 
 * 两个缓存文件 (Two cache files):
 * 1. connected-providers.json: 已连接的provider列表（轻量级）
 * 2. provider-models.json: 每个provider的模型列表（完整信息）
 * 
 * 缓存策略 (Caching strategy):
 * - 在PreToolUse hook中更新缓存（每次工具调用前）
 * - 避免频繁调用client.provider.list()和client.model.list()
 * - 提供快速的模型可用性检查
 */
const CONNECTED_PROVIDERS_CACHE_FILE = "connected-providers.json"
const PROVIDER_MODELS_CACHE_FILE = "provider-models.json"

/**
 * 已连接provider缓存结构
 * Connected providers cache structure
 */
interface ConnectedProvidersCache {
	connected: string[]  // Provider ID列表 (Provider ID list)
	updatedAt: string    // 更新时间戳 (Update timestamp)
}

/**
 * Provider模型缓存结构
 * Provider models cache structure
 */
interface ProviderModelsCache {
	models: Record<string, string[]>  // Provider ID -> 模型ID列表 (Provider ID -> Model ID list)
	connected: string[]               // 已连接的provider列表 (Connected provider list)
	updatedAt: string                 // 更新时间戳 (Update timestamp)
}

function getCacheFilePath(filename: string): string {
	return join(getOmoOpenCodeCacheDir(), filename)
}

function ensureCacheDir(): void {
	const cacheDir = getOmoOpenCodeCacheDir()
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true })
	}
}

/**
 * 读取已连接provider缓存
 * Read the connected providers cache
 * 
 * @returns Provider ID列表，如果缓存不存在则返回null
 */
export function readConnectedProvidersCache(): string[] | null {
	const cacheFile = getCacheFilePath(CONNECTED_PROVIDERS_CACHE_FILE)

	if (!existsSync(cacheFile)) {
		log("[connected-providers-cache] Cache file not found", { cacheFile })
		return null
	}

	try {
		const content = readFileSync(cacheFile, "utf-8")
		const data = JSON.parse(content) as ConnectedProvidersCache
		log("[connected-providers-cache] Read cache", { count: data.connected.length, updatedAt: data.updatedAt })
		return data.connected
	} catch (err) {
		log("[connected-providers-cache] Error reading cache", { error: String(err) })
		return null
	}
}

/**
 * 检查已连接provider缓存是否存在
 * Check if connected providers cache exists
 */
export function hasConnectedProvidersCache(): boolean {
	const cacheFile = getCacheFilePath(CONNECTED_PROVIDERS_CACHE_FILE)
	return existsSync(cacheFile)
}

/**
 * 写入已连接provider缓存
 * Write the connected providers cache
 */
function writeConnectedProvidersCache(connected: string[]): void {
	ensureCacheDir()
	const cacheFile = getCacheFilePath(CONNECTED_PROVIDERS_CACHE_FILE)

	const data: ConnectedProvidersCache = {
		connected,
		updatedAt: new Date().toISOString(),
	}

	try {
		writeFileSync(cacheFile, JSON.stringify(data, null, 2))
		log("[connected-providers-cache] Cache written", { count: connected.length })
	} catch (err) {
		log("[connected-providers-cache] Error writing cache", { error: String(err) })
	}
}

/**
 * 读取provider-models缓存
 * Read the provider-models cache
 * 
 * @returns 缓存数据，如果缓存不存在则返回null
 */
export function readProviderModelsCache(): ProviderModelsCache | null {
	const cacheFile = getCacheFilePath(PROVIDER_MODELS_CACHE_FILE)

	if (!existsSync(cacheFile)) {
		log("[connected-providers-cache] Provider-models cache file not found", { cacheFile })
		return null
	}

	try {
		const content = readFileSync(cacheFile, "utf-8")
		const data = JSON.parse(content) as ProviderModelsCache
		log("[connected-providers-cache] Read provider-models cache", { 
			providerCount: Object.keys(data.models).length, 
			updatedAt: data.updatedAt 
		})
		return data
	} catch (err) {
		log("[connected-providers-cache] Error reading provider-models cache", { error: String(err) })
		return null
	}
}

/**
 * 检查provider-models缓存是否存在
 * Check if provider-models cache exists
 */
export function hasProviderModelsCache(): boolean {
	const cacheFile = getCacheFilePath(PROVIDER_MODELS_CACHE_FILE)
	return existsSync(cacheFile)
}

/**
 * 写入provider-models缓存
 * Write the provider-models cache
 */
export function writeProviderModelsCache(data: { models: Record<string, string[]>; connected: string[] }): void {
	ensureCacheDir()
	const cacheFile = getCacheFilePath(PROVIDER_MODELS_CACHE_FILE)

	const cacheData: ProviderModelsCache = {
		...data,
		updatedAt: new Date().toISOString(),
	}

	try {
		writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2))
		log("[connected-providers-cache] Provider-models cache written", { 
			providerCount: Object.keys(data.models).length 
		})
	} catch (err) {
		log("[connected-providers-cache] Error writing provider-models cache", { error: String(err) })
	}
}

/**
 * 更新已连接provider缓存
 * Update the connected providers cache by fetching from the client
 * 
 * 同时更新两个缓存 (Updates both caches):
 * 1. connected-providers.json: Provider列表
 * 2. provider-models.json: 每个provider的模型列表
 * 
 * 调用时机 (When to call):
 * - PreToolUse hook中（每次工具调用前）
 * - 确保缓存始终是最新的
 */
export async function updateConnectedProvidersCache(client: {
	provider?: {
		list?: () => Promise<{ data?: { connected?: string[] } }>
	}
	model?: {
		list?: () => Promise<{ data?: Array<{ id: string; provider: string }> }>
	}
}): Promise<void> {
	if (!client?.provider?.list) {
		log("[connected-providers-cache] client.provider.list not available")
		return
	}

	try {
		const result = await client.provider.list()
		const connected = result.data?.connected ?? []
		log("[connected-providers-cache] Fetched connected providers", { count: connected.length, providers: connected })

		writeConnectedProvidersCache(connected)

		// Also update provider-models cache if model.list is available
		if (client.model?.list) {
			try {
				const modelsResult = await client.model.list()
				const models = modelsResult.data ?? []

				const modelsByProvider: Record<string, string[]> = {}
				for (const model of models) {
					if (!modelsByProvider[model.provider]) {
						modelsByProvider[model.provider] = []
					}
					modelsByProvider[model.provider].push(model.id)
				}

				writeProviderModelsCache({
					models: modelsByProvider,
					connected,
				})

				log("[connected-providers-cache] Provider-models cache updated", {
					providerCount: Object.keys(modelsByProvider).length,
					totalModels: models.length,
				})
			} catch (modelErr) {
				log("[connected-providers-cache] Error fetching models", { error: String(modelErr) })
			}
		}
	} catch (err) {
		log("[connected-providers-cache] Error updating cache", { error: String(err) })
	}
}
