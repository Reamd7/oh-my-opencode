/**
 * OpenCode版本检查工具 - 语义化版本比较和特性检测
 * OpenCode version checking utility - Semantic version comparison and feature detection
 * 
 * 功能:
 * - 解析和比较语义化版本号
 * - 检测OpenCode版本以启用/禁用特性
 * - 缓存版本信息以提高性能
 * 
 * Features:
 * - Parse and compare semantic versions
 * - Detect OpenCode version to enable/disable features
 * - Cache version info for performance
 * 
 * @module opencode-version
 */

import { execSync } from "child_process"

/**
 * 插件所需的最低OpenCode版本
 * Minimum OpenCode version required for this plugin.
 * 
 * 此插件仅支持OpenCode 1.1.1+，该版本引入了权限系统
 * This plugin only supports OpenCode 1.1.1+ which uses the permission system.
 */
export const MINIMUM_OPENCODE_VERSION = "1.1.1"

/**
 * 引入原生AGENTS.md注入的OpenCode版本
 * OpenCode version that introduced native AGENTS.md injection.
 * 
 * PR #10678 于2026年1月26日合并 - OpenCode现在会在agent探索时
 * 动态解析子目录中的AGENTS.md文件。
 * 检测到此版本时，directory-agents-injector hook会自动禁用
 * 以防止重复加载AGENTS.md。
 * 
 * PR #10678 merged on Jan 26, 2026 - OpenCode now dynamically resolves
 * AGENTS.md files from subdirectories as the agent explores them.
 * When this version is detected, the directory-agents-injector hook
 * is auto-disabled to prevent duplicate AGENTS.md loading.
 */
export const OPENCODE_NATIVE_AGENTS_INJECTION_VERSION = "1.1.37"

// 版本缓存标记 - 使用Symbol确保唯一性
// Version cache marker - use Symbol to ensure uniqueness
const NOT_CACHED = Symbol("NOT_CACHED")
let cachedVersion: string | null | typeof NOT_CACHED = NOT_CACHED

/**
 * 解析版本字符串为数字数组
 * Parse version string into number array
 * 
 * @param version - 版本字符串 (如 "v1.2.3-beta" 或 "1.2.3")
 * @returns 版本号数组 [1, 2, 3]
 * 
 * @example
 * parseVersion("v1.2.3-beta") // [1, 2, 3]
 * parseVersion("1.2.3") // [1, 2, 3]
 */
export function parseVersion(version: string): number[] {
  const cleaned = version.replace(/^v/, "").split("-")[0]
  return cleaned.split(".").map((n) => parseInt(n, 10) || 0)
}

/**
 * 比较两个版本号
 * Compare two version strings
 * 
 * @param a - 第一个版本号
 * @param b - 第二个版本号
 * @returns -1 (a < b), 0 (a == b), 1 (a > b)
 * 
 * @example
 * compareVersions("1.2.3", "1.2.4") // -1
 * compareVersions("1.2.3", "1.2.3") // 0
 * compareVersions("1.2.4", "1.2.3") // 1
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = parseVersion(a)
  const partsB = parseVersion(b)
  const maxLen = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA < numB) return -1
    if (numA > numB) return 1
  }
  return 0
}

/**
 * 检查版本a是否大于等于版本b
 * Check if version a is greater than or equal to version b
 */
export function isVersionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0
}

/**
 * 检查版本a是否小于版本b
 * Check if version a is less than version b
 */
export function isVersionLt(a: string, b: string): boolean {
  return compareVersions(a, b) < 0
}

/**
 * 获取当前安装的OpenCode版本
 * Get the currently installed OpenCode version
 * 
 * 通过执行 `opencode --version` 命令获取版本号
 * 结果会被缓存以提高性能
 * 
 * Retrieves version by executing `opencode --version` command
 * Result is cached for performance
 * 
 * @returns 版本字符串 (如 "1.2.3") 或 null (如果无法获取)
 */
export function getOpenCodeVersion(): string | null {
  if (cachedVersion !== NOT_CACHED) {
    return cachedVersion
  }

  try {
    const result = execSync("opencode --version", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()

    const versionMatch = result.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/)
    cachedVersion = versionMatch?.[1] ?? null
    return cachedVersion
  } catch {
    cachedVersion = null
    return null
  }
}

/**
 * 检查OpenCode版本是否至少为指定版本
 * Check if OpenCode version is at least the specified version
 * 
 * 如果无法获取版本信息，返回true (假设版本足够新)
 * If version cannot be retrieved, returns true (assume version is new enough)
 * 
 * @param version - 要检查的最低版本
 * @returns true 如果当前版本 >= 指定版本
 */
export function isOpenCodeVersionAtLeast(version: string): boolean {
  const current = getOpenCodeVersion()
  if (!current) return true
  return isVersionGte(current, version)
}

/**
 * 重置版本缓存 (用于测试)
 * Reset version cache (for testing)
 */
export function resetVersionCache(): void {
  cachedVersion = NOT_CACHED
}

/**
 * 设置版本缓存 (用于测试)
 * Set version cache (for testing)
 */
export function setVersionCache(version: string | null): void {
  cachedVersion = version
}
