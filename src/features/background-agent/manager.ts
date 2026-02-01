/**
 * 后台代理管理器 (Background Agent Manager)
 * 
 * ## 功能概述
 * BackgroundManager 是 oh-my-opencode 的核心任务编排引擎，负责管理所有异步后台任务的完整生命周期。
 * 
 * ## 核心职责
 * - **任务启动**: 创建和初始化后台任务，分配并发槽位
 * - **任务轮询**: 定期检查任务状态（2秒间隔），监控进度
 * - **并发控制**: 管理每个提供商/模型的并行任务数量和资源
 * - **稳定性检测**: 连续3次空闲轮询判定任务完成
 * - **进程清理**: 任务完成后的资源释放和通知
 * 
 * ## 任务生命周期
 * 1. **launch** → pending（入队等待）
 * 2. pending → running（获取并发槽位，开始执行）
 * 3. running → polling（定期检查状态）
 * 4. **稳定性检测**（3次连续空闲）
 * 5. running → completed/failed（完成或失败）
 * 6. **清理资源**（释放槽位，通知父会话）
 * 
 * ## 并发策略
 * - **最大并发数**: 根据 provider/model 限制（可配置）
 * - **队列管理**: FIFO 队列，按并发键分组
 * - **优先级支持**: 高优先级任务优先执行
 * 
 * ## 稳定性检测算法
 * 连续3次轮询无新消息 → 判定任务完成
 * 防止过早终止还在"思考"的任务
 * 
 * ## 清理机制
 * - **30分钟 TTL**: 超时自动清理
 * - **3分钟 stale timeout**: 无响应任务清理
 * - **会话删除**: 监听 session.deleted 事件，清理相关状态
 * 
 * @module features/background-agent/manager
 */

import type { PluginInput } from "@opencode-ai/plugin"
import type {
  BackgroundTask,
  LaunchInput,
  ResumeInput,
} from "./types"
import { log, getAgentToolRestrictions } from "../../shared"
import { ConcurrencyManager } from "./concurrency"
import type { BackgroundTaskConfig, TmuxConfig } from "../../config/schema"
import { isInsideTmux } from "../../shared/tmux"

import { subagentSessions } from "../claude-code-session-state"
import { getTaskToastManager } from "../task-toast-manager"
import { findNearestMessageWithFields, MESSAGE_STORAGE } from "../hook-message-injector"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

// 任务生命周期常量
const TASK_TTL_MS = 30 * 60 * 1000  // 30分钟：任务最大存活时间
const MIN_STABILITY_TIME_MS = 10 * 1000  // 10秒：稳定性检测前的最小运行时间
const DEFAULT_STALE_TIMEOUT_MS = 180_000  // 3分钟：无响应判定为停滞
const MIN_RUNTIME_BEFORE_STALE_MS = 30_000  // 30秒：停滞检测前的最小运行时间

type ProcessCleanupEvent = NodeJS.Signals | "beforeExit" | "exit"

type OpencodeClient = PluginInput["client"]


interface MessagePartInfo {
  sessionID?: string
  type?: string
  tool?: string
}

interface EventProperties {
  sessionID?: string
  info?: { id?: string }
  [key: string]: unknown
}

interface Event {
  type: string
  properties?: EventProperties
}

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

interface QueueItem {
  task: BackgroundTask
  input: LaunchInput
}

export interface SubagentSessionCreatedEvent {
  sessionID: string
  parentID: string
  title: string
}

export type OnSubagentSessionCreated = (event: SubagentSessionCreatedEvent) => Promise<void>

/**
 * 后台任务管理器
 * 
 * 负责管理所有后台任务的完整生命周期，包括：
 * - 任务队列和并发控制
 * - 状态跟踪和进度监控
 * - 稳定性检测和自动清理
 * - 父会话通知和资源释放
 */
export class BackgroundManager {
  // 静态成员：进程级清理管理
  private static cleanupManagers = new Set<BackgroundManager>()
  private static cleanupRegistered = false
  private static cleanupHandlers = new Map<ProcessCleanupEvent, () => void>()

  // 任务状态管理
  private tasks: Map<string, BackgroundTask>  // 所有任务的状态存储
  private notifications: Map<string, BackgroundTask[]>  // 待通知的任务队列
  private pendingByParent: Map<string, Set<string>>  // 按父会话分组的待处理任务（用于批量通知）
  
  // 核心依赖
  private client: OpencodeClient  // OpenCode API 客户端
  private directory: string  // 工作目录
  private pollingInterval?: ReturnType<typeof setInterval>  // 轮询定时器
  private concurrencyManager: ConcurrencyManager  // 并发控制管理器
  
  // 配置和状态
  private shutdownTriggered = false  // 关闭标志
  private config?: BackgroundTaskConfig  // 后台任务配置
  private tmuxEnabled: boolean  // Tmux 集成开关
  private onSubagentSessionCreated?: OnSubagentSessionCreated  // Tmux 会话创建回调
  private onShutdown?: () => void

  // 队列管理
  private queuesByKey: Map<string, QueueItem[]> = new Map()  // 按并发键分组的任务队列
  private processingKeys: Set<string> = new Set()  // 正在处理的并发键集合

  constructor(
    ctx: PluginInput,
    config?: BackgroundTaskConfig,
    options?: {
      tmuxConfig?: TmuxConfig
      onSubagentSessionCreated?: OnSubagentSessionCreated
      onShutdown?: () => void
    }
  ) {
    this.tasks = new Map()
    this.notifications = new Map()
    this.pendingByParent = new Map()
    this.client = ctx.client
    this.directory = ctx.directory
    this.concurrencyManager = new ConcurrencyManager(config)
    this.config = config
    this.tmuxEnabled = options?.tmuxConfig?.enabled ?? false
    this.onSubagentSessionCreated = options?.onSubagentSessionCreated
    this.onShutdown = options?.onShutdown
    this.registerProcessCleanup()
  }

  /**
   * 启动后台任务
   * 
   * 生命周期：创建任务 → 入队 → 等待并发槽位 → 开始执行
   * 
   * @param input 任务启动参数
   * @returns 创建的任务对象（状态为 pending）
   */
  async launch(input: LaunchInput): Promise<BackgroundTask> {
    log("[background-agent] launch() called with:", {
      agent: input.agent,
      model: input.model,
      description: input.description,
      parentSessionID: input.parentSessionID,
    })

    if (!input.agent || input.agent.trim() === "") {
      throw new Error("Agent parameter is required")
    }

    const task: BackgroundTask = {
      id: `bg_${crypto.randomUUID().slice(0, 8)}`,
      status: "pending",
      queuedAt: new Date(),
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      parentModel: input.parentModel,
      parentAgent: input.parentAgent,
      model: input.model,
    }

    this.tasks.set(task.id, task)

    if (input.parentSessionID) {
      const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(task.id)
      this.pendingByParent.set(input.parentSessionID, pending)
    }

    const key = this.getConcurrencyKeyFromInput(input)
    const queue = this.queuesByKey.get(key) ?? []
    queue.push({ task, input })
    this.queuesByKey.set(key, queue)

    log("[background-agent] Task queued:", { taskId: task.id, key, queueLength: queue.length })

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.addTask({
        id: task.id,
        description: input.description,
        agent: input.agent,
        isBackground: true,
        status: "queued",
        skills: input.skills,
      })
    }

    this.processKey(key)

    return task
  }

  /**
   * 处理指定并发键的任务队列
   * 
   * 并发控制核心：
   * 1. 防止同一并发键的重复处理
   * 2. 逐个获取并发槽位
   * 3. 启动任务并从队列移除
   * 
   * @param key 并发键（provider/model 或 agent）
   */
  private async processKey(key: string): Promise<void> {
    if (this.processingKeys.has(key)) {
      return
    }

    this.processingKeys.add(key)

    try {
      const queue = this.queuesByKey.get(key)
      while (queue && queue.length > 0) {
        const item = queue[0]

        await this.concurrencyManager.acquire(key)

        if (item.task.status === "cancelled") {
          this.concurrencyManager.release(key)
          queue.shift()
          continue
        }

        try {
          await this.startTask(item)
        } catch (error) {
          log("[background-agent] Error starting task:", error)
        }

        queue.shift()
      }
    } finally {
      this.processingKeys.delete(key)
    }
  }

  private async startTask(item: QueueItem): Promise<void> {
    const { task, input } = item

    log("[background-agent] Starting task:", {
      taskId: task.id,
      agent: input.agent,
      model: input.model,
    })

    const concurrencyKey = this.getConcurrencyKeyFromInput(input)

    const parentSession = await this.client.session.get({
      path: { id: input.parentSessionID },
    }).catch((err) => {
      log(`[background-agent] Failed to get parent session: ${err}`)
      return null
    })
    const parentDirectory = parentSession?.data?.directory ?? this.directory
    log(`[background-agent] Parent dir: ${parentSession?.data?.directory}, using: ${parentDirectory}`)

    const createResult = await this.client.session.create({
      body: {
        parentID: input.parentSessionID,
        title: `Background: ${input.description}`,
        permission: [
          { permission: "question", action: "deny" as const, pattern: "*" },
        ],
      } as any,
      query: {
        directory: parentDirectory,
      },
    }).catch((error) => {
      this.concurrencyManager.release(concurrencyKey)
      throw error
    })

    if (createResult.error) {
      this.concurrencyManager.release(concurrencyKey)
      throw new Error(`Failed to create background session: ${createResult.error}`)
    }

    const sessionID = createResult.data.id
    subagentSessions.add(sessionID)

    log("[background-agent] tmux callback check", {
      hasCallback: !!this.onSubagentSessionCreated,
      tmuxEnabled: this.tmuxEnabled,
      isInsideTmux: isInsideTmux(),
      sessionID,
      parentID: input.parentSessionID,
    })

    if (this.onSubagentSessionCreated && this.tmuxEnabled && isInsideTmux()) {
      log("[background-agent] Invoking tmux callback NOW", { sessionID })
      await this.onSubagentSessionCreated({
        sessionID,
        parentID: input.parentSessionID,
        title: input.description,
      }).catch((err) => {
        log("[background-agent] Failed to spawn tmux pane:", err)
      })
      log("[background-agent] tmux callback completed, waiting 200ms")
      await new Promise(r => setTimeout(r, 200))
    } else {
      log("[background-agent] SKIP tmux callback - conditions not met")
    }

    // Update task to running state
    task.status = "running"
    task.startedAt = new Date()
    task.sessionID = sessionID
    task.progress = {
      toolCalls: 0,
      lastUpdate: new Date(),
    }
    task.concurrencyKey = concurrencyKey
    task.concurrencyGroup = concurrencyKey

    this.startPolling()

    log("[background-agent] Launching task:", { taskId: task.id, sessionID, agent: input.agent })

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.updateTask(task.id, "running")
    }

    log("[background-agent] Calling prompt (fire-and-forget) for launch with:", {
      sessionID,
      agent: input.agent,
      model: input.model,
      hasSkillContent: !!input.skillContent,
      promptLength: input.prompt.length,
    })

    // Use prompt() instead of promptAsync() to properly initialize agent loop (fire-and-forget)
    // Include model if caller provided one (e.g., from Sisyphus category configs)
    // IMPORTANT: variant must be a top-level field in the body, NOT nested inside model
    // OpenCode's PromptInput schema expects: { model: { providerID, modelID }, variant: "max" }
    const launchModel = input.model
      ? { providerID: input.model.providerID, modelID: input.model.modelID }
      : undefined
    const launchVariant = input.model?.variant

    this.client.session.prompt({
      path: { id: sessionID },
      body: {
        agent: input.agent,
        ...(launchModel ? { model: launchModel } : {}),
        ...(launchVariant ? { variant: launchVariant } : {}),
        system: input.skillContent,
        tools: {
          ...getAgentToolRestrictions(input.agent),
          task: false,
          delegate_task: false,
          call_omo_agent: true,
          question: false,
        },
        parts: [{ type: "text", text: input.prompt }],
      },
    }).catch((error) => {
      log("[background-agent] promptAsync error:", error)
      const existingTask = this.findBySession(sessionID)
      if (existingTask) {
        existingTask.status = "error"
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
          existingTask.error = `Agent "${input.agent}" not found. Make sure the agent is registered in your opencode.json or provided by a plugin.`
        } else {
          existingTask.error = errorMessage
        }
        existingTask.completedAt = new Date()
        if (existingTask.concurrencyKey) {
          this.concurrencyManager.release(existingTask.concurrencyKey)
          existingTask.concurrencyKey = undefined
        }

        this.markForNotification(existingTask)
        this.notifyParentSession(existingTask).catch(err => {
          log("[background-agent] Failed to notify on error:", err)
        })
      }
    })
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)
  }

  getTasksByParentSession(sessionID: string): BackgroundTask[] {
    const result: BackgroundTask[] = []
    for (const task of this.tasks.values()) {
      if (task.parentSessionID === sessionID) {
        result.push(task)
      }
    }
    return result
  }

  getAllDescendantTasks(sessionID: string): BackgroundTask[] {
    const result: BackgroundTask[] = []
    const directChildren = this.getTasksByParentSession(sessionID)

    for (const child of directChildren) {
      result.push(child)
      if (child.sessionID) {
        const descendants = this.getAllDescendantTasks(child.sessionID)
        result.push(...descendants)
      }
    }

    return result
  }

  findBySession(sessionID: string): BackgroundTask | undefined {
    for (const task of this.tasks.values()) {
      if (task.sessionID === sessionID) {
        return task
      }
    }
    return undefined
  }

  private getConcurrencyKeyFromInput(input: LaunchInput): string {
    if (input.model) {
      return `${input.model.providerID}/${input.model.modelID}`
    }
    return input.agent
  }

  /**
   * 跟踪外部创建的任务
   * 
   * 用于将其他工具（如 delegate_task）创建的任务纳入管理，
   * 使其能够接收相同的通知和状态跟踪。
   * 
   * @param input 任务跟踪参数
   * @returns 跟踪的任务对象
   */
  async trackTask(input: {
    taskId: string
    sessionID: string
    parentSessionID: string
    description: string
    agent?: string
    parentAgent?: string
    concurrencyKey?: string
  }): Promise<BackgroundTask> {
    const existingTask = this.tasks.get(input.taskId)
    if (existingTask) {
      // P2 fix: Clean up old parent's pending set BEFORE changing parent
      // Otherwise cleanupPendingByParent would use the new parent ID
      const parentChanged = input.parentSessionID !== existingTask.parentSessionID
      if (parentChanged) {
        this.cleanupPendingByParent(existingTask)  // Clean from OLD parent
        existingTask.parentSessionID = input.parentSessionID
      }
      if (input.parentAgent !== undefined) {
        existingTask.parentAgent = input.parentAgent
      }
      if (!existingTask.concurrencyGroup) {
        existingTask.concurrencyGroup = input.concurrencyKey ?? existingTask.agent
      }

      if (existingTask.sessionID) {
        subagentSessions.add(existingTask.sessionID)
      }
      this.startPolling()

      // Track for batched notifications if task is pending or running
      if (existingTask.status === "pending" || existingTask.status === "running") {
        const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
        pending.add(existingTask.id)
        this.pendingByParent.set(input.parentSessionID, pending)
      } else if (!parentChanged) {
        // Only clean up if parent didn't change (already cleaned above if it did)
        this.cleanupPendingByParent(existingTask)
      }

      log("[background-agent] External task already registered:", { taskId: existingTask.id, sessionID: existingTask.sessionID, status: existingTask.status })

      return existingTask
    }

    const concurrencyGroup = input.concurrencyKey ?? input.agent ?? "delegate_task"

    // Acquire concurrency slot if a key is provided
    if (input.concurrencyKey) {
      await this.concurrencyManager.acquire(input.concurrencyKey)
    }

    const task: BackgroundTask = {
      id: input.taskId,
      sessionID: input.sessionID,
      parentSessionID: input.parentSessionID,
      parentMessageID: "",
      description: input.description,
      prompt: "",
      agent: input.agent || "delegate_task",
      status: "running",
      startedAt: new Date(),
      progress: {
        toolCalls: 0,
        lastUpdate: new Date(),
      },
      parentAgent: input.parentAgent,
      concurrencyKey: input.concurrencyKey,
      concurrencyGroup,
    }

    this.tasks.set(task.id, task)
    subagentSessions.add(input.sessionID)
    this.startPolling()

    if (input.parentSessionID) {
      const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(task.id)
      this.pendingByParent.set(input.parentSessionID, pending)
    }

    log("[background-agent] Registered external task:", { taskId: task.id, sessionID: input.sessionID })

    return task
  }

  async resume(input: ResumeInput): Promise<BackgroundTask> {
    const existingTask = this.findBySession(input.sessionId)
    if (!existingTask) {
      throw new Error(`Task not found for session: ${input.sessionId}`)
    }

    if (!existingTask.sessionID) {
      throw new Error(`Task has no sessionID: ${existingTask.id}`)
    }

    if (existingTask.status === "running") {
      log("[background-agent] Resume skipped - task already running:", {
        taskId: existingTask.id,
        sessionID: existingTask.sessionID,
      })
      return existingTask
    }

    // Re-acquire concurrency using the persisted concurrency group
    const concurrencyKey = existingTask.concurrencyGroup ?? existingTask.agent
    await this.concurrencyManager.acquire(concurrencyKey)
    existingTask.concurrencyKey = concurrencyKey
    existingTask.concurrencyGroup = concurrencyKey


    existingTask.status = "running"
    existingTask.completedAt = undefined
    existingTask.error = undefined
    existingTask.parentSessionID = input.parentSessionID
    existingTask.parentMessageID = input.parentMessageID
    existingTask.parentModel = input.parentModel
    existingTask.parentAgent = input.parentAgent
    // Reset startedAt on resume to prevent immediate completion
    // The MIN_IDLE_TIME_MS check uses startedAt, so resumed tasks need fresh timing
    existingTask.startedAt = new Date()

    existingTask.progress = {
      toolCalls: existingTask.progress?.toolCalls ?? 0,
      lastUpdate: new Date(),
    }

    this.startPolling()
    if (existingTask.sessionID) {
      subagentSessions.add(existingTask.sessionID)
    }

    if (input.parentSessionID) {
      const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(existingTask.id)
      this.pendingByParent.set(input.parentSessionID, pending)
    }

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.addTask({
        id: existingTask.id,
        description: existingTask.description,
        agent: existingTask.agent,
        isBackground: true,
      })
    }

    log("[background-agent] Resuming task:", { taskId: existingTask.id, sessionID: existingTask.sessionID })

    log("[background-agent] Resuming task - calling prompt (fire-and-forget) with:", {
      sessionID: existingTask.sessionID,
      agent: existingTask.agent,
      model: existingTask.model,
      promptLength: input.prompt.length,
    })

    // Use prompt() instead of promptAsync() to properly initialize agent loop
    // Include model if task has one (preserved from original launch with category config)
    // variant must be top-level in body, not nested inside model (OpenCode PromptInput schema)
    const resumeModel = existingTask.model
      ? { providerID: existingTask.model.providerID, modelID: existingTask.model.modelID }
      : undefined
    const resumeVariant = existingTask.model?.variant

    this.client.session.prompt({
      path: { id: existingTask.sessionID },
      body: {
        agent: existingTask.agent,
        ...(resumeModel ? { model: resumeModel } : {}),
        ...(resumeVariant ? { variant: resumeVariant } : {}),
        tools: {
          ...getAgentToolRestrictions(existingTask.agent),
          task: false,
          delegate_task: false,
          call_omo_agent: true,
          question: false,
        },
        parts: [{ type: "text", text: input.prompt }],
      },
    }).catch((error) => {
      log("[background-agent] resume prompt error:", error)
      existingTask.status = "error"
      const errorMessage = error instanceof Error ? error.message : String(error)
      existingTask.error = errorMessage
      existingTask.completedAt = new Date()

      // Release concurrency on error to prevent slot leaks
      if (existingTask.concurrencyKey) {
        this.concurrencyManager.release(existingTask.concurrencyKey)
        existingTask.concurrencyKey = undefined
      }
      this.markForNotification(existingTask)
      this.notifyParentSession(existingTask).catch(err => {
        log("[background-agent] Failed to notify on resume error:", err)
      })
    })

    return existingTask
  }

  private async checkSessionTodos(sessionID: string): Promise<boolean> {
    try {
      const response = await this.client.session.todo({
        path: { id: sessionID },
      })
      const todos = (response.data ?? response) as Todo[]
      if (!todos || todos.length === 0) return false

      const incomplete = todos.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled"
      )
      return incomplete.length > 0
    } catch {
      return false
    }
  }

  /**
   * 处理 OpenCode 事件
   * 
   * 监听三类关键事件：
   * 1. message.part.updated - 更新任务进度（工具调用计数）
   * 2. session.idle - 检测任务完成（稳定性检测的补充）
   * 3. session.deleted - 清理任务资源
   * 
   * @param event OpenCode 事件对象
   */
  handleEvent(event: Event): void {
    const props = event.properties

    if (event.type === "message.part.updated") {
      if (!props || typeof props !== "object" || !("sessionID" in props)) return
      const partInfo = props as unknown as MessagePartInfo
      const sessionID = partInfo?.sessionID
      if (!sessionID) return

      const task = this.findBySession(sessionID)
      if (!task) return

      if (partInfo?.type === "tool" || partInfo?.tool) {
        if (!task.progress) {
          task.progress = {
            toolCalls: 0,
            lastUpdate: new Date(),
          }
        }
        task.progress.toolCalls += 1
        task.progress.lastTool = partInfo.tool
        task.progress.lastUpdate = new Date()
      }
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      const task = this.findBySession(sessionID)
      if (!task || task.status !== "running") return
      
      const startedAt = task.startedAt
      if (!startedAt) return

      const elapsedMs = Date.now() - startedAt.getTime()
      const MIN_IDLE_TIME_MS = 5000
      if (elapsedMs < MIN_IDLE_TIME_MS) {
        log("[background-agent] Ignoring early session.idle, elapsed:", { elapsedMs, taskId: task.id })
        return
      }

      this.validateSessionHasOutput(sessionID).then(async (hasValidOutput) => {
        if (task.status !== "running") {
          log("[background-agent] Task status changed during validation, skipping:", { taskId: task.id, status: task.status })
          return
        }

        if (!hasValidOutput) {
          log("[background-agent] Session.idle but no valid output yet, waiting:", task.id)
          return
        }

        const hasIncompleteTodos = await this.checkSessionTodos(sessionID)

        if (task.status !== "running") {
          log("[background-agent] Task status changed during todo check, skipping:", { taskId: task.id, status: task.status })
          return
        }

        if (hasIncompleteTodos) {
          log("[background-agent] Task has incomplete todos, waiting for todo-continuation:", task.id)
          return
        }

        await this.tryCompleteTask(task, "session.idle event")
      }).catch(err => {
        log("[background-agent] Error in session.idle handler:", err)
      })
    }

    if (event.type === "session.deleted") {
      const info = props?.info
      if (!info || typeof info.id !== "string") return
      const sessionID = info.id

      const task = this.findBySession(sessionID)
      if (!task) return

      if (task.status === "running") {
        task.status = "cancelled"
        task.completedAt = new Date()
        task.error = "Session deleted"
      }

       if (task.concurrencyKey) {
         this.concurrencyManager.release(task.concurrencyKey)
         task.concurrencyKey = undefined
       }
      this.cleanupPendingByParent(task)
      this.tasks.delete(task.id)
      this.clearNotificationsForTask(task.id)
      subagentSessions.delete(sessionID)
    }
  }

  markForNotification(task: BackgroundTask): void {
    const queue = this.notifications.get(task.parentSessionID) ?? []
    queue.push(task)
    this.notifications.set(task.parentSessionID, queue)
  }

  getPendingNotifications(sessionID: string): BackgroundTask[] {
    return this.notifications.get(sessionID) ?? []
  }

  clearNotifications(sessionID: string): void {
    this.notifications.delete(sessionID)
  }

  /**
   * Validates that a session has actual assistant/tool output before marking complete.
   * Prevents premature completion when session.idle fires before agent responds.
   */
  private async validateSessionHasOutput(sessionID: string): Promise<boolean> {
    try {
      const response = await this.client.session.messages({
        path: { id: sessionID },
      })

      const messages = response.data ?? []
      
      // Check for at least one assistant or tool message
      const hasAssistantOrToolMessage = messages.some(
        (m: { info?: { role?: string } }) => 
          m.info?.role === "assistant" || m.info?.role === "tool"
      )

      if (!hasAssistantOrToolMessage) {
        log("[background-agent] No assistant/tool messages found in session:", sessionID)
        return false
      }

      // Additionally check that at least one message has content (not just empty)
      // OpenCode API uses different part types than Anthropic's API:
      // - "reasoning" with .text property (thinking/reasoning content)
      // - "tool" with .state.output property (tool call results)
      // - "text" with .text property (final text output)
      // - "step-start"/"step-finish" (metadata, no content)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasContent = messages.some((m: any) => {
        if (m.info?.role !== "assistant" && m.info?.role !== "tool") return false
        const parts = m.parts ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return parts.some((p: any) => 
        // Text content (final output)
        (p.type === "text" && p.text && p.text.trim().length > 0) ||
        // Reasoning content (thinking blocks)
        (p.type === "reasoning" && p.text && p.text.trim().length > 0) ||
        // Tool calls (indicates work was done)
        p.type === "tool" ||
        // Tool results (output from executed tools) - important for tool-only tasks
        (p.type === "tool_result" && p.content && 
          (typeof p.content === "string" ? p.content.trim().length > 0 : p.content.length > 0))
      )
      })

      if (!hasContent) {
        log("[background-agent] Messages exist but no content found in session:", sessionID)
        return false
      }

      return true
    } catch (error) {
      log("[background-agent] Error validating session output:", error)
      // On error, allow completion to proceed (don't block indefinitely)
      return true
    }
  }

  private clearNotificationsForTask(taskId: string): void {
    for (const [sessionID, tasks] of this.notifications.entries()) {
      const filtered = tasks.filter((t) => t.id !== taskId)
      if (filtered.length === 0) {
        this.notifications.delete(sessionID)
      } else {
        this.notifications.set(sessionID, filtered)
      }
    }
  }

  /**
   * Remove task from pending tracking for its parent session.
   * Cleans up the parent entry if no pending tasks remain.
   */
  private cleanupPendingByParent(task: BackgroundTask): void {
    if (!task.parentSessionID) return
    const pending = this.pendingByParent.get(task.parentSessionID)
    if (pending) {
      pending.delete(task.id)
      if (pending.size === 0) {
        this.pendingByParent.delete(task.parentSessionID)
      }
    }
  }

  /**
   * Cancels a pending task by removing it from queue and marking as cancelled.
   * Does NOT abort session (no session exists yet) or release concurrency slot (wasn't acquired).
   */
  cancelPendingTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== "pending") {
      return false
    }

    // Find and remove from queue
    const key = task.model 
      ? `${task.model.providerID}/${task.model.modelID}`
      : task.agent
    const queue = this.queuesByKey.get(key)
    if (queue) {
      const index = queue.findIndex(item => item.task.id === taskId)
      if (index !== -1) {
        queue.splice(index, 1)
        if (queue.length === 0) {
          this.queuesByKey.delete(key)
        }
      }
    }

    // Mark as cancelled
    task.status = "cancelled"
    task.completedAt = new Date()

    // Clean up pendingByParent
    this.cleanupPendingByParent(task)

    log("[background-agent] Cancelled pending task:", { taskId, key })
    return true
  }

  private startPolling(): void {
    if (this.pollingInterval) return

    this.pollingInterval = setInterval(() => {
      this.pollRunningTasks()
    }, 2000)
    this.pollingInterval.unref()
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = undefined
    }
  }

  private registerProcessCleanup(): void {
    BackgroundManager.cleanupManagers.add(this)

    if (BackgroundManager.cleanupRegistered) return
    BackgroundManager.cleanupRegistered = true

    const cleanupAll = () => {
      for (const manager of BackgroundManager.cleanupManagers) {
        try {
          manager.shutdown()
        } catch (error) {
          log("[background-agent] Error during shutdown cleanup:", error)
        }
      }
    }

    const registerSignal = (signal: ProcessCleanupEvent, exitAfter: boolean): void => {
      const listener = registerProcessSignal(signal, cleanupAll, exitAfter)
      BackgroundManager.cleanupHandlers.set(signal, listener)
    }

    registerSignal("SIGINT", true)
    registerSignal("SIGTERM", true)
    if (process.platform === "win32") {
      registerSignal("SIGBREAK", true)
    }
    registerSignal("beforeExit", false)
    registerSignal("exit", false)
  }

  private unregisterProcessCleanup(): void {
    BackgroundManager.cleanupManagers.delete(this)

    if (BackgroundManager.cleanupManagers.size > 0) return

    for (const [signal, listener] of BackgroundManager.cleanupHandlers.entries()) {
      process.off(signal, listener)
    }
    BackgroundManager.cleanupHandlers.clear()
    BackgroundManager.cleanupRegistered = false
  }


  /**
   * Get all running tasks (for compaction hook)
   */
  getRunningTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === "running")
  }

  /**
   * Get all completed tasks still in memory (for compaction hook)
   */
  getCompletedTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status !== "running")
  }

  /**
   * 安全地完成任务（带竞态条件保护）
   * 
   * 防止多个路径同时完成同一任务：
   * - session.idle 事件
   * - 轮询检测
   * - 手动取消
   * 
   * @param task 要完成的任务
   * @param source 完成来源（用于日志）
   * @returns true=成功完成，false=已被其他路径完成
   */
  private async tryCompleteTask(task: BackgroundTask, source: string): Promise<boolean> {
    // Guard: Check if task is still running (could have been completed by another path)
    if (task.status !== "running") {
      log("[background-agent] Task already completed, skipping:", { taskId: task.id, status: task.status, source })
      return false
    }

    // Atomically mark as completed to prevent race conditions
    task.status = "completed"
    task.completedAt = new Date()

    // Release concurrency BEFORE any async operations to prevent slot leaks
    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }

    this.markForNotification(task)

    try {
      await this.notifyParentSession(task)
      log(`[background-agent] Task completed via ${source}:`, task.id)
    } catch (err) {
      log("[background-agent] Error in notifyParentSession:", { taskId: task.id, error: err })
      // Concurrency already released, notification failed but task is complete
    }

    return true
  }

  private async notifyParentSession(task: BackgroundTask): Promise<void> {
    // Note: Callers must release concurrency before calling this method
    // to ensure slots are freed even if notification fails

    const duration = this.formatDuration(task.startedAt ?? new Date(), task.completedAt)

    log("[background-agent] notifyParentSession called for task:", task.id)

    // Show toast notification
    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.showCompletionToast({
        id: task.id,
        description: task.description,
        duration,
      })
    }

    // Update pending tracking and check if all tasks complete
    const pendingSet = this.pendingByParent.get(task.parentSessionID)
    if (pendingSet) {
      pendingSet.delete(task.id)
      if (pendingSet.size === 0) {
        this.pendingByParent.delete(task.parentSessionID)
      }
    }

    const allComplete = !pendingSet || pendingSet.size === 0
    const remainingCount = pendingSet?.size ?? 0

    const statusText = task.status === "completed" ? "COMPLETED" : "CANCELLED"
    const errorInfo = task.error ? `\n**Error:** ${task.error}` : ""
    
    let notification: string
    if (allComplete) {
      const completedTasks = Array.from(this.tasks.values())
        .filter(t => t.parentSessionID === task.parentSessionID && t.status !== "running" && t.status !== "pending")
        .map(t => `- \`${t.id}\`: ${t.description}`)
        .join("\n")

      notification = `<system-reminder>
[ALL BACKGROUND TASKS COMPLETE]

**Completed:**
${completedTasks || `- \`${task.id}\`: ${task.description}`}

Use \`background_output(task_id="<id>")\` to retrieve each result.
</system-reminder>`
    } else {
      // Individual completion - silent notification
      notification = `<system-reminder>
[BACKGROUND TASK ${statusText}]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Duration:** ${duration}${errorInfo}

**${remainingCount} task${remainingCount === 1 ? "" : "s"} still in progress.** You WILL be notified when ALL complete.
Do NOT poll - continue productive work.

Use \`background_output(task_id="${task.id}")\` to retrieve this result when ready.
</system-reminder>`
    }

    let agent: string | undefined = task.parentAgent
    let model: { providerID: string; modelID: string } | undefined

    try {
      const messagesResp = await this.client.session.messages({ path: { id: task.parentSessionID } })
      const messages = (messagesResp.data ?? []) as Array<{
        info?: { agent?: string; model?: { providerID: string; modelID: string }; modelID?: string; providerID?: string }
      }>
      for (let i = messages.length - 1; i >= 0; i--) {
        const info = messages[i].info
        if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
          agent = info.agent ?? task.parentAgent
          model = info.model ?? (info.providerID && info.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined)
          break
        }
      }
    } catch {
      const messageDir = getMessageDir(task.parentSessionID)
      const currentMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
      agent = currentMessage?.agent ?? task.parentAgent
      model = currentMessage?.model?.providerID && currentMessage?.model?.modelID
        ? { providerID: currentMessage.model.providerID, modelID: currentMessage.model.modelID }
        : undefined
    }

    log("[background-agent] notifyParentSession context:", {
      taskId: task.id,
      resolvedAgent: agent,
      resolvedModel: model,
    })

    try {
      await this.client.session.prompt({
        path: { id: task.parentSessionID },
        body: {
          noReply: !allComplete,
          ...(agent !== undefined ? { agent } : {}),
          ...(model !== undefined ? { model } : {}),
          parts: [{ type: "text", text: notification }],
        },
      })
      log("[background-agent] Sent notification to parent session:", {
        taskId: task.id,
        allComplete,
        noReply: !allComplete,
      })
    } catch (error) {
      log("[background-agent] Failed to send notification:", error)
    }

    const taskId = task.id
    setTimeout(() => {
      // Guard: Only delete if task still exists (could have been deleted by session.deleted event)
      if (this.tasks.has(taskId)) {
        this.clearNotificationsForTask(taskId)
        this.tasks.delete(taskId)
        log("[background-agent] Removed completed task from memory:", taskId)
      }
    }, 5 * 60 * 1000)
  }

  private formatDuration(start: Date, end?: Date): string {
    const duration = (end ?? new Date()).getTime() - start.getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  private hasRunningTasks(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === "running") return true
    }
    return false
  }

  private pruneStaleTasksAndNotifications(): void {
    const now = Date.now()

    for (const [taskId, task] of this.tasks.entries()) {
      const timestamp = task.status === "pending" 
        ? task.queuedAt?.getTime() 
        : task.startedAt?.getTime()
      
      if (!timestamp) {
        continue
      }
      
      const age = now - timestamp
      if (age > TASK_TTL_MS) {
        const errorMessage = task.status === "pending"
          ? "Task timed out while queued (30 minutes)"
          : "Task timed out after 30 minutes"
        
        log("[background-agent] Pruning stale task:", { taskId, status: task.status, age: Math.round(age / 1000) + "s" })
        task.status = "error"
        task.error = errorMessage
        task.completedAt = new Date()
        if (task.concurrencyKey) {
          this.concurrencyManager.release(task.concurrencyKey)
          task.concurrencyKey = undefined
        }
        // Clean up pendingByParent to prevent stale entries
        this.cleanupPendingByParent(task)
        this.clearNotificationsForTask(taskId)
        this.tasks.delete(taskId)
        if (task.sessionID) {
          subagentSessions.delete(task.sessionID)
        }
      }
    }

    for (const [sessionID, notifications] of this.notifications.entries()) {
      if (notifications.length === 0) {
        this.notifications.delete(sessionID)
        continue
      }
      const validNotifications = notifications.filter((task) => {
        if (!task.startedAt) return false
        const age = now - task.startedAt.getTime()
        return age <= TASK_TTL_MS
      })
      if (validNotifications.length === 0) {
        this.notifications.delete(sessionID)
      } else if (validNotifications.length !== notifications.length) {
        this.notifications.set(sessionID, validNotifications)
      }
    }
  }

  private async checkAndInterruptStaleTasks(): Promise<void> {
    const staleTimeoutMs = this.config?.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS
    const now = Date.now()

    for (const task of this.tasks.values()) {
      if (task.status !== "running") continue
      if (!task.progress?.lastUpdate) continue
      
      const startedAt = task.startedAt
      const sessionID = task.sessionID
      if (!startedAt || !sessionID) continue

      const runtime = now - startedAt.getTime()
      if (runtime < MIN_RUNTIME_BEFORE_STALE_MS) continue

      const timeSinceLastUpdate = now - task.progress.lastUpdate.getTime()
      if (timeSinceLastUpdate <= staleTimeoutMs) continue

      if (task.status !== "running") continue

      const staleMinutes = Math.round(timeSinceLastUpdate / 60000)
      task.status = "cancelled"
      task.error = `Stale timeout (no activity for ${staleMinutes}min)`
      task.completedAt = new Date()

      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }

      this.client.session.abort({
        path: { id: sessionID },
      }).catch(() => {})

      log(`[background-agent] Task ${task.id} interrupted: stale timeout`)

      try {
        await this.notifyParentSession(task)
      } catch (err) {
        log("[background-agent] Error in notifyParentSession for stale task:", { taskId: task.id, error: err })
      }
    }
  }

  private async pollRunningTasks(): Promise<void> {
    this.pruneStaleTasksAndNotifications()
    await this.checkAndInterruptStaleTasks()

    const statusResult = await this.client.session.status()
    const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>

    for (const task of this.tasks.values()) {
      if (task.status !== "running") continue
      
      const sessionID = task.sessionID
      if (!sessionID) continue

      try {
        const sessionStatus = allStatuses[sessionID]
        
        // Don't skip if session not in status - fall through to message-based detection
        if (sessionStatus?.type === "idle") {
          // Edge guard: Validate session has actual output before completing
          const hasValidOutput = await this.validateSessionHasOutput(sessionID)
          if (!hasValidOutput) {
            log("[background-agent] Polling idle but no valid output yet, waiting:", task.id)
            continue
          }

          // Re-check status after async operation
          if (task.status !== "running") continue

          const hasIncompleteTodos = await this.checkSessionTodos(sessionID)
          if (hasIncompleteTodos) {
            log("[background-agent] Task has incomplete todos via polling, waiting:", task.id)
            continue
          }

          await this.tryCompleteTask(task, "polling (idle status)")
          continue
        }

        const messagesResult = await this.client.session.messages({
          path: { id: sessionID },
        })

        if (!messagesResult.error && messagesResult.data) {
          const messages = messagesResult.data as Array<{
            info?: { role?: string }
            parts?: Array<{ type?: string; tool?: string; name?: string; text?: string }>
          }>
          const assistantMsgs = messages.filter(
            (m) => m.info?.role === "assistant"
          )

          let toolCalls = 0
          let lastTool: string | undefined
          let lastMessage: string | undefined

          for (const msg of assistantMsgs) {
            const parts = msg.parts ?? []
            for (const part of parts) {
              if (part.type === "tool_use" || part.tool) {
                toolCalls++
                lastTool = part.tool || part.name || "unknown"
              }
              if (part.type === "text" && part.text) {
                lastMessage = part.text
              }
            }
          }

          if (!task.progress) {
            task.progress = { toolCalls: 0, lastUpdate: new Date() }
          }
          task.progress.toolCalls = toolCalls
          task.progress.lastTool = lastTool
          task.progress.lastUpdate = new Date()
          if (lastMessage) {
            task.progress.lastMessage = lastMessage
            task.progress.lastMessageAt = new Date()
          }

          /**
           * 稳定性检测算法
           * 
           * 目标：判断任务是否真正完成（而非暂时空闲）
           * 
           * 算法步骤：
           * 1. 检查运行时间 >= 10秒（防止过早判定）
           * 2. 比较消息数是否变化
           * 3. 连续3次轮询无变化 → 可能完成
           * 4. 二次确认：检查会话状态是否为 idle
           * 5. 三次确认：验证会话有实际输出
           * 6. 四次确认：检查是否有未完成的 todos
           * 7. 全部通过 → 完成任务
           * 
           * 为什么需要这么多确认？
           * - 防止代理"假装工作"但实际卡住
           * - 防止过早终止还在思考的任务
           * - 确保任务真正产生了有效输出
           */
          const currentMsgCount = messages.length
          const startedAt = task.startedAt
          if (!startedAt) continue
          
          const elapsedMs = Date.now() - startedAt.getTime()

          if (elapsedMs >= MIN_STABILITY_TIME_MS) {
            if (task.lastMsgCount === currentMsgCount) {
              task.stablePolls = (task.stablePolls ?? 0) + 1
              if (task.stablePolls >= 3) {
                const recheckStatus = await this.client.session.status()
                const recheckData = (recheckStatus.data ?? {}) as Record<string, { type: string }>
                const currentStatus = recheckData[sessionID]
                
                if (currentStatus?.type !== "idle") {
                  log("[background-agent] Stability reached but session not idle, resetting:", { 
                    taskId: task.id, 
                    sessionStatus: currentStatus?.type ?? "not_in_status" 
                  })
                  task.stablePolls = 0
                  continue
                }

                const hasValidOutput = await this.validateSessionHasOutput(sessionID)
                if (!hasValidOutput) {
                  log("[background-agent] Stability reached but no valid output, waiting:", task.id)
                  continue
                }

                if (task.status !== "running") continue

                const hasIncompleteTodos = await this.checkSessionTodos(sessionID)
                if (!hasIncompleteTodos) {
                  await this.tryCompleteTask(task, "stability detection")
                  continue
                }
              }
            } else {
              task.stablePolls = 0
            }
          }
          task.lastMsgCount = currentMsgCount
        }
      } catch (error) {
        log("[background-agent] Poll error for task:", { taskId: task.id, error })
      }
    }

    if (!this.hasRunningTasks()) {
      this.stopPolling()
    }
  }

  /**
   * 优雅关闭管理器
   * 
   * 清理所有资源：
   * - 停止轮询定时器
   * - 释放所有并发槽位
   * - 取消所有等待中的任务
   * - 清空状态存储
   * 
   * 应在插件卸载时调用
   */
  shutdown(): void {
    if (this.shutdownTriggered) return
    this.shutdownTriggered = true
    log("[background-agent] Shutting down BackgroundManager")
    this.stopPolling()

    // Abort all running sessions to prevent zombie processes (#1240)
    for (const task of this.tasks.values()) {
      if (task.status === "running" && task.sessionID) {
        this.client.session.abort({
          path: { id: task.sessionID },
        }).catch(() => {})
      }
    }

    // Notify shutdown listeners (e.g., tmux cleanup)
    if (this.onShutdown) {
      try {
        this.onShutdown()
      } catch (error) {
        log("[background-agent] Error in onShutdown callback:", error)
      }
    }

    // Release concurrency for all running tasks
    for (const task of this.tasks.values()) {
      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }
    }

    // Then clear all state (cancels any remaining waiters)
    this.concurrencyManager.clear()
    this.tasks.clear()
    this.notifications.clear()
    this.pendingByParent.clear()
    this.queuesByKey.clear()
    this.processingKeys.clear()
    this.unregisterProcessCleanup()
    log("[background-agent] Shutdown complete")

  }
}

function registerProcessSignal(
  signal: ProcessCleanupEvent,
  handler: () => void,
  exitAfter: boolean
): () => void {
  const listener = () => {
    handler()
    if (exitAfter) {
      process.exit(0)
    }
  }
  process.on(signal, listener)
  return listener
}


function getMessageDir(sessionID: string): string | null {
  if (!existsSync(MESSAGE_STORAGE)) return null

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) return directPath

  for (const dir of readdirSync(MESSAGE_STORAGE)) {
    const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
    if (existsSync(sessionPath)) return sessionPath
  }
  return null
}
