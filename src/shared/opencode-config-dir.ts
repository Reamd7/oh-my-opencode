/**
 * OpenCode 配置目录解析工具
 * 
 * 核心功能：
 * - 遵循 XDG 基础目录规范（Linux/macOS）
 * - 支持 Windows APPDATA 路径
 * - 支持 Tauri 桌面应用配置目录
 * - 环境变量优先级：OPENCODE_CONFIG_DIR > 平台默认路径
 * 
 * 配置优先级（从高到低）：
 * 1. OPENCODE_CONFIG_DIR 环境变量
 * 2. 平台特定路径（XDG_CONFIG_HOME / APPDATA）
 * 3. 跨平台默认路径（~/.config/opencode）
 */
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

/** OpenCode 二进制类型：CLI 或桌面应用 */
export type OpenCodeBinaryType = "opencode" | "opencode-desktop"

/** 配置目录解析选项 */
export interface OpenCodeConfigDirOptions {
  /** 二进制类型：CLI 或桌面应用 */
  binary: OpenCodeBinaryType
  /** 版本号（用于判断 dev 构建） */
  version?: string | null
  /** 是否检查已存在的配置文件 */
  checkExisting?: boolean
}

/** OpenCode 配置文件路径集合 */
export interface OpenCodeConfigPaths {
  /** 配置目录根路径 */
  configDir: string
  /** opencode.json 路径 */
  configJson: string
  /** opencode.jsonc 路径（支持注释） */
  configJsonc: string
  /** package.json 路径 */
  packageJson: string
  /** oh-my-opencode.json 路径 */
  omoConfig: string
}

/** Tauri 桌面应用标识符（生产环境） */
export const TAURI_APP_IDENTIFIER = "ai.opencode.desktop"
/** Tauri 桌面应用标识符（开发环境） */
export const TAURI_APP_IDENTIFIER_DEV = "ai.opencode.desktop.dev"

/**
 * 判断是否为开发构建版本
 * 开发版本包含 "-dev" 或 ".dev" 后缀
 */
export function isDevBuild(version: string | null | undefined): boolean {
  if (!version) return false
  return version.includes("-dev") || version.includes(".dev")
}

/**
 * 获取 Tauri 桌面应用配置目录
 * 
 * 平台路径规则：
 * - macOS: ~/Library/Application Support/{identifier}
 * - Windows: %APPDATA%/{identifier}
 * - Linux: $XDG_CONFIG_HOME/{identifier} 或 ~/.config/{identifier}
 */
function getTauriConfigDir(identifier: string): string {
  const platform = process.platform

  switch (platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", identifier)

    case "win32": {
      const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      return join(appData, identifier)
    }

    case "linux":
    default: {
      const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
      return join(xdgConfig, identifier)
    }
  }
}

/**
 * 获取 CLI 配置目录
 * 
 * 优先级（从高到低）：
 * 1. OPENCODE_CONFIG_DIR 环境变量
 * 2. Windows: 检查 ~/.config/opencode（跨平台兼容）
 * 3. Windows: 检查 %APPDATA%/opencode（Windows 原生）
 * 4. Linux/macOS: $XDG_CONFIG_HOME/opencode 或 ~/.config/opencode
 * 
 * Windows 特殊处理：优先使用跨平台路径以保持一致性
 */
function getCliConfigDir(): string {
  const envConfigDir = process.env.OPENCODE_CONFIG_DIR?.trim()
  if (envConfigDir) {
    return resolve(envConfigDir)
  }

  if (process.platform === "win32") {
    const crossPlatformDir = join(homedir(), ".config", "opencode")
    const crossPlatformConfig = join(crossPlatformDir, "opencode.json")

    if (existsSync(crossPlatformConfig)) {
      return crossPlatformDir
    }

    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    const appdataDir = join(appData, "opencode")
    const appdataConfig = join(appdataDir, "opencode.json")

    if (existsSync(appdataConfig)) {
      return appdataDir
    }

    return crossPlatformDir
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(xdgConfig, "opencode")
}

/**
 * 获取 OpenCode 配置目录（主入口函数）
 * 
 * 解析逻辑：
 * - CLI 模式：直接返回 CLI 配置目录
 * - 桌面模式：优先检查旧版 CLI 配置（向后兼容），否则使用 Tauri 目录
 * 
 * @param options.binary - 二进制类型
 * @param options.version - 版本号（用于区分 dev/prod）
 * @param options.checkExisting - 是否检查已存在的配置文件（默认 true）
 */
export function getOpenCodeConfigDir(options: OpenCodeConfigDirOptions): string {
  const { binary, version, checkExisting = true } = options

  if (binary === "opencode") {
    return getCliConfigDir()
  }

  const identifier = isDevBuild(version) ? TAURI_APP_IDENTIFIER_DEV : TAURI_APP_IDENTIFIER
  const tauriDir = getTauriConfigDir(identifier)

  if (checkExisting) {
    const legacyDir = getCliConfigDir()
    const legacyConfig = join(legacyDir, "opencode.json")
    const legacyConfigC = join(legacyDir, "opencode.jsonc")

    if (existsSync(legacyConfig) || existsSync(legacyConfigC)) {
      return legacyDir
    }
  }

  return tauriDir
}

/**
 * 获取所有配置文件路径
 * 
 * 返回配置目录及其下的所有标准配置文件路径：
 * - opencode.json / opencode.jsonc（主配置）
 * - package.json（依赖管理）
 * - oh-my-opencode.json（插件配置）
 */
export function getOpenCodeConfigPaths(options: OpenCodeConfigDirOptions): OpenCodeConfigPaths {
  const configDir = getOpenCodeConfigDir(options)

  return {
    configDir,
    configJson: join(configDir, "opencode.json"),
    configJsonc: join(configDir, "opencode.jsonc"),
    packageJson: join(configDir, "package.json"),
    omoConfig: join(configDir, "oh-my-opencode.json"),
  }
}

/**
 * 检测已存在的配置目录
 * 
 * 按优先级顺序搜索所有可能的配置位置，返回第一个包含配置文件的目录。
 * 
 * 搜索顺序：
 * 1. OPENCODE_CONFIG_DIR 环境变量
 * 2. Tauri 桌面应用目录（dev/prod）
 * 3. CLI 配置目录
 * 
 * @returns 找到的配置目录路径，未找到返回 null
 */
export function detectExistingConfigDir(binary: OpenCodeBinaryType, version?: string | null): string | null {
  const locations: string[] = []

  const envConfigDir = process.env.OPENCODE_CONFIG_DIR?.trim()
  if (envConfigDir) {
    locations.push(resolve(envConfigDir))
  }

  if (binary === "opencode-desktop") {
    const identifier = isDevBuild(version) ? TAURI_APP_IDENTIFIER_DEV : TAURI_APP_IDENTIFIER
    locations.push(getTauriConfigDir(identifier))

    if (isDevBuild(version)) {
      locations.push(getTauriConfigDir(TAURI_APP_IDENTIFIER))
    }
  }

  locations.push(getCliConfigDir())

  for (const dir of locations) {
    const configJson = join(dir, "opencode.json")
    const configJsonc = join(dir, "opencode.jsonc")

    if (existsSync(configJson) || existsSync(configJsonc)) {
      return dir
    }
  }

  return null
}
