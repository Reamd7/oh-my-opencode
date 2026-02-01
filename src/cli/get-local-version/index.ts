/**
 * CLI版本检查命令
 * 
 * ## 功能
 * 检测oh-my-opencode的本地版本并与最新版本比较
 * 
 * ## 检测模式
 * - local-dev: 本地开发模式（通过符号链接检测）
 * - pinned: 固定版本模式（用户指定版本）
 * - up-to-date: 已是最新版本
 * - outdated: 有新版本可用
 * - unknown: 无法检测版本
 * - error: 检测过程出错
 * 
 * ## 使用
 * ```bash
 * bunx oh-my-opencode get-local-version
 * bunx oh-my-opencode get-local-version --json
 * bunx oh-my-opencode get-local-version --directory=/path/to/project
 * ```
 * 
 * ## 输出信息
 * - 当前版本
 * - 最新版本
 * - 是否需要更新
 * - 版本状态
 */
import { getCachedVersion, getLatestVersion, isLocalDevMode, findPluginEntry } from "../../hooks/auto-update-checker/checker"
import type { GetLocalVersionOptions, VersionInfo } from "./types"
import { formatVersionOutput, formatJsonOutput } from "./formatter"

/**
 * 获取本地版本信息
 * 
 * @param options - 版本检查选项（目录、JSON输出）
 * @returns 退出码（0=成功，1=失败）
 */
export async function getLocalVersion(options: GetLocalVersionOptions = {}): Promise<number> {
  const directory = options.directory ?? process.cwd()
  
  try {
    if (isLocalDevMode(directory)) {
      const currentVersion = getCachedVersion()
      const info: VersionInfo = {
        currentVersion,
        latestVersion: null,
        isUpToDate: false,
        isLocalDev: true,
        isPinned: false,
        pinnedVersion: null,
        status: "local-dev",
      }
      
      console.log(options.json ? formatJsonOutput(info) : formatVersionOutput(info))
      return 0
    }

    const pluginInfo = findPluginEntry(directory)
    if (pluginInfo?.isPinned) {
      const info: VersionInfo = {
        currentVersion: pluginInfo.pinnedVersion,
        latestVersion: null,
        isUpToDate: false,
        isLocalDev: false,
        isPinned: true,
        pinnedVersion: pluginInfo.pinnedVersion,
        status: "pinned",
      }
      
      console.log(options.json ? formatJsonOutput(info) : formatVersionOutput(info))
      return 0
    }

    const currentVersion = getCachedVersion()
    if (!currentVersion) {
      const info: VersionInfo = {
        currentVersion: null,
        latestVersion: null,
        isUpToDate: false,
        isLocalDev: false,
        isPinned: false,
        pinnedVersion: null,
        status: "unknown",
      }
      
      console.log(options.json ? formatJsonOutput(info) : formatVersionOutput(info))
      return 1
    }

    const { extractChannel } = await import("../../hooks/auto-update-checker/index")
    const channel = extractChannel(pluginInfo?.pinnedVersion ?? currentVersion)
    const latestVersion = await getLatestVersion(channel)
    
    if (!latestVersion) {
      const info: VersionInfo = {
        currentVersion,
        latestVersion: null,
        isUpToDate: false,
        isLocalDev: false,
        isPinned: false,
        pinnedVersion: null,
        status: "error",
      }
      
      console.log(options.json ? formatJsonOutput(info) : formatVersionOutput(info))
      return 0
    }

    const isUpToDate = currentVersion === latestVersion
    const info: VersionInfo = {
      currentVersion,
      latestVersion,
      isUpToDate,
      isLocalDev: false,
      isPinned: false,
      pinnedVersion: null,
      status: isUpToDate ? "up-to-date" : "outdated",
    }

    console.log(options.json ? formatJsonOutput(info) : formatVersionOutput(info))
    return 0

  } catch (error) {
    const info: VersionInfo = {
      currentVersion: null,
      latestVersion: null,
      isUpToDate: false,
      isLocalDev: false,
      isPinned: false,
      pinnedVersion: null,
      status: "error",
    }
    
    console.log(options.json ? formatJsonOutput(info) : formatVersionOutput(info))
    return 1
  }
}

export * from "./types"
