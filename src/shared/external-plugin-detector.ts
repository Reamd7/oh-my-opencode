/**
 * 外部插件冲突检测器 - 检测可能与oh-my-opencode功能冲突的外部插件
 * External plugin conflict detector - Detects external plugins that may conflict with oh-my-opencode features
 * 
 * 主要用途:
 * - 检测并发通知插件以防止崩溃
 * - 在Windows上防止资源竞争导致的崩溃
 * - 自动禁用冲突的功能
 * 
 * Primary uses:
 * - Detect concurrent notification plugins to prevent crashes
 * - Prevent resource contention crashes on Windows
 * - Auto-disable conflicting features
 * 
 * 已知冲突:
 * - opencode-notifier: 两个插件同时监听session.idle事件会导致Windows崩溃
 * 
 * Known conflicts:
 * - opencode-notifier: Both plugins listening to session.idle causes Windows crashes
 * 
 * @module external-plugin-detector
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { log } from "./logger"
import { parseJsoncSafe } from "./jsonc-parser"

interface OpencodeConfig {
  plugin?: string[]
}

/**
 * 已知的与oh-my-opencode的session-notification冲突的通知插件
 * Known notification plugins that conflict with oh-my-opencode's session-notification
 * 
 * 两个插件同时监听session.idle并发送通知，
 * 在Windows上会因资源竞争导致崩溃。
 * 
 * Both plugins listen to session.idle and send notifications simultaneously,
 * which can cause crashes on Windows due to resource contention.
 */
const KNOWN_NOTIFICATION_PLUGINS = [
  "opencode-notifier",
  "@mohak34/opencode-notifier",
  "mohak34/opencode-notifier",
]

function getWindowsAppdataDir(): string | null {
  return process.env.APPDATA || null
}

function getConfigPaths(directory: string): string[] {
  const crossPlatformDir = path.join(os.homedir(), ".config")
  const paths = [
    path.join(directory, ".opencode", "opencode.json"),
    path.join(directory, ".opencode", "opencode.jsonc"),
    path.join(crossPlatformDir, "opencode", "opencode.json"),
    path.join(crossPlatformDir, "opencode", "opencode.jsonc"),
  ]

  if (process.platform === "win32") {
    const appdataDir = getWindowsAppdataDir()
    if (appdataDir) {
      paths.push(path.join(appdataDir, "opencode", "opencode.json"))
      paths.push(path.join(appdataDir, "opencode", "opencode.jsonc"))
    }
  }

  return paths
}

function loadOpencodePlugins(directory: string): string[] {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue
      const content = fs.readFileSync(configPath, "utf-8")
      const result = parseJsoncSafe<OpencodeConfig>(content)
      if (result.data) {
        return result.data.plugin ?? []
      }
    } catch {
      continue
    }
  }
  return []
}

/**
 * 检查插件条目是否匹配已知的通知插件
 * Check if a plugin entry matches a known notification plugin
 * 
 * 处理多种格式:
 * - "name" - 简单名称
 * - "name@version" - 带版本号
 * - "npm:name" - npm前缀
 * - "file://path/name" - 文件路径
 * 
 * Handles various formats:
 * - "name" - Simple name
 * - "name@version" - With version
 * - "npm:name" - npm prefix
 * - "file://path/name" - File path
 */
function matchesNotificationPlugin(entry: string): string | null {
  const normalized = entry.toLowerCase()
  for (const known of KNOWN_NOTIFICATION_PLUGINS) {
    // Exact match
    if (normalized === known) return known
    // Version suffix: "opencode-notifier@1.2.3"
    if (normalized.startsWith(`${known}@`)) return known
    // Scoped package: "@mohak34/opencode-notifier" or "@mohak34/opencode-notifier@1.2.3"
    if (normalized === `@mohak34/${known}` || normalized.startsWith(`@mohak34/${known}@`)) return known
    // npm: prefix
    if (normalized === `npm:${known}` || normalized.startsWith(`npm:${known}@`)) return known
    // file:// path ending exactly with package name
    if (normalized.startsWith("file://") && (
      normalized.endsWith(`/${known}`) || 
      normalized.endsWith(`\\${known}`)
    )) return known
  }
  return null
}

export interface ExternalNotifierResult {
  detected: boolean
  pluginName: string | null
  allPlugins: string[]
}

/**
 * Detect if any external notification plugin is configured.
 * Returns information about detected plugins for logging/warning.
 */
export function detectExternalNotificationPlugin(directory: string): ExternalNotifierResult {
  const plugins = loadOpencodePlugins(directory)
  
  for (const plugin of plugins) {
    const match = matchesNotificationPlugin(plugin)
    if (match) {
      log(`Detected external notification plugin: ${plugin}`)
      return {
        detected: true,
        pluginName: match,
        allPlugins: plugins,
      }
    }
  }

  return {
    detected: false,
    pluginName: null,
    allPlugins: plugins,
  }
}

/**
 * Generate a warning message for users with conflicting notification plugins.
 */
export function getNotificationConflictWarning(pluginName: string): string {
  return `[oh-my-opencode] External notification plugin detected: ${pluginName}

Both oh-my-opencode and ${pluginName} listen to session.idle events.
   Running both simultaneously can cause crashes on Windows.

   oh-my-opencode's session-notification has been auto-disabled.

   To use oh-my-opencode's notifications instead, either:
   1. Remove ${pluginName} from your opencode.json plugins
   2. Or set "notification": { "force_enable": true } in oh-my-opencode.json`
}
