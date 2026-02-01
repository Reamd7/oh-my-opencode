/**
 * Todo延续强制器钩子
 * 
 * 功能：
 * - 强制代理完成所有待办任务
 * - 检测代理中途停止的情况
 * - 自动发送延续提示词
 * - 西西弗斯之石（Sisyphus Boulder）机制
 * 
 * 工作原理：
 * 1. 监听会话停止事件
 * 2. 检查是否有未完成的待办列表
 * 3. 如果有未完成任务且代理被中止，启动倒计时
 * 4. 倒计时结束后自动发送延续提示词
 * 5. 代理继续工作直到所有任务完成
 * 
 * 西西弗斯之石：
 * 就像西西弗斯必须不断推石头上山，代理必须完成所有任务。
 * 如果代理中途停止，系统会强制其继续，直到任务完成。
 */
import type { PluginInput } from "@opencode-ai/plugin"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { BackgroundManager } from "../features/background-agent"
import { getMainSessionID, subagentSessions } from "../features/claude-code-session-state"
import {
    findNearestMessageWithFields,
    MESSAGE_STORAGE,
    type ToolPermission,
} from "../features/hook-message-injector"
import { log } from "../shared/logger"
import { createSystemDirective, SystemDirectiveTypes } from "../shared/system-directive"

const HOOK_NAME = "todo-continuation-enforcer"

// 默认跳过的代理（不强制延续）
const DEFAULT_SKIP_AGENTS = ["prometheus", "compaction"]

export interface TodoContinuationEnforcerOptions {
  backgroundManager?: BackgroundManager
  skipAgents?: string[]
}

export interface TodoContinuationEnforcer {
  handler: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
  markRecovering: (sessionID: string) => void
  markRecoveryComplete: (sessionID: string) => void
}

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>
  countdownInterval?: ReturnType<typeof setInterval>
  isRecovering?: boolean
  countdownStartedAt?: number
  abortDetectedAt?: number
}

// 延续提示词消息
const CONTINUATION_PROMPT = `${createSystemDirective(SystemDirectiveTypes.TODO_CONTINUATION)}

你的待办列表中仍有未完成的任务。请继续处理下一个待处理任务。

- 无需请求许可，直接继续
- 完成每个任务后标记为已完成
- 不要停止，直到所有任务完成`

// 倒计时秒数
const COUNTDOWN_SECONDS = 2
// Toast显示时长
const TOAST_DURATION_MS = 900
// 倒计时宽限期（避免误触发）
const COUNTDOWN_GRACE_PERIOD_MS = 500

/**
 * 获取消息存储目录
 */
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

/**
 * 获取未完成任务数量
 */
function getIncompleteCount(todos: Todo[]): number {
  return todos.filter(t => t.status !== "completed" && t.status !== "cancelled").length
}

interface MessageInfo {
  id?: string
  role?: string
  error?: { name?: string; data?: unknown }
}

/**
 * 判断最后一条助手消息是否被中止
 * 
 * 检测MessageAbortedError或AbortError
 */
function isLastAssistantMessageAborted(messages: Array<{ info?: MessageInfo }>): boolean {
  if (!messages || messages.length === 0) return false

  const assistantMessages = messages.filter(m => m.info?.role === "assistant")
  if (assistantMessages.length === 0) return false

  const lastAssistant = assistantMessages[assistantMessages.length - 1]
  const errorName = lastAssistant.info?.error?.name

  if (!errorName) return false

  return errorName === "MessageAbortedError" || errorName === "AbortError"
}

/**
 * 创建Todo延续强制器
 * 
 * @param ctx - 插件上下文
 * @param options - 配置选项
 * @param options.backgroundManager - 后台任务管理器
 * @param options.skipAgents - 跳过的代理列表
 */
export function createTodoContinuationEnforcer(
  ctx: PluginInput,
  options: TodoContinuationEnforcerOptions = {}
): TodoContinuationEnforcer {
  const { backgroundManager, skipAgents = DEFAULT_SKIP_AGENTS } = options
  const sessions = new Map<string, SessionState>()

  function getState(sessionID: string): SessionState {
    let state = sessions.get(sessionID)
    if (!state) {
      state = {}
      sessions.set(sessionID, state)
    }
    return state
  }

  function cancelCountdown(sessionID: string): void {
    const state = sessions.get(sessionID)
    if (!state) return

    if (state.countdownTimer) {
      clearTimeout(state.countdownTimer)
      state.countdownTimer = undefined
    }
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval)
      state.countdownInterval = undefined
    }
    state.countdownStartedAt = undefined
  }

  function cleanup(sessionID: string): void {
    cancelCountdown(sessionID)
    sessions.delete(sessionID)
  }

  const markRecovering = (sessionID: string): void => {
    const state = getState(sessionID)
    state.isRecovering = true
    cancelCountdown(sessionID)
    log(`[${HOOK_NAME}] 会话标记为恢复中`, { sessionID })
  }

  const markRecoveryComplete = (sessionID: string): void => {
    const state = sessions.get(sessionID)
    if (state) {
      state.isRecovering = false
      log(`[${HOOK_NAME}] 会话恢复完成`, { sessionID })
    }
  }

  async function showCountdownToast(seconds: number, incompleteCount: number): Promise<void> {
    await ctx.client.tui.showToast({
      body: {
        title: "Todo延续",
        message: `将在 ${seconds} 秒后恢复...（剩余 ${incompleteCount} 个任务）`,
        variant: "warning" as const,
        duration: TOAST_DURATION_MS,
      },
    }).catch(() => {})
  }

  interface ResolvedMessageInfo {
    agent?: string
    model?: { providerID: string; modelID: string }
    tools?: Record<string, ToolPermission>
  }

  async function injectContinuation(
    sessionID: string,
    incompleteCount: number,
    total: number,
    resolvedInfo?: ResolvedMessageInfo
  ): Promise<void> {
    const state = sessions.get(sessionID)

    if (state?.isRecovering) {
      log(`[${HOOK_NAME}] 跳过注入：正在恢复中`, { sessionID })
      return
    }

    const hasRunningBgTasks = backgroundManager
      ? backgroundManager.getTasksByParentSession(sessionID).some(t => t.status === "running")
      : false

    if (hasRunningBgTasks) {
      log(`[${HOOK_NAME}] 跳过注入：后台任务正在运行`, { sessionID })
      return
    }

    let todos: Todo[] = []
    try {
      const response = await ctx.client.session.todo({ path: { id: sessionID } })
      todos = (response.data ?? response) as Todo[]
    } catch (err) {
      log(`[${HOOK_NAME}] 获取待办列表失败`, { sessionID, error: String(err) })
      return
    }

    const freshIncompleteCount = getIncompleteCount(todos)
    if (freshIncompleteCount === 0) {
      log(`[${HOOK_NAME}] 跳过注入：没有未完成的待办任务`, { sessionID })
      return
    }

    let agentName = resolvedInfo?.agent
    let model = resolvedInfo?.model
    let tools = resolvedInfo?.tools

    if (!agentName || !model) {
      const messageDir = getMessageDir(sessionID)
      const prevMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
      agentName = agentName ?? prevMessage?.agent
      model = model ?? (prevMessage?.model?.providerID && prevMessage?.model?.modelID
        ? { 
            providerID: prevMessage.model.providerID, 
            modelID: prevMessage.model.modelID,
            ...(prevMessage.model.variant ? { variant: prevMessage.model.variant } : {})
          }
        : undefined)
      tools = tools ?? prevMessage?.tools
    }

    if (agentName && skipAgents.includes(agentName)) {
      log(`[${HOOK_NAME}] 跳过：代理在跳过列表中`, { sessionID, agent: agentName })
      return
    }

    const editPermission = tools?.edit
    const writePermission = tools?.write
    const hasWritePermission = !tools ||
      ((editPermission !== false && editPermission !== "deny") &&
       (writePermission !== false && writePermission !== "deny"))
    if (!hasWritePermission) {
      log(`[${HOOK_NAME}] 跳过：代理缺少写入权限`, { sessionID, agent: agentName })
      return
    }

    const prompt = `${CONTINUATION_PROMPT}\n\n[状态：${todos.length - freshIncompleteCount}/${todos.length} 已完成，剩余 ${freshIncompleteCount} 个]`

    try {
      log(`[${HOOK_NAME}] 注入延续提示词`, { sessionID, agent: agentName, model, incompleteCount: freshIncompleteCount })

      await ctx.client.session.prompt({
        path: { id: sessionID },
        body: {
          agent: agentName,
          ...(model !== undefined ? { model } : {}),
          parts: [{ type: "text", text: prompt }],
        },
        query: { directory: ctx.directory },
      })

      log(`[${HOOK_NAME}] 注入成功`, { sessionID })
    } catch (err) {
      log(`[${HOOK_NAME}] 注入失败`, { sessionID, error: String(err) })
    }
  }

  function startCountdown(
    sessionID: string,
    incompleteCount: number,
    total: number,
    resolvedInfo?: ResolvedMessageInfo
  ): void {
    const state = getState(sessionID)
    cancelCountdown(sessionID)

    let secondsRemaining = COUNTDOWN_SECONDS
    showCountdownToast(secondsRemaining, incompleteCount)
    state.countdownStartedAt = Date.now()

    state.countdownInterval = setInterval(() => {
      secondsRemaining--
      if (secondsRemaining > 0) {
        showCountdownToast(secondsRemaining, incompleteCount)
      }
    }, 1000)

    state.countdownTimer = setTimeout(() => {
      cancelCountdown(sessionID)
      injectContinuation(sessionID, incompleteCount, total, resolvedInfo)
    }, COUNTDOWN_SECONDS * 1000)

    log(`[${HOOK_NAME}] 倒计时已启动`, { sessionID, seconds: COUNTDOWN_SECONDS, incompleteCount })
  }

  const handler = async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      const error = props?.error as { name?: string } | undefined
      if (error?.name === "MessageAbortedError" || error?.name === "AbortError") {
        const state = getState(sessionID)
        state.abortDetectedAt = Date.now()
        log(`[${HOOK_NAME}] 通过session.error检测到中止`, { sessionID, errorName: error.name })
      }

      cancelCountdown(sessionID)
      log(`[${HOOK_NAME}] session.error`, { sessionID })
      return
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      log(`[${HOOK_NAME}] session.idle`, { sessionID })

      const mainSessionID = getMainSessionID()
      const isMainSession = sessionID === mainSessionID
      const isBackgroundTaskSession = subagentSessions.has(sessionID)

      if (mainSessionID && !isMainSession && !isBackgroundTaskSession) {
        log(`[${HOOK_NAME}] 跳过：不是主会话或后台任务会话`, { sessionID })
        return
      }

      const state = getState(sessionID)

      if (state.isRecovering) {
        log(`[${HOOK_NAME}] 跳过：正在恢复中`, { sessionID })
        return
      }

      // 检查1：基于事件的中止检测（主要，最可靠）
      if (state.abortDetectedAt) {
        const timeSinceAbort = Date.now() - state.abortDetectedAt
        const ABORT_WINDOW_MS = 3000
        if (timeSinceAbort < ABORT_WINDOW_MS) {
          log(`[${HOOK_NAME}] 跳过：通过事件检测到中止 ${timeSinceAbort}ms 前`, { sessionID })
          state.abortDetectedAt = undefined
          return
        }
        state.abortDetectedAt = undefined
      }

      const hasRunningBgTasks = backgroundManager
        ? backgroundManager.getTasksByParentSession(sessionID).some(t => t.status === "running")
        : false

      if (hasRunningBgTasks) {
        log(`[${HOOK_NAME}] 跳过：后台任务正在运行`, { sessionID })
        return
      }

      // 检查2：基于API的中止检测（后备，用于事件丢失的情况）
      try {
        const messagesResp = await ctx.client.session.messages({
          path: { id: sessionID },
          query: { directory: ctx.directory },
        })
        const messages = (messagesResp as { data?: Array<{ info?: MessageInfo }> }).data ?? []

        if (isLastAssistantMessageAborted(messages)) {
          log(`[${HOOK_NAME}] 跳过：最后一条助手消息被中止（API后备）`, { sessionID })
          return
        }
      } catch (err) {
        log(`[${HOOK_NAME}] 获取消息失败，继续执行`, { sessionID, error: String(err) })
      }

      let todos: Todo[] = []
      try {
        const response = await ctx.client.session.todo({ path: { id: sessionID } })
        todos = (response.data ?? response) as Todo[]
      } catch (err) {
        log(`[${HOOK_NAME}] 获取待办列表失败`, { sessionID, error: String(err) })
        return
      }

      if (!todos || todos.length === 0) {
        log(`[${HOOK_NAME}] 没有待办任务`, { sessionID })
        return
      }

      const incompleteCount = getIncompleteCount(todos)
      if (incompleteCount === 0) {
        log(`[${HOOK_NAME}] 所有待办任务已完成`, { sessionID, total: todos.length })
        return
      }

      let resolvedInfo: ResolvedMessageInfo | undefined
      let hasCompactionMessage = false
      try {
        const messagesResp = await ctx.client.session.messages({
          path: { id: sessionID },
        })
        const messages = (messagesResp.data ?? []) as Array<{
          info?: {
            agent?: string
            model?: { providerID: string; modelID: string }
            modelID?: string
            providerID?: string
            tools?: Record<string, ToolPermission>
          }
        }>
        for (let i = messages.length - 1; i >= 0; i--) {
          const info = messages[i].info
          if (info?.agent === "compaction") {
            hasCompactionMessage = true
            continue
          }
          if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
            resolvedInfo = {
              agent: info.agent,
              model: info.model ?? (info.providerID && info.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined),
              tools: info.tools,
            }
            break
          }
        }
      } catch (err) {
        log(`[${HOOK_NAME}] 获取消息进行代理检查失败`, { sessionID, error: String(err) })
      }

      log(`[${HOOK_NAME}] 代理检查`, { sessionID, agentName: resolvedInfo?.agent, skipAgents, hasCompactionMessage })
      if (resolvedInfo?.agent && skipAgents.includes(resolvedInfo.agent)) {
        log(`[${HOOK_NAME}] 跳过：代理在跳过列表中`, { sessionID, agent: resolvedInfo.agent })
        return
      }
      if (hasCompactionMessage && !resolvedInfo?.agent) {
        log(`[${HOOK_NAME}] 跳过：发生了压缩但未解析到代理信息`, { sessionID })
        return
      }

      startCountdown(sessionID, incompleteCount, todos.length, resolvedInfo)
      return
    }

    if (event.type === "message.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      const role = info?.role as string | undefined

      if (!sessionID) return

      if (role === "user") {
        const state = sessions.get(sessionID)
        if (state?.countdownStartedAt) {
          const elapsed = Date.now() - state.countdownStartedAt
          if (elapsed < COUNTDOWN_GRACE_PERIOD_MS) {
            log(`[${HOOK_NAME}] 忽略宽限期内的用户消息`, { sessionID, elapsed })
            return
          }
        }
        if (state) state.abortDetectedAt = undefined
        cancelCountdown(sessionID)
      }

      if (role === "assistant") {
        const state = sessions.get(sessionID)
        if (state) state.abortDetectedAt = undefined
        cancelCountdown(sessionID)
      }
      return
    }

    if (event.type === "message.part.updated") {
      const info = props?.info as Record<string, unknown> | undefined
      const sessionID = info?.sessionID as string | undefined
      const role = info?.role as string | undefined

      if (sessionID && role === "assistant") {
        const state = sessions.get(sessionID)
        if (state) state.abortDetectedAt = undefined
        cancelCountdown(sessionID)
      }
      return
    }

    if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        const state = sessions.get(sessionID)
        if (state) state.abortDetectedAt = undefined
        cancelCountdown(sessionID)
      }
      return
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        cleanup(sessionInfo.id)
        log(`[${HOOK_NAME}] 会话已删除：已清理`, { sessionID: sessionInfo.id })
      }
      return
    }
  }

  return {
    handler,
    markRecovering,
    markRecoveryComplete,
  }
}
