import type { PluginInput } from "@opencode-ai/plugin"
import type { TrackedTask, TaskStatus, ModelFallbackInfo } from "./types"
import type { ConcurrencyManager } from "../background-agent/concurrency"

type OpencodeClient = PluginInput["client"]

/**
 * 任务通知管理器
 * 
 * 管理所有后台任务的UI通知，提供实时状态可视化
 */
export class TaskToastManager {
  private tasks: Map<string, TrackedTask> = new Map()
  private client: OpencodeClient
  private concurrencyManager?: ConcurrencyManager

  constructor(client: OpencodeClient, concurrencyManager?: ConcurrencyManager) {
    this.client = client
    this.concurrencyManager = concurrencyManager
  }

  setConcurrencyManager(manager: ConcurrencyManager): void {
    this.concurrencyManager = manager
  }

  addTask(task: {
    id: string
    description: string
    agent: string
    isBackground: boolean
    status?: TaskStatus
    category?: string
    skills?: string[]
    modelInfo?: ModelFallbackInfo
  }): void {
    const trackedTask: TrackedTask = {
      id: task.id,
      description: task.description,
      agent: task.agent,
      status: task.status ?? "running",
      startedAt: new Date(),
      isBackground: task.isBackground,
      category: task.category,
      skills: task.skills,
      modelInfo: task.modelInfo,
    }

    this.tasks.set(task.id, trackedTask)
    this.showTaskListToast(trackedTask)
  }

  /**
   * 更新任务状态
   * 
   * @param id 任务ID
   * @param status 新状态 (running/queued/completed/error)
   */
  updateTask(id: string, status: TaskStatus): void {
    const task = this.tasks.get(id)
    if (task) {
      task.status = status
    }
  }

  /**
   * 移除已完成或错误的任务
   * 
   * @param id 任务ID
   */
  removeTask(id: string): void {
    this.tasks.delete(id)
  }

  /**
   * 获取所有运行中的任务（最新的在前）
   * 
   * @returns 运行中任务列表
   */
  getRunningTasks(): TrackedTask[] {
    const running = Array.from(this.tasks.values())
      .filter((t) => t.status === "running")
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    return running
  }

  /**
   * 获取所有排队中的任务
   * 
   * @returns 排队任务列表（按启动时间排序）
   */
  getQueuedTasks(): TrackedTask[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.status === "queued")
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  }

  /**
   * 格式化任务运行时长
   * 
   * 格式: 
   * - <60s: "Xs"
   * - <60m: "Xm Ys"
   * - >=60m: "Xh Ym"
   * 
   * @param startedAt 任务启动时间
   * @returns 格式化的时长字符串
   */
  private formatDuration(startedAt: Date): string {
    const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  private getConcurrencyInfo(): string {
    if (!this.concurrencyManager) return ""
    const running = this.getRunningTasks()
    const queued = this.getQueuedTasks()
    const total = running.length + queued.length
    const limit = this.concurrencyManager.getConcurrencyLimit("default")
    if (limit === Infinity) return ""
    return ` [${total}/${limit}]`
  }

  private buildTaskListMessage(newTask: TrackedTask): string {
    const running = this.getRunningTasks()
    const queued = this.getQueuedTasks()
    const concurrencyInfo = this.getConcurrencyInfo()

    const lines: string[] = []

    const isFallback = newTask.modelInfo && (
      newTask.modelInfo.type === "inherited" || newTask.modelInfo.type === "system-default"
    )
    if (isFallback) {
      const suffixMap: Record<"inherited" | "system-default", string> = {
        inherited: " (inherited from parent)",
        "system-default": " (system default fallback)",
      }
      const suffix = suffixMap[newTask.modelInfo!.type as "inherited" | "system-default"]
      lines.push(`[FALLBACK] Model: ${newTask.modelInfo!.model}${suffix}`)
      lines.push("")
    }

    if (running.length > 0) {
      lines.push(`Running (${running.length}):${concurrencyInfo}`)
      for (const task of running) {
        const duration = this.formatDuration(task.startedAt)
        const bgIcon = task.isBackground ? "[BG]" : "[RUN]"
        const isNew = task.id === newTask.id ? " ← NEW" : ""
        const categoryInfo = task.category ? `/${task.category}` : ""
        const skillsInfo = task.skills?.length ? ` [${task.skills.join(", ")}]` : ""
        lines.push(`${bgIcon} ${task.description} (${task.agent}${categoryInfo})${skillsInfo} - ${duration}${isNew}`)
      }
    }

    if (queued.length > 0) {
      if (lines.length > 0) lines.push("")
      lines.push(`Queued (${queued.length}):`)
      for (const task of queued) {
        const bgIcon = task.isBackground ? "[Q]" : "[W]"
        const categoryInfo = task.category ? `/${task.category}` : ""
        const skillsInfo = task.skills?.length ? ` [${task.skills.join(", ")}]` : ""
        const isNew = task.id === newTask.id ? " ← NEW" : ""
        lines.push(`${bgIcon} ${task.description} (${task.agent}${categoryInfo})${skillsInfo} - Queued${isNew}`)
      }
    }

    return lines.join("\n")
  }

  /**
   * 显示任务列表通知
   * 
   * 合并显示所有运行中和排队中的任务，
   * 高亮标记新添加的任务
   * 
   * @param newTask 新添加的任务
   */
  private showTaskListToast(newTask: TrackedTask): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tuiClient = this.client as any
    if (!tuiClient.tui?.showToast) return

    const message = this.buildTaskListMessage(newTask)
    const running = this.getRunningTasks()
    const queued = this.getQueuedTasks()

    const title = newTask.isBackground
      ? `New Background Task`
      : `New Task Executed`

    tuiClient.tui.showToast({
      body: {
        title,
        message: message || `${newTask.description} (${newTask.agent})`,
        variant: "info",
        duration: running.length + queued.length > 2 ? 5000 : 3000,
      },
    }).catch(() => {})
  }

  /**
   * 显示任务完成通知
   * 
   * 显示完成时长和剩余任务数量
   * 
   * @param task 完成的任务信息
   */
  showCompletionToast(task: { id: string; description: string; duration: string }): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tuiClient = this.client as any
    if (!tuiClient.tui?.showToast) return

    this.removeTask(task.id)

    const remaining = this.getRunningTasks()
    const queued = this.getQueuedTasks()

    let message = `"${task.description}" finished in ${task.duration}`
    if (remaining.length > 0 || queued.length > 0) {
      message += `\n\nStill running: ${remaining.length} | Queued: ${queued.length}`
    }

    tuiClient.tui.showToast({
      body: {
        title: "Task Completed",
        message,
        variant: "success",
        duration: 5000,
      },
    }).catch(() => {})
  }
}

let instance: TaskToastManager | null = null

export function getTaskToastManager(): TaskToastManager | null {
  return instance
}

export function initTaskToastManager(
  client: OpencodeClient,
  concurrencyManager?: ConcurrencyManager
): TaskToastManager {
  instance = new TaskToastManager(client, concurrencyManager)
  return instance
}
