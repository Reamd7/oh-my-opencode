/**
 * 自动更新检查器钩子
 * 
 * 功能：
 * - 在会话创建时检查插件更新
 * - 支持自动更新和手动通知两种模式
 * - 显示启动动画和版本信息
 * - 检测本地开发模式
 * - 支持多渠道版本管理（latest, alpha, beta等）
 * 
 * 更新流程：
 * 1. 检测当前版本和最新版本
 * 2. 如果启用自动更新，更新配置文件中的版本号
 * 3. 清除npm缓存并运行bun install
 * 4. 显示更新成功通知
 */
import type { PluginInput } from "@opencode-ai/plugin"
import { getCachedVersion, getLocalDevVersion, findPluginEntry, getLatestVersion, updatePinnedVersion } from "./checker"
import { invalidatePackage } from "./cache"
import { PACKAGE_NAME } from "./constants"
import { log } from "../../shared/logger"
import { getConfigLoadErrors, clearConfigLoadErrors } from "../../shared/config-errors"
import { runBunInstall } from "../../cli/config-manager"
import { isModelCacheAvailable } from "../../shared/model-availability"
import { hasConnectedProvidersCache, updateConnectedProvidersCache } from "../../shared/connected-providers-cache"
import type { AutoUpdateCheckerOptions } from "./types"

// 西西弗斯旋转动画帧
const SISYPHUS_SPINNER = ["·", "•", "●", "○", "◌", "◦", " "]

/**
 * 判断是否为预发布版本（包含 - 符号）
 */
export function isPrereleaseVersion(version: string): boolean {
  return version.includes("-")
}

/**
 * 判断是否为dist-tag（不以数字开头）
 */
export function isDistTag(version: string): boolean {
  const startsWithDigit = /^\d/.test(version)
  return !startsWithDigit
}

/**
 * 判断是否为预发布版本或dist-tag
 */
export function isPrereleaseOrDistTag(pinnedVersion: string | null): boolean {
  if (!pinnedVersion) return false
  return isPrereleaseVersion(pinnedVersion) || isDistTag(pinnedVersion)
}

/**
 * 从版本号中提取渠道名称
 * 
 * 支持的渠道：
 * - latest: 稳定版本
 * - alpha, beta, rc, canary, next: 预发布渠道
 * 
 * @example
 * extractChannel("1.0.0-alpha.1") // "alpha"
 * extractChannel("next") // "next"
 * extractChannel("1.0.0") // "latest"
 */
export function extractChannel(version: string | null): string {
  if (!version) return "latest"
  
  if (isDistTag(version)) {
    return version
  }
  
  if (isPrereleaseVersion(version)) {
    const prereleasePart = version.split("-")[1]
    if (prereleasePart) {
      const channelMatch = prereleasePart.match(/^(alpha|beta|rc|canary|next)/)
      if (channelMatch) {
        return channelMatch[1]
      }
    }
  }
  
  return "latest"
}

/**
 * 创建自动更新检查器钩子
 * 
 * @param ctx - 插件上下文
 * @param options - 配置选项
 * @param options.showStartupToast - 是否显示启动提示（默认true）
 * @param options.isSisyphusEnabled - 是否启用Sisyphus模式（默认false）
 * @param options.autoUpdate - 是否自动更新（默认true）
 */
export function createAutoUpdateCheckerHook(ctx: PluginInput, options: AutoUpdateCheckerOptions = {}) {
  const { showStartupToast = true, isSisyphusEnabled = false, autoUpdate = true } = options

  const getToastMessage = (isUpdate: boolean, latestVersion?: string): string => {
    if (isSisyphusEnabled) {
      return isUpdate
        ? `Sisyphus on steroids is steering OpenCode.\nv${latestVersion} available. Restart to apply.`
        : `Sisyphus on steroids is steering OpenCode.`
    }
    return isUpdate
      ? `OpenCode is now on Steroids. oMoMoMoMo...\nv${latestVersion} available. Restart OpenCode to apply.`
      : `OpenCode is now on Steroids. oMoMoMoMo...`
  }

  let hasChecked = false

  return {
    event: ({ event }: { event: { type: string; properties?: unknown } }) => {
      // 只在会话创建时检查一次
      if (event.type !== "session.created") return
      if (hasChecked) return

      // 跳过子会话
      const props = event.properties as { info?: { parentID?: string } } | undefined
      if (props?.info?.parentID) return

      hasChecked = true

      // 异步执行更新检查，避免阻塞会话创建
      setTimeout(async () => {
        const cachedVersion = getCachedVersion()
        const localDevVersion = getLocalDevVersion(ctx.directory)
        const displayVersion = localDevVersion ?? cachedVersion

        // 显示配置错误、模型缓存警告、连接的提供商状态
        await showConfigErrorsIfAny(ctx)
        await showModelCacheWarningIfNeeded(ctx)
        await updateAndShowConnectedProvidersCacheStatus(ctx)

        // 本地开发模式：显示开发版本提示
        if (localDevVersion) {
          if (showStartupToast) {
            showLocalDevToast(ctx, displayVersion, isSisyphusEnabled).catch(() => {})
          }
          log("[auto-update-checker] Local development mode")
          return
        }

        // 显示当前版本
        if (showStartupToast) {
          showVersionToast(ctx, displayVersion, getToastMessage(false)).catch(() => {})
        }

        // 后台检查更新
        runBackgroundUpdateCheck(ctx, autoUpdate, getToastMessage).catch(err => {
          log("[auto-update-checker] Background update check failed:", err)
        })
      }, 0)
    },
  }
}

/**
 * 后台执行更新检查
 * 
 * 流程：
 * 1. 查找插件配置
 * 2. 获取当前版本和最新版本
 * 3. 比较版本号
 * 4. 如果启用自动更新，更新配置并安装
 * 5. 显示相应的通知
 */
async function runBackgroundUpdateCheck(
  ctx: PluginInput,
  autoUpdate: boolean,
  getToastMessage: (isUpdate: boolean, latestVersion?: string) => string
): Promise<void> {
  const pluginInfo = findPluginEntry(ctx.directory)
  if (!pluginInfo) {
    log("[auto-update-checker] Plugin not found in config")
    return
  }

  const cachedVersion = getCachedVersion()
  const currentVersion = cachedVersion ?? pluginInfo.pinnedVersion
  if (!currentVersion) {
    log("[auto-update-checker] No version found (cached or pinned)")
    return
  }

  // 根据固定版本提取渠道（latest/alpha/beta等）
  const channel = extractChannel(pluginInfo.pinnedVersion ?? currentVersion)
  const latestVersion = await getLatestVersion(channel)
  if (!latestVersion) {
    log("[auto-update-checker] Failed to fetch latest version for channel:", channel)
    return
  }

  // 已是最新版本
  if (currentVersion === latestVersion) {
    log("[auto-update-checker] Already on latest version for channel:", channel)
    return
  }

  log(`[auto-update-checker] Update available (${channel}): ${currentVersion} → ${latestVersion}`)

  // 仅通知模式
  if (!autoUpdate) {
    await showUpdateAvailableToast(ctx, latestVersion, getToastMessage)
    log("[auto-update-checker] Auto-update disabled, notification only")
    return
  }

  // 更新配置文件中的固定版本
  if (pluginInfo.isPinned) {
    const updated = updatePinnedVersion(pluginInfo.configPath, pluginInfo.entry, latestVersion)
    if (!updated) {
      await showUpdateAvailableToast(ctx, latestVersion, getToastMessage)
      log("[auto-update-checker] Failed to update pinned version in config")
      return
    }
    log(`[auto-update-checker] Config updated: ${pluginInfo.entry} → ${PACKAGE_NAME}@${latestVersion}`)
  }

  // 清除缓存的包
  invalidatePackage(PACKAGE_NAME)

  // 运行bun install安装新版本
  const installSuccess = await runBunInstallSafe()

  if (installSuccess) {
    await showAutoUpdatedToast(ctx, currentVersion, latestVersion)
    log(`[auto-update-checker] Update installed: ${currentVersion} → ${latestVersion}`)
  } else {
    await showUpdateAvailableToast(ctx, latestVersion, getToastMessage)
    log("[auto-update-checker] bun install failed; update not installed (falling back to notification-only)")
  }
}

async function runBunInstallSafe(): Promise<boolean> {
  try {
    return await runBunInstall()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log("[auto-update-checker] bun install error:", errorMessage)
    return false
  }
}

async function showModelCacheWarningIfNeeded(ctx: PluginInput): Promise<void> {
  if (isModelCacheAvailable()) return

  await ctx.client.tui
    .showToast({
      body: {
        title: "Model Cache Not Found",
        message: "Run 'opencode models --refresh' or restart OpenCode to populate the models cache for optimal agent model selection.",
        variant: "warning" as const,
        duration: 10000,
      },
    })
    .catch(() => {})

  log("[auto-update-checker] Model cache warning shown")
}

async function updateAndShowConnectedProvidersCacheStatus(ctx: PluginInput): Promise<void> {
  const hadCache = hasConnectedProvidersCache()

  updateConnectedProvidersCache(ctx.client).catch(() => {})

  if (!hadCache) {
    await ctx.client.tui
      .showToast({
        body: {
          title: "Connected Providers Cache",
          message: "Building provider cache for first time. Restart OpenCode for full model filtering.",
          variant: "info" as const,
          duration: 8000,
        },
      })
      .catch(() => {})

    log("[auto-update-checker] Connected providers cache toast shown (first run)")
  } else {
    log("[auto-update-checker] Connected providers cache exists, updating in background")
  }
}

async function showConfigErrorsIfAny(ctx: PluginInput): Promise<void> {
  const errors = getConfigLoadErrors()
  if (errors.length === 0) return

  const errorMessages = errors.map(e => `${e.path}: ${e.error}`).join("\n")
  await ctx.client.tui
    .showToast({
      body: {
        title: "Config Load Error",
        message: `Failed to load config:\n${errorMessages}`,
        variant: "error" as const,
        duration: 10000,
      },
    })
    .catch(() => {})

  log(`[auto-update-checker] Config load errors shown: ${errors.length} error(s)`)
  clearConfigLoadErrors()
}

async function showVersionToast(ctx: PluginInput, version: string | null, message: string): Promise<void> {
  const displayVersion = version ?? "unknown"
  await showSpinnerToast(ctx, displayVersion, message)
  log(`[auto-update-checker] Startup toast shown: v${displayVersion}`)
}

async function showSpinnerToast(ctx: PluginInput, version: string, message: string): Promise<void> {
  const totalDuration = 5000
  const frameInterval = 100
  const totalFrames = Math.floor(totalDuration / frameInterval)

  for (let i = 0; i < totalFrames; i++) {
    const spinner = SISYPHUS_SPINNER[i % SISYPHUS_SPINNER.length]
    await ctx.client.tui
      .showToast({
        body: {
          title: `${spinner} OhMyOpenCode ${version}`,
          message,
          variant: "info" as const,
          duration: frameInterval + 50,
        },
      })
      .catch(() => { })
    await new Promise(resolve => setTimeout(resolve, frameInterval))
  }
}

async function showUpdateAvailableToast(
  ctx: PluginInput,
  latestVersion: string,
  getToastMessage: (isUpdate: boolean, latestVersion?: string) => string
): Promise<void> {
  await ctx.client.tui
    .showToast({
      body: {
        title: `OhMyOpenCode ${latestVersion}`,
        message: getToastMessage(true, latestVersion),
        variant: "info" as const,
        duration: 8000,
      },
    })
    .catch(() => {})
  log(`[auto-update-checker] Update available toast shown: v${latestVersion}`)
}

async function showAutoUpdatedToast(ctx: PluginInput, oldVersion: string, newVersion: string): Promise<void> {
  await ctx.client.tui
    .showToast({
      body: {
        title: `OhMyOpenCode Updated!`,
        message: `v${oldVersion} → v${newVersion}\nRestart OpenCode to apply.`,
        variant: "success" as const,
        duration: 8000,
      },
    })
    .catch(() => {})
  log(`[auto-update-checker] Auto-updated toast shown: v${oldVersion} → v${newVersion}`)
}

async function showLocalDevToast(ctx: PluginInput, version: string | null, isSisyphusEnabled: boolean): Promise<void> {
  const displayVersion = version ?? "dev"
  const message = isSisyphusEnabled
    ? "Sisyphus running in local development mode."
    : "Running in local development mode. oMoMoMo..."
  await showSpinnerToast(ctx, `${displayVersion} (dev)`, message)
  log(`[auto-update-checker] Local dev toast shown: v${displayVersion}`)
}

export type { UpdateCheckResult, AutoUpdateCheckerOptions } from "./types"
export { checkForUpdate } from "./checker"
export { invalidatePackage, invalidateCache } from "./cache"
