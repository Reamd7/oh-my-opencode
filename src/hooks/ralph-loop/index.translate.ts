/**
 * Ralph Loop - 自引用开发循环钩子
 * 
 * ## 功能概述
 * Ralph Loop是一个自我完善的开发循环，允许AI代理持续工作直到任务完全完成。
 * 这是实现"ultrawork"模式的核心机制。
 * 
 * ## 核心概念
 * "Ralph"代表"递归自我完善循环"（Recursive Auto-improving Loop, Perpetual Helper）
 * 系统会持续迭代直到所有验证通过，确保任务真正完成而不是半途而废。
 * 
 * ## 工作流程
 * 1. 代理执行任务
 * 2. 会话进入空闲状态（session.idle事件）
 * 3. 检测完成标记（completion promise）
 * 4. 如果未完成 → 注入继续提示 → 返回步骤1
 * 5. 如果完成 → 清理状态 → 显示成功通知
 * 
 * ## 完成检测机制
 * - 在transcript文件中搜索 `<promise>DONE</promise>` 标记
 * - 通过Session Messages API检查最后一条助手消息
 * - 双重检测确保可靠性（文件优先，API作为后备）
 * 
 * ## 安全防护机制
 * - 最大迭代次数限制（默认100次）
 * - 会话恢复状态跟踪（避免在错误恢复期间触发）
 * - 孤立会话清理（删除已不存在会话的状态）
 * - 用户中断检测（MessageAbortedError）
 * 
 * ## 状态持久化
 * 状态存储在 `.sisyphus/ralph-loop.local.md` 文件中，包含：
 * - 当前迭代次数
 * - 最大迭代限制
 * - 完成标记字符串
 * - 原始任务提示
 * - 会话ID
 * - ultrawork模式标志
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { log } from "../../shared/logger"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { readState, writeState, clearState, incrementIteration } from "./storage"
import {
  HOOK_NAME,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_COMPLETION_PROMISE,
} from "./constants"
import type { RalphLoopState, RalphLoopOptions } from "./types"
import { getTranscriptPath as getDefaultTranscriptPath } from "../claude-code-hooks/transcript"
import { findNearestMessageWithFields, MESSAGE_STORAGE } from "../../features/hook-message-injector"

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

export * from "./types"
export * from "./constants"
export { readState, writeState, clearState, incrementIteration } from "./storage"

interface SessionState {
  isRecovering?: boolean
}

interface OpenCodeSessionMessage {
  info?: {
    role?: string
  }
  parts?: Array<{
    type: string
    text?: string
    [key: string]: unknown
  }>
}

const CONTINUATION_PROMPT = `${SYSTEM_DIRECTIVE_PREFIX} - RALPH LOOP {{ITERATION}}/{{MAX}}]

你之前的尝试没有输出完成标记。请继续完成任务。

重要提示：
- 回顾你目前的进度
- 从上次停止的地方继续
- 当完全完成时，输出：<promise>{{PROMISE}}</promise>
- 在任务真正完成之前不要停止

原始任务：
{{PROMPT}}`

export interface RalphLoopHook {
  event: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
  startLoop: (
    sessionID: string,
    prompt: string,
    options?: { maxIterations?: number; completionPromise?: string; ultrawork?: boolean }
  ) => boolean
  cancelLoop: (sessionID: string) => boolean
  getState: () => RalphLoopState | null
}

const DEFAULT_API_TIMEOUT = 3000

export function createRalphLoopHook(
  ctx: PluginInput,
  options?: RalphLoopOptions
): RalphLoopHook {
  const sessions = new Map<string, SessionState>()
  const config = options?.config
  const stateDir = config?.state_dir
  const getTranscriptPath = options?.getTranscriptPath ?? getDefaultTranscriptPath
  const apiTimeout = options?.apiTimeout ?? DEFAULT_API_TIMEOUT
  const checkSessionExists = options?.checkSessionExists

  function getSessionState(sessionID: string): SessionState {
    let state = sessions.get(sessionID)
    if (!state) {
      state = {}
      sessions.set(sessionID, state)
    }
    return state
  }

  function detectCompletionPromise(
    transcriptPath: string | undefined,
    promise: string
  ): boolean {
    if (!transcriptPath) return false

    try {
      if (!existsSync(transcriptPath)) return false

      const content = readFileSync(transcriptPath, "utf-8")
      // 构建正则：匹配 <promise>DONE</promise>（允许空白）
      const pattern = new RegExp(`<promise>\\s*${escapeRegex(promise)}\\s*</promise>`, "is")
      const lines = content.split("\n").filter(l => l.trim())

      // 逐行解析JSONL格式的transcript，跳过用户消息
      for (const line of lines) {
        try {
          const entry = JSON.parse(line)
          if (entry.type === "user") continue
          if (pattern.test(line)) return true
        } catch {
          continue
        }
      }
      return false
    } catch {
      return false
    }
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  async function detectCompletionInSessionMessages(
    sessionID: string,
    promise: string
  ): Promise<boolean> {
    try {
      const response = await Promise.race([
        ctx.client.session.messages({
          path: { id: sessionID },
          query: { directory: ctx.directory },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("API timeout")), apiTimeout)
        ),
      ])

      const messages = (response as { data?: unknown[] }).data ?? []
      if (!Array.isArray(messages)) return false

      const assistantMessages = (messages as OpenCodeSessionMessage[]).filter(
        (msg) => msg.info?.role === "assistant"
      )
      const lastAssistant = assistantMessages[assistantMessages.length - 1]
      if (!lastAssistant?.parts) return false

      const pattern = new RegExp(`<promise>\\s*${escapeRegex(promise)}\\s*</promise>`, "is")
      const responseText = lastAssistant.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("\n")

      return pattern.test(responseText)
    } catch (err) {
      log(`[${HOOK_NAME}] Session messages check failed`, { sessionID, error: String(err) })
      return false
    }
  }

  const startLoop = (
    sessionID: string,
    prompt: string,
    loopOptions?: { maxIterations?: number; completionPromise?: string; ultrawork?: boolean }
  ): boolean => {
    const state: RalphLoopState = {
      active: true,
      iteration: 1,
      max_iterations:
        loopOptions?.maxIterations ?? config?.default_max_iterations ?? DEFAULT_MAX_ITERATIONS,
      completion_promise: loopOptions?.completionPromise ?? DEFAULT_COMPLETION_PROMISE,
      ultrawork: loopOptions?.ultrawork,
      started_at: new Date().toISOString(),
      prompt,
      session_id: sessionID,
    }

    const success = writeState(ctx.directory, state, stateDir)
    if (success) {
      log(`[${HOOK_NAME}] Loop started`, {
        sessionID,
        maxIterations: state.max_iterations,
        completionPromise: state.completion_promise,
      })
    }
    return success
  }

  const cancelLoop = (sessionID: string): boolean => {
    const state = readState(ctx.directory, stateDir)
    if (!state || state.session_id !== sessionID) {
      return false
    }

    const success = clearState(ctx.directory, stateDir)
    if (success) {
      log(`[${HOOK_NAME}] Loop cancelled`, { sessionID, iteration: state.iteration })
    }
    return success
  }

  const getState = (): RalphLoopState | null => {
    return readState(ctx.directory, stateDir)
  }

  const event = async ({
    event,
  }: {
    event: { type: string; properties?: unknown }
  }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined

    // 核心循环逻辑：会话空闲时检查完成状态并决定是否继续
    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      // 防护：跳过正在错误恢复中的会话
      const sessionState = getSessionState(sessionID)
      if (sessionState.isRecovering) {
        log(`[${HOOK_NAME}] Skipped: in recovery`, { sessionID })
        return
      }

      const state = readState(ctx.directory, stateDir)
      if (!state || !state.active) {
        return
      }

      // 防护：清理孤立会话状态（原会话已被删除）
      if (state.session_id && state.session_id !== sessionID) {
        if (checkSessionExists) {
          try {
            const originalSessionExists = await checkSessionExists(state.session_id)
            if (!originalSessionExists) {
              clearState(ctx.directory, stateDir)
              log(`[${HOOK_NAME}] Cleared orphaned state from deleted session`, {
                orphanedSessionId: state.session_id,
                currentSessionId: sessionID,
              })
              return
            }
          } catch (err) {
            log(`[${HOOK_NAME}] Failed to check session existence`, {
              sessionId: state.session_id,
              error: String(err),
            })
          }
        }
        return
      }

      // 完成检测：双重检查机制（文件优先，API后备）
      const transcriptPath = getTranscriptPath(sessionID)
      const completionDetectedViaTranscript = detectCompletionPromise(transcriptPath, state.completion_promise)

      const completionDetectedViaApi = completionDetectedViaTranscript
        ? false
        : await detectCompletionInSessionMessages(sessionID, state.completion_promise)

      // 退出条件1：检测到完成标记
      if (completionDetectedViaTranscript || completionDetectedViaApi) {
        log(`[${HOOK_NAME}] Completion detected!`, {
          sessionID,
          iteration: state.iteration,
          promise: state.completion_promise,
          detectedVia: completionDetectedViaTranscript ? "transcript_file" : "session_messages_api",
        })
        clearState(ctx.directory, stateDir)

        const title = state.ultrawork
          ? "ULTRAWORK 循环完成！"
          : "Ralph Loop 完成！"
        const message = state.ultrawork
          ? `就是 ULW ULW！任务在 ${state.iteration} 次迭代后完成`
          : `任务在 ${state.iteration} 次迭代后完成`

        await ctx.client.tui
          .showToast({
            body: {
              title,
              message,
              variant: "success",
              duration: 5000,
            },
          })
          .catch(() => {})

        return
      }

      // 退出条件2：达到最大迭代次数
      if (state.iteration >= state.max_iterations) {
        log(`[${HOOK_NAME}] Max iterations reached`, {
          sessionID,
          iteration: state.iteration,
          max: state.max_iterations,
        })
        clearState(ctx.directory, stateDir)

        await ctx.client.tui
          .showToast({
            body: {
              title: "Ralph Loop 已停止",
              message: `达到最大迭代次数 (${state.max_iterations}) 但未完成`,
              variant: "warning",
              duration: 5000,
            },
          })
          .catch(() => {})

        return
      }

      // 继续循环：递增迭代计数并注入继续提示
      const newState = incrementIteration(ctx.directory, stateDir)
      if (!newState) {
        log(`[${HOOK_NAME}] Failed to increment iteration`, { sessionID })
        return
      }

      log(`[${HOOK_NAME}] Continuing loop`, {
        sessionID,
        iteration: newState.iteration,
        max: newState.max_iterations,
      })

      const continuationPrompt = CONTINUATION_PROMPT.replace("{{ITERATION}}", String(newState.iteration))
        .replace("{{MAX}}", String(newState.max_iterations))
        .replace("{{PROMISE}}", newState.completion_promise)
        .replace("{{PROMPT}}", newState.prompt)

      const finalPrompt = newState.ultrawork
        ? `ultrawork ${continuationPrompt}`
        : continuationPrompt

      await ctx.client.tui
        .showToast({
          body: {
            title: "Ralph Loop",
            message: `迭代 ${newState.iteration}/${newState.max_iterations}`,
            variant: "info",
            duration: 2000,
          },
        })
        .catch(() => {})

      try {
        // 保持代理和模型一致性：从历史消息中提取
        let agent: string | undefined
        let model: { providerID: string; modelID: string } | undefined

        try {
          const messagesResp = await ctx.client.session.messages({ path: { id: sessionID } })
          const messages = (messagesResp.data ?? []) as Array<{
            info?: { agent?: string; model?: { providerID: string; modelID: string }; modelID?: string; providerID?: string }
          }>
          for (let i = messages.length - 1; i >= 0; i--) {
            const info = messages[i].info
            if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
              agent = info.agent
              model = info.model ?? (info.providerID && info.modelID ? { providerID: info.providerID, modelID: info.modelID } : undefined)
              break
            }
          }
        } catch {
          const messageDir = getMessageDir(sessionID)
          const currentMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
          agent = currentMessage?.agent
          model = currentMessage?.model?.providerID && currentMessage?.model?.modelID
            ? { providerID: currentMessage.model.providerID, modelID: currentMessage.model.modelID }
            : undefined
        }

        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            ...(agent !== undefined ? { agent } : {}),
            ...(model !== undefined ? { model } : {}),
            parts: [{ type: "text", text: finalPrompt }],
          },
          query: { directory: ctx.directory },
        })
      } catch (err) {
        log(`[${HOOK_NAME}] Failed to inject continuation`, {
          sessionID,
          error: String(err),
        })
      }
    }

    // 清理：会话删除时清除对应状态
    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined
      if (sessionInfo?.id) {
        const state = readState(ctx.directory, stateDir)
        if (state?.session_id === sessionInfo.id) {
          clearState(ctx.directory, stateDir)
          log(`[${HOOK_NAME}] Session deleted, loop cleared`, { sessionID: sessionInfo.id })
        }
        sessions.delete(sessionInfo.id)
      }
    }

    // 错误处理：用户中断时清除状态，其他错误标记为恢复中
    if (event.type === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      const error = props?.error as { name?: string } | undefined

      if (error?.name === "MessageAbortedError") {
        if (sessionID) {
          const state = readState(ctx.directory, stateDir)
          if (state?.session_id === sessionID) {
            clearState(ctx.directory, stateDir)
            log(`[${HOOK_NAME}] User aborted, loop cleared`, { sessionID })
          }
          sessions.delete(sessionID)
        }
        return
      }

      if (sessionID) {
        const sessionState = getSessionState(sessionID)
        sessionState.isRecovering = true
        setTimeout(() => {
          sessionState.isRecovering = false
        }, 5000)
      }
    }
  }

  return {
    event,
    startLoop,
    cancelLoop,
    getState,
  }
}
