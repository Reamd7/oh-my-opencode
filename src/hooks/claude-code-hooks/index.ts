/**
 * Claude Code 钩子兼容层 (Claude Code Hooks Compatibility Layer)
 * 
 * 功能：完整兼容 Claude Code 的 settings.json 钩子系统
 * 目的：让用户可以在 OpenCode 中使用 Claude Code 的钩子配置，无缝迁移
 * 
 * 支持的钩子类型：
 * 1. PreToolUse：工具执行前钩子，可阻止或修改工具调用
 * 2. PostToolUse：工具执行后钩子，可追加警告或修改输出
 * 3. UserPromptSubmit：用户消息提交前钩子，可阻止或修改消息
 * 4. Stop：会话结束钩子，可自动继续或注入新提示
 * 5. PreCompact：会话压缩前钩子，可注入上下文到摘要中
 * 
 * 工作原理：
 * 1. 从 ~/.claude/settings.json 或 .claude/settings.json 加载钩子配置
 * 2. 监听 OpenCode 的生命周期事件（tool.execute.before/after、chat.message、event）
 * 3. 将事件转换为 Claude Code 钩子上下文
 * 4. 执行外部脚本/命令（通过子进程）
 * 5. 根据退出码决定行为：0=通过，1=警告，2=阻止
 * 6. 将钩子输出注入到代理上下文或工具输出中
 * 
 * 钩子配置示例：
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       {
 *         "match": { "tool": "write" },
 *         "command": "node scripts/check-write.js"
 *       }
 *     ],
 *     "PostToolUse": [
 *       {
 *         "match": { "tool": "bash" },
 *         "command": "node scripts/log-bash.js"
 *       }
 *     ]
 *   }
 * }
 * 
 * 特殊处理：
 * - todowrite 工具：自动解析 JSON 字符串参数为数组
 * - 会话状态跟踪：记录错误和中断状态，影响 Stop 钩子行为
 * - 转录记录：记录所有工具调用和结果到 transcript.jsonl
 * - 上下文收集器集成：将钩子输出注册到合成消息系统
 */
import type { PluginInput } from "@opencode-ai/plugin"
import { loadClaudeHooksConfig } from "./config"
import { loadPluginExtendedConfig } from "./config-loader"
import {
  executePreToolUseHooks,
  type PreToolUseContext,
} from "./pre-tool-use"
import {
  executePostToolUseHooks,
  type PostToolUseContext,
  type PostToolUseClient,
} from "./post-tool-use"
import {
  executeUserPromptSubmitHooks,
  type UserPromptSubmitContext,
  type MessagePart,
} from "./user-prompt-submit"
import {
  executeStopHooks,
  type StopContext,
} from "./stop"
import {
  executePreCompactHooks,
  type PreCompactContext,
} from "./pre-compact"
import { cacheToolInput, getToolInput } from "./tool-input-cache"
import { recordToolUse, recordToolResult, getTranscriptPath, recordUserMessage } from "./transcript"
import type { PluginConfig } from "./types"
import { log, isHookDisabled } from "../../shared"
import type { ContextCollector } from "../../features/context-injector"

// 会话状态跟踪：记录首次消息处理、错误状态、中断状态
const sessionFirstMessageProcessed = new Set<string>()
const sessionErrorState = new Map<string, { hasError: boolean; errorMessage?: string }>()
const sessionInterruptState = new Map<string, { interrupted: boolean }>()

/**
 * 创建 Claude Code 钩子兼容层
 * 
 * @param ctx - 插件上下文，提供 client API 和目录信息
 * @param config - 插件配置，用于禁用特定钩子
 * @param contextCollector - 上下文收集器，用于注册钩子输出到合成消息
 * @returns 钩子对象，包含所有生命周期事件处理器
 */
export function createClaudeCodeHooksHook(
  ctx: PluginInput,
  config: PluginConfig = {},
  contextCollector?: ContextCollector
) {
  return {
    /**
     * experimental.session.compacting 钩子：会话压缩前执行
     * 
     * 用途：在会话压缩（摘要生成）前注入额外上下文
     * 典型场景：保留重要状态、注入项目信息到摘要中
     */
    "experimental.session.compacting": async (
      input: { sessionID: string },
      output: { context: string[] }
    ): Promise<void> => {
      if (isHookDisabled(config, "PreCompact")) {
        return
      }

      const claudeConfig = await loadClaudeHooksConfig()
      const extendedConfig = await loadPluginExtendedConfig()

      const preCompactCtx: PreCompactContext = {
        sessionId: input.sessionID,
        cwd: ctx.directory,
      }

      const result = await executePreCompactHooks(preCompactCtx, claudeConfig, extendedConfig)

      if (result.context.length > 0) {
        log("PreCompact hooks injecting context", {
          sessionID: input.sessionID,
          contextCount: result.context.length,
          hookName: result.hookName,
          elapsedMs: result.elapsedMs,
        })
        output.context.push(...result.context)
      }
    },

    /**
     * chat.message 钩子：用户消息提交前执行
     * 
     * 用途：
     * 1. 执行 UserPromptSubmit 钩子（可阻止或修改消息）
     * 2. 记录用户消息到 transcript
     * 3. 将钩子输出注册到上下文收集器（用于合成消息注入）
     * 
     * 特殊处理：
     * - 跳过中断的会话
     * - 跟踪首次消息处理状态
     * - 获取父会话 ID（用于子会话上下文）
     */
    "chat.message": async (
      input: {
        sessionID: string
        agent?: string
        model?: { providerID: string; modelID: string }
        messageID?: string
      },
      output: {
        message: Record<string, unknown>
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
      }
    ): Promise<void> => {
      const interruptState = sessionInterruptState.get(input.sessionID)
      if (interruptState?.interrupted) {
        log("chat.message hook skipped - session interrupted", { sessionID: input.sessionID })
        return
      }

      const claudeConfig = await loadClaudeHooksConfig()
      const extendedConfig = await loadPluginExtendedConfig()

      const textParts = output.parts.filter((p) => p.type === "text" && p.text)
      const prompt = textParts.map((p) => p.text ?? "").join("\n")

      recordUserMessage(input.sessionID, prompt)

      const messageParts: MessagePart[] = textParts.map((p) => ({
        type: p.type as "text",
        text: p.text,
      }))

      const interruptStateBeforeHooks = sessionInterruptState.get(input.sessionID)
      if (interruptStateBeforeHooks?.interrupted) {
        log("chat.message hooks skipped - interrupted during preparation", { sessionID: input.sessionID })
        return
      }

      let parentSessionId: string | undefined
      try {
        const sessionInfo = await ctx.client.session.get({
          path: { id: input.sessionID },
        })
        parentSessionId = sessionInfo.data?.parentID
      } catch {}

      const isFirstMessage = !sessionFirstMessageProcessed.has(input.sessionID)
      sessionFirstMessageProcessed.add(input.sessionID)

      if (!isHookDisabled(config, "UserPromptSubmit")) {
        const userPromptCtx: UserPromptSubmitContext = {
          sessionId: input.sessionID,
          parentSessionId,
          prompt,
          parts: messageParts,
          cwd: ctx.directory,
        }

        const result = await executeUserPromptSubmitHooks(
          userPromptCtx,
          claudeConfig,
          extendedConfig
        )

        if (result.block) {
          throw new Error(result.reason ?? "Hook blocked the prompt")
        }

        const interruptStateAfterHooks = sessionInterruptState.get(input.sessionID)
        if (interruptStateAfterHooks?.interrupted) {
          log("chat.message injection skipped - interrupted during hooks", { sessionID: input.sessionID })
          return
        }

        if (result.messages.length > 0) {
          const hookContent = result.messages.join("\n\n")
          log(`[claude-code-hooks] Injecting ${result.messages.length} hook messages`, { sessionID: input.sessionID, contentLength: hookContent.length, isFirstMessage })

          if (contextCollector) {
            log("[DEBUG] Registering hook content to contextCollector", {
              sessionID: input.sessionID,
              contentLength: hookContent.length,
              contentPreview: hookContent.slice(0, 100),
            })
            contextCollector.register(input.sessionID, {
              id: "hook-context",
              source: "custom",
              content: hookContent,
              priority: "high",
            })

            log("Hook content registered for synthetic message injection", {
              sessionID: input.sessionID,
              contentLength: hookContent.length,
            })
          }
        }
      }
    },

    /**
     * tool.execute.before 钩子：工具执行前执行
     * 
     * 用途：
     * 1. 特殊处理 todowrite 工具：解析 JSON 字符串参数为数组
     * 2. 记录工具调用到 transcript
     * 3. 缓存工具输入（用于 PostToolUse 钩子）
     * 4. 执行 PreToolUse 钩子（可阻止或修改工具调用）
     * 
     * PreToolUse 钩子行为：
     * - decision=deny：抛出错误，阻止工具执行
     * - modifiedInput：修改工具参数
     */
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      // todowrite 工具特殊处理：自动解析 JSON 字符串参数
      if (input.tool === "todowrite" && typeof output.args.todos === "string") {
        let parsed: unknown
        try {
          parsed = JSON.parse(output.args.todos)
        } catch (e) {
          throw new Error(
            `[todowrite ERROR] Failed to parse todos string as JSON. ` +
            `Received: ${output.args.todos.length > 100 ? output.args.todos.slice(0, 100) + '...' : output.args.todos} ` +
            `Expected: Valid JSON array. Pass todos as an array, not a string.`
          )
        }

        if (!Array.isArray(parsed)) {
          throw new Error(
            `[todowrite ERROR] Parsed JSON is not an array. ` +
            `Received type: ${typeof parsed}. ` +
            `Expected: Array of todo objects. Pass todos as [{id, content, status, priority}, ...].`
          )
        }

        output.args.todos = parsed
        log("todowrite: parsed todos string to array", { sessionID: input.sessionID })
      }

      const claudeConfig = await loadClaudeHooksConfig()
      const extendedConfig = await loadPluginExtendedConfig()

      recordToolUse(input.sessionID, input.tool, output.args as Record<string, unknown>)

      cacheToolInput(input.sessionID, input.tool, input.callID, output.args as Record<string, unknown>)

      if (!isHookDisabled(config, "PreToolUse")) {
        const preCtx: PreToolUseContext = {
          sessionId: input.sessionID,
          toolName: input.tool,
          toolInput: output.args as Record<string, unknown>,
          cwd: ctx.directory,
          toolUseId: input.callID,
        }

        const result = await executePreToolUseHooks(preCtx, claudeConfig, extendedConfig)

        if (result.decision === "deny") {
          ctx.client.tui
            .showToast({
              body: {
                title: "PreToolUse Hook Executed",
                message: `[BLOCKED] ${result.toolName ?? input.tool} ${result.hookName ?? "hook"}: ${result.elapsedMs ?? 0}ms\n${result.inputLines ?? ""}`,
                variant: "error",
                duration: 4000,
              },
            })
            .catch(() => {})
          throw new Error(result.reason ?? "Hook blocked the operation")
        }

        if (result.modifiedInput) {
          Object.assign(output.args as Record<string, unknown>, result.modifiedInput)
        }
      }
    },

    /**
     * tool.execute.after 钩子：工具执行后执行
     * 
     * 用途：
     * 1. 记录工具结果到 transcript
     * 2. 执行 PostToolUse 钩子（可追加警告或修改输出）
     * 
     * PostToolUse 钩子行为：
     * - block=true：显示警告 Toast（不阻止执行）
     * - warnings：追加警告消息到工具输出
     * - message：追加自定义消息到工具输出
     * 
     * 特殊处理：
     * - 防御性检查：跳过 undefined output（如 /review 命令）
     * - metadata 处理：优先使用 metadata，否则包装 output.output
     */
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ): Promise<void> => {
      // Guard against undefined output (e.g., from /review command - see issue #1035)
      if (!output) {
        return
      }

      const claudeConfig = await loadClaudeHooksConfig()
      const extendedConfig = await loadPluginExtendedConfig()

      const cachedInput = getToolInput(input.sessionID, input.tool, input.callID) || {}

      // Use metadata if available and non-empty, otherwise wrap output.output in a structured object
      // This ensures plugin tools (call_omo_agent, delegate_task, task) that return strings
      // get their results properly recorded in transcripts instead of empty {}
      const metadata = output.metadata as Record<string, unknown> | undefined
      const hasMetadata = metadata && typeof metadata === "object" && Object.keys(metadata).length > 0
      const toolOutput = hasMetadata ? metadata : { output: output.output }
      recordToolResult(input.sessionID, input.tool, cachedInput, toolOutput)

      if (!isHookDisabled(config, "PostToolUse")) {
        const postClient: PostToolUseClient = {
          session: {
            messages: (opts) => ctx.client.session.messages(opts),
          },
        }

        const postCtx: PostToolUseContext = {
          sessionId: input.sessionID,
          toolName: input.tool,
          toolInput: cachedInput,
          toolOutput: {
            title: input.tool,
            output: output.output,
            metadata: output.metadata as Record<string, unknown>,
          },
          cwd: ctx.directory,
          transcriptPath: getTranscriptPath(input.sessionID),
          toolUseId: input.callID,
          client: postClient,
          permissionMode: "bypassPermissions",
        }

        const result = await executePostToolUseHooks(postCtx, claudeConfig, extendedConfig)

        if (result.block) {
          ctx.client.tui
            .showToast({
              body: {
                title: "PostToolUse Hook Warning",
                message: result.reason ?? "Hook returned warning",
                variant: "warning",
                duration: 4000,
              },
            })
            .catch(() => {})
        }

        if (result.warnings && result.warnings.length > 0) {
          output.output = `${output.output}\n\n${result.warnings.join("\n")}`
        }

        if (result.message) {
          output.output = `${output.output}\n\n${result.message}`
        }

        if (result.hookName) {
          ctx.client.tui
            .showToast({
              body: {
                title: "PostToolUse Hook Executed",
                message: `▶ ${result.toolName ?? input.tool} ${result.hookName}: ${result.elapsedMs ?? 0}ms`,
                variant: "success",
                duration: 2000,
              },
            })
            .catch(() => {})
        }
      }
    },

    /**
     * event 钩子：处理会话事件
     * 
     * 监听事件：
     * 1. session.error：记录错误状态（影响 Stop 钩子行为）
     * 2. session.deleted：清理会话状态
     * 3. session.idle：会话结束，执行 Stop 钩子
     * 
     * Stop 钩子行为：
     * - block=true + injectPrompt：自动继续会话（注入新提示）
     * - block=true：仅记录日志（不自动继续）
     * - 错误/中断会话：忽略 block，避免无限循环
     */
    event: async (input: { event: { type: string; properties?: unknown } }) => {
      const { event } = input

      // 记录会话错误状态
      if (event.type === "session.error") {
        const props = event.properties as Record<string, unknown> | undefined
        const sessionID = props?.sessionID as string | undefined
        if (sessionID) {
          sessionErrorState.set(sessionID, {
            hasError: true,
            errorMessage: String(props?.error ?? "Unknown error"),
          })
        }
        return
      }

      if (event.type === "session.deleted") {
        const props = event.properties as Record<string, unknown> | undefined
        const sessionInfo = props?.info as { id?: string } | undefined
        if (sessionInfo?.id) {
          sessionErrorState.delete(sessionInfo.id)
          sessionInterruptState.delete(sessionInfo.id)
          sessionFirstMessageProcessed.delete(sessionInfo.id)
        }
        return
      }

      if (event.type === "session.idle") {
        const props = event.properties as Record<string, unknown> | undefined
        const sessionID = props?.sessionID as string | undefined

        if (!sessionID) return

        const claudeConfig = await loadClaudeHooksConfig()
        const extendedConfig = await loadPluginExtendedConfig()

        const errorStateBefore = sessionErrorState.get(sessionID)
        const endedWithErrorBefore = errorStateBefore?.hasError === true
        const interruptStateBefore = sessionInterruptState.get(sessionID)
        const interruptedBefore = interruptStateBefore?.interrupted === true

        let parentSessionId: string | undefined
        try {
          const sessionInfo = await ctx.client.session.get({
            path: { id: sessionID },
          })
          parentSessionId = sessionInfo.data?.parentID
        } catch {}

        if (!isHookDisabled(config, "Stop")) {
          const stopCtx: StopContext = {
            sessionId: sessionID,
            parentSessionId,
            cwd: ctx.directory,
          }

          const stopResult = await executeStopHooks(stopCtx, claudeConfig, extendedConfig)

          const errorStateAfter = sessionErrorState.get(sessionID)
          const endedWithErrorAfter = errorStateAfter?.hasError === true
          const interruptStateAfter = sessionInterruptState.get(sessionID)
          const interruptedAfter = interruptStateAfter?.interrupted === true

          const shouldBypass = endedWithErrorBefore || endedWithErrorAfter || interruptedBefore || interruptedAfter

          if (shouldBypass && stopResult.block) {
            const interrupted = interruptedBefore || interruptedAfter
            const endedWithError = endedWithErrorBefore || endedWithErrorAfter
            log("Stop hook block ignored", { sessionID, block: stopResult.block, interrupted, endedWithError })
          } else if (stopResult.block && stopResult.injectPrompt) {
            log("Stop hook returned block with inject_prompt", { sessionID })
            ctx.client.session
              .prompt({
                path: { id: sessionID },
                body: { parts: [{ type: "text", text: stopResult.injectPrompt }] },
                query: { directory: ctx.directory },
              })
              .catch((err: unknown) => log("Failed to inject prompt from Stop hook", err))
          } else if (stopResult.block) {
            log("Stop hook returned block", { sessionID, reason: stopResult.reason })
          }
        }

        sessionErrorState.delete(sessionID)
        sessionInterruptState.delete(sessionID)
      }
    },
  }
}
