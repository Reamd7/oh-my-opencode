/**
 * 配置迁移工具
 * 
 * 核心功能：
 * - 自动迁移旧版配置到新版格式
 * - 向后兼容旧的 agent 名称和 hook 名称
 * - 自动备份原配置文件
 * 
 * 迁移机制：
 * 1. Agent 名称标准化（OmO → sisyphus）
 * 2. Hook 名称更新（移除废弃 hooks）
 * 3. Model 配置迁移到 Category 配置
 * 4. 自动清理冗余配置
 * 
 * 设计理念：
 * - 零用户干预：自动检测并迁移
 * - 安全优先：迁移前自动备份
 * - 向后兼容：保留旧名称映射
 */
import * as fs from "fs"
import { log } from "./logger"

/**
 * Agent 名称映射表（向后兼容）
 * 
 * 将旧版 agent 名称映射到标准化的新名称。
 * 支持多种历史命名变体（大小写、连字符等）。
 */
export const AGENT_NAME_MAP: Record<string, string> = {
  // Sisyphus variants → "sisyphus"
  omo: "sisyphus",
  OmO: "sisyphus",
  Sisyphus: "sisyphus",
  sisyphus: "sisyphus",

  // Prometheus variants → "prometheus"
  "OmO-Plan": "prometheus",
  "omo-plan": "prometheus",
  "Planner-Sisyphus": "prometheus",
  "planner-sisyphus": "prometheus",
  "Prometheus (Planner)": "prometheus",
  prometheus: "prometheus",

  // Atlas variants → "atlas"
  "orchestrator-sisyphus": "atlas",
  Atlas: "atlas",
  atlas: "atlas",

  // Metis variants → "metis"
  "plan-consultant": "metis",
  "Metis (Plan Consultant)": "metis",
  metis: "metis",

  // Momus variants → "momus"
  "Momus (Plan Reviewer)": "momus",
  momus: "momus",

  // Sisyphus-Junior → "sisyphus-junior"
  "Sisyphus-Junior": "sisyphus-junior",
  "sisyphus-junior": "sisyphus-junior",

  // Already lowercase - passthrough
  build: "build",
  oracle: "oracle",
  librarian: "librarian",
  explore: "explore",
  "multimodal-looker": "multimodal-looker",
}

/** 内置 agent 名称集合（标准化后的名称） */
export const BUILTIN_AGENT_NAMES = new Set([
  "sisyphus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "prometheus",
  "atlas",
  "build",
])

/**
 * Hook 名称映射表（向后兼容）
 * 
 * - 字符串值：旧名称映射到新名称
 * - null 值：hook 已废弃，将从 disabled_hooks 中移除并警告用户
 */
export const HOOK_NAME_MAP: Record<string, string | null> = {
  "anthropic-auto-compact": "anthropic-context-window-limit-recovery",
  "sisyphus-orchestrator": "atlas",
  "preemptive-compaction": null,
  "empty-message-sanitizer": null,
}

/**
 * Model 到 Category 映射表（遗留迁移专用）
 * 
 * @deprecated 仅用于迁移旧配置，未来版本将移除
 * 
 * 用途：将硬编码的 model 字符串迁移到语义化的 category 配置。
 * 
 * 新 agent 应使用：
 * - Category 配置（推荐）：{ category: "unspecified-high" }
 * - 或继承 OpenCode 的 config.model
 * 
 * 请勿添加新条目，此映射表将在迁移期结束后移除。
 */
export const MODEL_TO_CATEGORY_MAP: Record<string, string> = {
  "google/gemini-3-pro": "visual-engineering",
  "google/gemini-3-flash": "writing",
  "openai/gpt-5.2": "ultrabrain",
  "anthropic/claude-haiku-4-5": "quick",
  "anthropic/claude-opus-4-5": "unspecified-high",
  "anthropic/claude-sonnet-4-5": "unspecified-low",
}

/**
 * 迁移 agent 名称
 * 
 * 将配置中的旧 agent 名称替换为标准化的新名称。
 * 
 * @returns 迁移后的配置和是否发生变更
 */
export function migrateAgentNames(agents: Record<string, unknown>): { migrated: Record<string, unknown>; changed: boolean } {
  const migrated: Record<string, unknown> = {}
  let changed = false

  for (const [key, value] of Object.entries(agents)) {
    const newKey = AGENT_NAME_MAP[key.toLowerCase()] ?? AGENT_NAME_MAP[key] ?? key
    if (newKey !== key) {
      changed = true
    }
    migrated[newKey] = value
  }

  return { migrated, changed }
}

/**
 * 迁移 hook 名称
 * 
 * 更新 hook 名称并移除已废弃的 hooks。
 * 
 * @returns 迁移后的 hooks、是否变更、已移除的 hooks
 */
export function migrateHookNames(hooks: string[]): { migrated: string[]; changed: boolean; removed: string[] } {
  const migrated: string[] = []
  const removed: string[] = []
  let changed = false

  for (const hook of hooks) {
    const mapping = HOOK_NAME_MAP[hook]

    if (mapping === null) {
      removed.push(hook)
      changed = true
      continue
    }

    const newHook = mapping ?? hook
    if (newHook !== hook) {
      changed = true
    }
    migrated.push(newHook)
  }

  return { migrated, changed, removed }
}

/**
 * 迁移 agent 配置：从 model 到 category
 * 
 * 将旧的硬编码 model 配置转换为语义化的 category 配置。
 * 
 * @returns 迁移后的配置和是否发生变更
 */
export function migrateAgentConfigToCategory(config: Record<string, unknown>): {
  migrated: Record<string, unknown>
  changed: boolean
} {
  const { model, ...rest } = config
  if (typeof model !== "string") {
    return { migrated: config, changed: false }
  }

  const category = MODEL_TO_CATEGORY_MAP[model]
  if (!category) {
    return { migrated: config, changed: false }
  }

  return {
    migrated: { category, ...rest },
    changed: true,
  }
}

/**
 * 判断 agent 配置是否应该删除
 * 
 * 如果配置与默认值完全一致，则可以安全删除以减少配置冗余。
 */
export function shouldDeleteAgentConfig(
  config: Record<string, unknown>,
  category: string
): boolean {
  const { DEFAULT_CATEGORIES } = require("../tools/delegate-task/constants")
  const defaults = DEFAULT_CATEGORIES[category]
  if (!defaults) return false

  const keys = Object.keys(config).filter((k) => k !== "category")
  if (keys.length === 0) return true

  for (const key of keys) {
    if (config[key] !== (defaults as Record<string, unknown>)[key]) {
      return false
    }
  }
  return true
}

/**
 * 迁移配置文件（主入口函数）
 * 
 * 执行所有必要的配置迁移：
 * 1. Agent 名称标准化
 * 2. omo_agent → sisyphus_agent 重命名
 * 3. disabled_agents 名称更新
 * 4. disabled_hooks 名称更新和废弃 hooks 移除
 * 
 * 安全机制：
 * - 迁移前自动创建带时间戳的备份文件
 * - 仅在发生变更时写入文件
 * - 记录所有迁移操作到日志
 * 
 * @param configPath 配置文件路径
 * @param rawConfig 原始配置对象（会被原地修改）
 * @returns 是否发生了迁移并写入文件
 */
export function migrateConfigFile(configPath: string, rawConfig: Record<string, unknown>): boolean {
  let needsWrite = false

  if (rawConfig.agents && typeof rawConfig.agents === "object") {
    const { migrated, changed } = migrateAgentNames(rawConfig.agents as Record<string, unknown>)
    if (changed) {
      rawConfig.agents = migrated
      needsWrite = true
    }
  }

  if (rawConfig.omo_agent) {
    rawConfig.sisyphus_agent = rawConfig.omo_agent
    delete rawConfig.omo_agent
    needsWrite = true
  }

  if (rawConfig.disabled_agents && Array.isArray(rawConfig.disabled_agents)) {
    const migrated: string[] = []
    let changed = false
    for (const agent of rawConfig.disabled_agents as string[]) {
      const newAgent = AGENT_NAME_MAP[agent.toLowerCase()] ?? AGENT_NAME_MAP[agent] ?? agent
      if (newAgent !== agent) {
        changed = true
      }
      migrated.push(newAgent)
    }
    if (changed) {
      rawConfig.disabled_agents = migrated
      needsWrite = true
    }
  }

  if (rawConfig.disabled_hooks && Array.isArray(rawConfig.disabled_hooks)) {
    const { migrated, changed, removed } = migrateHookNames(rawConfig.disabled_hooks as string[])
    if (changed) {
      rawConfig.disabled_hooks = migrated
      needsWrite = true
    }
    if (removed.length > 0) {
      log(`Removed obsolete hooks from disabled_hooks: ${removed.join(", ")} (these hooks no longer exist in v3.0.0)`)
    }
  }

  if (needsWrite) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const backupPath = `${configPath}.bak.${timestamp}`
      fs.copyFileSync(configPath, backupPath)

      fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2) + "\n", "utf-8")
      log(`Migrated config file: ${configPath} (backup: ${backupPath})`)
    } catch (err) {
      log(`Failed to write migrated config to ${configPath}:`, err)
    }
  }

  return needsWrite
}
