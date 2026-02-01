/**
 * Tmux 集成工具模块
 * 
 * 用途：
 * - 在 Tmux 环境中创建和管理 pane（窗格）
 * - 支持后台 agent 在独立 pane 中运行
 * - 实现多 agent 并行工作的可视化界面
 * 
 * 使用场景：
 * - 当用户在 Tmux 中运行 OpenCode 时，可以自动创建新 pane 来运行子 agent
 * - 每个后台任务（explore、librarian 等）可以在独立窗格中显示进度
 * - 支持水平/垂直分割布局，自动调整窗格大小
 */
import { spawn } from "bun"
import type { TmuxConfig, TmuxLayout } from "../../config/schema"
import type { SpawnPaneResult } from "./types"
import { getTmuxPath } from "../../tools/interactive-bash/utils"

// 服务器可用性缓存，避免重复健康检查
let serverAvailable: boolean | null = null
let serverCheckUrl: string | null = null

/**
 * 检测当前是否在 Tmux 环境中运行
 * 通过检查 TMUX 环境变量来判断
 */
export function isInsideTmux(): boolean {
  return !!process.env.TMUX
}

/**
 * 检查 OpenCode 服务器是否正在运行
 * 
 * 实现细节：
 * - 使用缓存避免重复健康检查（性能优化）
 * - 3秒超时，最多重试2次
 * - 通过 /health 端点检测服务器状态
 * 
 * 为什么需要这个检查：
 * - 只有在服务器运行时才能创建新的 agent pane
 * - 避免在服务器未就绪时尝试连接导致错误
 */
export async function isServerRunning(serverUrl: string): Promise<boolean> {
  if (serverCheckUrl === serverUrl && serverAvailable === true) {
    return true
  }

  const healthUrl = new URL("/health", serverUrl).toString()
  const timeoutMs = 3000
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(healthUrl, { signal: controller.signal }).catch(
        () => null
      )
      clearTimeout(timeout)

      if (response?.ok) {
        serverCheckUrl = serverUrl
        serverAvailable = true
        return true
      }
    } finally {
      clearTimeout(timeout)
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  return false
}

/**
 * 重置服务器检查缓存
 * 用于测试或强制重新检查服务器状态
 */
export function resetServerCheck(): void {
  serverAvailable = null
  serverCheckUrl = null
}

/**
 * Tmux 分割方向
 * -h: 水平分割（左右）
 * -v: 垂直分割（上下）
 */
export type SplitDirection = "-h" | "-v"

/**
 * 获取当前 pane 的 ID
 * 从 TMUX_PANE 环境变量读取（格式如 "%42"）
 */
export function getCurrentPaneId(): string | undefined {
  return process.env.TMUX_PANE
}

/**
 * Pane 尺寸信息
 * 用于布局计算和窗格大小调整
 */
export interface PaneDimensions {
  paneWidth: number
  windowWidth: number
}

/**
 * 获取指定 pane 的尺寸信息
 * 通过 tmux display 命令查询 pane_width 和 window_width
 */
export async function getPaneDimensions(paneId: string): Promise<PaneDimensions | null> {
  const tmux = await getTmuxPath()
  if (!tmux) return null

  const proc = spawn([tmux, "display", "-p", "-t", paneId, "#{pane_width},#{window_width}"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()

  if (exitCode !== 0) return null

  const [paneWidth, windowWidth] = stdout.trim().split(",").map(Number)
  if (isNaN(paneWidth) || isNaN(windowWidth)) return null

  return { paneWidth, windowWidth }
}

/**
 * 创建新的 Tmux pane 来运行子 agent
 * 
 * 工作流程：
 * 1. 检查前置条件（配置启用、在 Tmux 中、服务器运行、tmux 可用）
 * 2. 使用 split-window 命令创建新 pane
 * 3. 在新 pane 中执行 `opencode attach` 连接到指定 session
 * 4. 设置 pane 标题为 "omo-subagent-{description}"
 * 
 * 参数说明：
 * @param sessionId - OpenCode session ID，用于 attach 命令
 * @param description - Agent 描述，用于 pane 标题
 * @param config - Tmux 配置（是否启用等）
 * @param serverUrl - OpenCode 服务器地址
 * @param targetPaneId - 目标 pane ID（在哪个 pane 旁边分割）
 * @param splitDirection - 分割方向（-h 水平，-v 垂直）
 * 
 * 使用场景：
 * - 后台 agent（explore、librarian）需要独立窗格显示进度
 * - 多个 agent 并行工作时的可视化管理
 */
export async function spawnTmuxPane(
  sessionId: string,
  description: string,
  config: TmuxConfig,
  serverUrl: string,
  targetPaneId?: string,
  splitDirection: SplitDirection = "-h"
): Promise<SpawnPaneResult> {
  const { log } = await import("../logger")
  
  log("[spawnTmuxPane] called", { sessionId, description, serverUrl, configEnabled: config.enabled, targetPaneId, splitDirection })
  
  if (!config.enabled) {
    log("[spawnTmuxPane] SKIP: config.enabled is false")
    return { success: false }
  }
  if (!isInsideTmux()) {
    log("[spawnTmuxPane] SKIP: not inside tmux", { TMUX: process.env.TMUX })
    return { success: false }
  }
  
  const serverRunning = await isServerRunning(serverUrl)
  if (!serverRunning) {
    log("[spawnTmuxPane] SKIP: server not running", { serverUrl })
    return { success: false }
  }

  const tmux = await getTmuxPath()
  if (!tmux) {
    log("[spawnTmuxPane] SKIP: tmux not found")
    return { success: false }
  }
  
  log("[spawnTmuxPane] all checks passed, spawning...")

  const opencodeCmd = `opencode attach ${serverUrl} --session ${sessionId}`

  const args = [
    "split-window",
    splitDirection,
    "-d",
    "-P",
    "-F",
    "#{pane_id}",
    ...(targetPaneId ? ["-t", targetPaneId] : []),
    opencodeCmd,
  ]

  const proc = spawn([tmux, ...args], { stdout: "pipe", stderr: "pipe" })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const paneId = stdout.trim()

  if (exitCode !== 0 || !paneId) {
    return { success: false }
  }

  const title = `omo-subagent-${description.slice(0, 20)}`
  spawn([tmux, "select-pane", "-t", paneId, "-T", title], {
    stdout: "ignore",
    stderr: "ignore",
  })

  return { success: true, paneId }
}

/**
 * 关闭指定的 Tmux pane
 * 
 * 使用场景：
 * - 后台 agent 任务完成后清理窗格
 * - 错误处理时关闭失败的 agent pane
 */
export async function closeTmuxPane(paneId: string): Promise<boolean> {
  const { log } = await import("../logger")
  
  if (!isInsideTmux()) {
    log("[closeTmuxPane] SKIP: not inside tmux")
    return false
  }

  const tmux = await getTmuxPath()
  if (!tmux) {
    log("[closeTmuxPane] SKIP: tmux not found")
    return false
  }

  log("[closeTmuxPane] killing pane", { paneId })
  
  const proc = spawn([tmux, "kill-pane", "-t", paneId], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()

  if (exitCode !== 0) {
    log("[closeTmuxPane] FAILED", { paneId, exitCode, stderr: stderr.trim() })
  } else {
    log("[closeTmuxPane] SUCCESS", { paneId })
  }

  return exitCode === 0
}

/**
 * 替换现有 pane 中的进程
 * 
 * 工作原理：
 * - 使用 respawn-pane -k 杀死旧进程并启动新进程
 * - 保持 pane ID 不变，只替换其中运行的命令
 * 
 * 使用场景：
 * - Agent 需要重启但希望保持窗格位置
 * - 复用现有布局而不是创建新 pane
 */
export async function replaceTmuxPane(
  paneId: string,
  sessionId: string,
  description: string,
  config: TmuxConfig,
  serverUrl: string
): Promise<SpawnPaneResult> {
  const { log } = await import("../logger")
  
  log("[replaceTmuxPane] called", { paneId, sessionId, description })
  
  if (!config.enabled) {
    return { success: false }
  }
  if (!isInsideTmux()) {
    return { success: false }
  }

  const tmux = await getTmuxPath()
  if (!tmux) {
    return { success: false }
  }

  const opencodeCmd = `opencode attach ${serverUrl} --session ${sessionId}`

  const proc = spawn([tmux, "respawn-pane", "-k", "-t", paneId, opencodeCmd], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    log("[replaceTmuxPane] FAILED", { paneId, exitCode, stderr: stderr.trim() })
    return { success: false }
  }

  const title = `omo-subagent-${description.slice(0, 20)}`
  spawn([tmux, "select-pane", "-t", paneId, "-T", title], {
    stdout: "ignore",
    stderr: "ignore",
  })

  log("[replaceTmuxPane] SUCCESS", { paneId, sessionId })
  return { success: true, paneId }
}

/**
 * 应用 Tmux 布局
 * 
 * 支持的布局：
 * - even-horizontal: 均匀水平分布
 * - even-vertical: 均匀垂直分布
 * - main-horizontal: 主窗格在上，其他在下
 * - main-vertical: 主窗格在左，其他在右
 * - tiled: 平铺布局
 * 
 * 对于 main-* 布局，会设置主窗格的大小百分比
 */
export async function applyLayout(
  tmux: string,
  layout: TmuxLayout,
  mainPaneSize: number
): Promise<void> {
  const layoutProc = spawn([tmux, "select-layout", layout], { stdout: "ignore", stderr: "ignore" })
  await layoutProc.exited

  if (layout.startsWith("main-")) {
    const dimension =
      layout === "main-horizontal" ? "main-pane-height" : "main-pane-width"
    const sizeProc = spawn([tmux, "set-window-option", dimension, `${mainPaneSize}%`], {
      stdout: "ignore",
      stderr: "ignore",
    })
    await sizeProc.exited
  }
}

/**
 * 强制调整主 pane 宽度为窗口宽度的一半
 * 
 * 计算逻辑：
 * - 窗口宽度减去分隔符宽度（1列）
 * - 除以2得到主 pane 应有的宽度
 * 
 * 使用场景：
 * - 创建新 pane 后保持主 pane 占据一半屏幕
 * - 防止主 pane 被挤压得太小
 */
export async function enforceMainPaneWidth(
  mainPaneId: string,
  windowWidth: number
): Promise<void> {
  const { log } = await import("../logger")
  const tmux = await getTmuxPath()
  if (!tmux) return

  const DIVIDER_WIDTH = 1
  const mainWidth = Math.floor((windowWidth - DIVIDER_WIDTH) / 2)
  
  const proc = spawn([tmux, "resize-pane", "-t", mainPaneId, "-x", String(mainWidth)], {
    stdout: "ignore",
    stderr: "ignore",
  })
  await proc.exited
  
  log("[enforceMainPaneWidth] main pane resized", { mainPaneId, mainWidth, windowWidth })
}
