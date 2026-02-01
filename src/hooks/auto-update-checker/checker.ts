/**
 * 版本检查器
 * 
 * 功能：
 * - 检测本地开发模式
 * - 获取当前安装的版本
 * - 从npm获取最新版本
 * - 查找和更新配置文件中的插件版本
 * - 支持JSONC格式（带注释的JSON）
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { NpmDistTags, OpencodeConfig, PackageJson, UpdateCheckResult } from "./types"
import {
  PACKAGE_NAME,
  NPM_REGISTRY_URL,
  NPM_FETCH_TIMEOUT,
  INSTALLED_PACKAGE_JSON,
  USER_OPENCODE_CONFIG,
  USER_OPENCODE_CONFIG_JSONC,
  USER_CONFIG_DIR,
  getWindowsAppdataDir,
} from "./constants"
import * as os from "node:os"
import { log } from "../../shared/logger"

/**
 * 判断是否为本地开发模式
 */
export function isLocalDevMode(directory: string): boolean {
  return getLocalDevPath(directory) !== null
}

/**
 * 移除JSON注释和尾随逗号，支持JSONC格式
 */
function stripJsonComments(json: string): string {
  return json
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m))
    .replace(/,(\s*[}\]])/g, "$1")
}

function getConfigPaths(directory: string): string[] {
  const paths = [
    path.join(directory, ".opencode", "opencode.json"),
    path.join(directory, ".opencode", "opencode.jsonc"),
    USER_OPENCODE_CONFIG,
    USER_OPENCODE_CONFIG_JSONC,
  ]
  
  if (process.platform === "win32") {
    const crossPlatformDir = path.join(os.homedir(), ".config")
    const appdataDir = getWindowsAppdataDir()
    
    if (appdataDir) {
      const alternateDir = USER_CONFIG_DIR === crossPlatformDir ? appdataDir : crossPlatformDir
      const alternateConfig = path.join(alternateDir, "opencode", "opencode.json")
      const alternateConfigJsonc = path.join(alternateDir, "opencode", "opencode.jsonc")
      
      if (!paths.includes(alternateConfig)) {
        paths.push(alternateConfig)
      }
      if (!paths.includes(alternateConfigJsonc)) {
        paths.push(alternateConfigJsonc)
      }
    }
  }
  
  return paths
}

export function getLocalDevPath(directory: string): string | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue
      const content = fs.readFileSync(configPath, "utf-8")
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig
      const plugins = config.plugin ?? []

      for (const entry of plugins) {
        if (entry.startsWith("file://") && entry.includes(PACKAGE_NAME)) {
          try {
            return fileURLToPath(entry)
          } catch {
            return entry.replace("file://", "")
          }
        }
      }
    } catch {
      continue
    }
  }

  return null
}

function findPackageJsonUp(startPath: string): string | null {
  try {
    const stat = fs.statSync(startPath)
    let dir = stat.isDirectory() ? startPath : path.dirname(startPath)
    
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, "package.json")
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, "utf-8")
          const pkg = JSON.parse(content) as PackageJson
          if (pkg.name === PACKAGE_NAME) return pkgPath
        } catch {}
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {}
  return null
}

export function getLocalDevVersion(directory: string): string | null {
  const localPath = getLocalDevPath(directory)
  if (!localPath) return null

  try {
    const pkgPath = findPackageJsonUp(localPath)
    if (!pkgPath) return null
    const content = fs.readFileSync(pkgPath, "utf-8")
    const pkg = JSON.parse(content) as PackageJson
    return pkg.version ?? null
  } catch {
    return null
  }
}

export interface PluginEntryInfo {
  entry: string
  isPinned: boolean
  pinnedVersion: string | null
  configPath: string
}

export function findPluginEntry(directory: string): PluginEntryInfo | null {
  for (const configPath of getConfigPaths(directory)) {
    try {
      if (!fs.existsSync(configPath)) continue
      const content = fs.readFileSync(configPath, "utf-8")
      const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig
      const plugins = config.plugin ?? []

      for (const entry of plugins) {
        if (entry === PACKAGE_NAME) {
          return { entry, isPinned: false, pinnedVersion: null, configPath }
        }
        if (entry.startsWith(`${PACKAGE_NAME}@`)) {
          const pinnedVersion = entry.slice(PACKAGE_NAME.length + 1)
          const isPinned = pinnedVersion !== "latest"
          return { entry, isPinned, pinnedVersion: isPinned ? pinnedVersion : null, configPath }
        }
      }
    } catch {
      continue
    }
  }

  return null
}

export function getCachedVersion(): string | null {
  try {
    if (fs.existsSync(INSTALLED_PACKAGE_JSON)) {
      const content = fs.readFileSync(INSTALLED_PACKAGE_JSON, "utf-8")
      const pkg = JSON.parse(content) as PackageJson
      if (pkg.version) return pkg.version
    }
  } catch {}

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    const pkgPath = findPackageJsonUp(currentDir)
    if (pkgPath) {
      const content = fs.readFileSync(pkgPath, "utf-8")
      const pkg = JSON.parse(content) as PackageJson
      if (pkg.version) return pkg.version
    }
  } catch (err) {
    log("[auto-update-checker] Failed to resolve version from current directory:", err)
  }

  // Fallback for compiled binaries (npm global install)
  // process.execPath points to the actual binary location
  try {
    const execDir = path.dirname(fs.realpathSync(process.execPath))
    const pkgPath = findPackageJsonUp(execDir)
    if (pkgPath) {
      const content = fs.readFileSync(pkgPath, "utf-8")
      const pkg = JSON.parse(content) as PackageJson
      if (pkg.version) return pkg.version
    }
  } catch (err) {
    log("[auto-update-checker] Failed to resolve version from execPath:", err)
  }

  return null
}

/**
 * 更新配置文件中的固定版本
 * 
 * 特点：
 * - 仅在"plugin"数组内替换，避免误修改
 * - 通过字符串替换保留JSONC注释和格式
 * - 支持带注释的配置文件
 */
export function updatePinnedVersion(configPath: string, oldEntry: string, newVersion: string): boolean {
  try {
    const content = fs.readFileSync(configPath, "utf-8")
    const newEntry = `${PACKAGE_NAME}@${newVersion}`
    
    // 查找"plugin"数组区域以限定替换范围
    const pluginMatch = content.match(/"plugin"\s*:\s*\[/)
    if (!pluginMatch || pluginMatch.index === undefined) {
      log(`[auto-update-checker] No "plugin" array found in ${configPath}`)
      return false
    }
    
    // 查找plugin数组的结束括号
    const startIdx = pluginMatch.index + pluginMatch[0].length
    let bracketCount = 1
    let endIdx = startIdx
    
    for (let i = startIdx; i < content.length && bracketCount > 0; i++) {
      if (content[i] === "[") bracketCount++
      else if (content[i] === "]") bracketCount--
      endIdx = i
    }
    
    const before = content.slice(0, startIdx)
    const pluginArrayContent = content.slice(startIdx, endIdx)
    const after = content.slice(endIdx)
    
    // 仅替换plugin数组内的第一个匹配项
    const escapedOldEntry = oldEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`["']${escapedOldEntry}["']`)
    
    if (!regex.test(pluginArrayContent)) {
      log(`[auto-update-checker] Entry "${oldEntry}" not found in plugin array of ${configPath}`)
      return false
    }
    
    const updatedPluginArray = pluginArrayContent.replace(regex, `"${newEntry}"`)
    const updatedContent = before + updatedPluginArray + after
    
    if (updatedContent === content) {
      log(`[auto-update-checker] No changes made to ${configPath}`)
      return false
    }
    
    fs.writeFileSync(configPath, updatedContent, "utf-8")
    log(`[auto-update-checker] Updated ${configPath}: ${oldEntry} → ${newEntry}`)
    return true
  } catch (err) {
    log(`[auto-update-checker] Failed to update config file ${configPath}:`, err)
    return false
  }
}

export async function getLatestVersion(channel: string = "latest"): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), NPM_FETCH_TIMEOUT)

  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })

    if (!response.ok) return null

    const data = (await response.json()) as NpmDistTags
    return data[channel] ?? data.latest ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function checkForUpdate(directory: string): Promise<UpdateCheckResult> {
  if (isLocalDevMode(directory)) {
    log("[auto-update-checker] Local dev mode detected, skipping update check")
    return { needsUpdate: false, currentVersion: null, latestVersion: null, isLocalDev: true, isPinned: false }
  }

  const pluginInfo = findPluginEntry(directory)
  if (!pluginInfo) {
    log("[auto-update-checker] Plugin not found in config")
    return { needsUpdate: false, currentVersion: null, latestVersion: null, isLocalDev: false, isPinned: false }
  }

  const currentVersion = getCachedVersion() ?? pluginInfo.pinnedVersion
  if (!currentVersion) {
    log("[auto-update-checker] No cached version found")
    return { needsUpdate: false, currentVersion: null, latestVersion: null, isLocalDev: false, isPinned: false }
  }

  const { extractChannel } = await import("./index")
  const channel = extractChannel(pluginInfo.pinnedVersion ?? currentVersion)
  const latestVersion = await getLatestVersion(channel)
  if (!latestVersion) {
    log("[auto-update-checker] Failed to fetch latest version for channel:", channel)
    return { needsUpdate: false, currentVersion, latestVersion: null, isLocalDev: false, isPinned: pluginInfo.isPinned }
  }

  const needsUpdate = currentVersion !== latestVersion
  log(`[auto-update-checker] Current: ${currentVersion}, Latest (${channel}): ${latestVersion}, NeedsUpdate: ${needsUpdate}`)
  return { needsUpdate, currentVersion, latestVersion, isLocalDev: false, isPinned: pluginInfo.isPinned }
}
