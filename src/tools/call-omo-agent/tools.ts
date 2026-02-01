/**
 * call-omo-agent - 直接调用代理工具
 * 
 * ## 功能
 * 直接调用特定代理（绕过delegate-task）
 * 
 * ## 使用场景
 * - 调试代理行为
 * - 快速测试代理
 * - 特殊用例（需要精确控制）
 * 
 * ## 与delegate-task的区别
 * - delegate-task: 基于类别自动路由（推荐）
 * - call-omo-agent: 直接指定代理（高级用法）
 * 
 * ## 支持的代理
 * - explore: 快速代码库探索（Grok Code）
 * - librarian: 文档和GitHub搜索（Claude Sonnet 4.5）
 * 
 * ## 执行模式
 * - run_in_background=true: 异步执行，返回task_id
 * - run_in_background=false: 同步执行，等待完成
 * - session_id: 继续现有会话（仅同步模式）
 * 
 * ## 示例
 * call_omo_agent(
 *   description="搜索React hooks",
 *   prompt="找到所有使用useState的文件",
 *   subagent_type="explore",
 *   run_in_background=true
 * )
 */
import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { ALLOWED_AGENTS, CALL_OMO_AGENT_DESCRIPTION } from "./constants"
import type { CallOmoAgentArgs } from "./types"
import type { BackgroundManager } from "../../features/background-agent"
import { log, getAgentToolRestrictions, includesCaseInsensitive } from "../../shared"
import { consumeNewMessages } from "../../shared/session-cursor"
import { findFirstMessageWithAgent, findNearestMessageWithFields, MESSAGE_STORAGE } from "../../features/hook-message-injector"
import { getSessionAgent } from "../../features/claude-code-session-state"

/**
 * 获取会话消息目录
 * 
 * 在MESSAGE_STORAGE中查找sessionID对应的目录。
 * 支持两种目录结构：
 * 1. 直接路径：MESSAGE_STORAGE/sessionID
 * 2. 嵌套路径：MESSAGE_STORAGE/parent/sessionID
 * 
 * @param sessionID - 会话ID
 * @returns 消息目录路径，未找到返回null
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

type ToolContextWithMetadata = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void
}

/**
 * 创建call_omo_agent工具
 * 
 * @param ctx - 插件输入上下文
 * @param backgroundManager - 后台任务管理器
 * @returns call_omo_agent工具定义
 * 
 * 该工具支持：
 * - 同步/异步执行
 * - 会话继续
 * - 代理权限控制
 * - 父代理追踪
 */
export function createCallOmoAgent(
  ctx: PluginInput,
  backgroundManager: BackgroundManager
): ToolDefinition {
  const agentDescriptions = ALLOWED_AGENTS.map(
    (name) => `- ${name}: Specialized agent for ${name} tasks`
  ).join("\n")
  const description = CALL_OMO_AGENT_DESCRIPTION.replace("{agents}", agentDescriptions)

  return tool({
    description,
    args: {
      description: tool.schema.string().describe("A short (3-5 words) description of the task"),
      prompt: tool.schema.string().describe("The task for the agent to perform"),
      subagent_type: tool.schema
        .string()
        .describe("The type of specialized agent to use for this task (explore or librarian only)"),
      run_in_background: tool.schema
        .boolean()
        .describe("REQUIRED. true: run asynchronously (use background_output to get results), false: run synchronously and wait for completion"),
      session_id: tool.schema.string().describe("Existing Task session to continue").optional(),
    },
    async execute(args: CallOmoAgentArgs, toolContext) {
      const toolCtx = toolContext as ToolContextWithMetadata
      log(`[call_omo_agent] Starting with agent: ${args.subagent_type}, background: ${args.run_in_background}`)

      // 验证代理类型（不区分大小写）
      if (!includesCaseInsensitive([...ALLOWED_AGENTS], args.subagent_type)) {
        return `Error: Invalid agent type "${args.subagent_type}". Only ${ALLOWED_AGENTS.join(", ")} are allowed.`
      }
      
      // 规范化代理名称
      const normalizedAgent = args.subagent_type.toLowerCase() as typeof ALLOWED_AGENTS[number]
      args = { ...args, subagent_type: normalizedAgent }

      // 根据执行模式分发
      if (args.run_in_background) {
        if (args.session_id) {
          return `Error: session_id is not supported in background mode. Use run_in_background=false to continue an existing session.`
        }
        return await executeBackground(args, toolCtx, backgroundManager)
      }

      return await executeSync(args, toolCtx, ctx)
    },
  })
}

/**
 * 后台执行模式
 * 启动后台任务并立即返回task_id
 */
/**
 * 后台执行模式
 * 
 * 启动后台任务并立即返回task_id，不阻塞主流程。
 * 
 * ## 执行流程
 * 1. 解析父代理（用于权限继承和上下文追踪）
 * 2. 调用BackgroundManager.launch()启动任务
 * 3. 返回task_id和会话信息
 * 
 * ## 父代理解析优先级
 * 1. toolContext.agent（当前工具上下文）
 * 2. sessionAgent（会话级代理）
 * 3. firstMessageAgent（首条消息代理）
 * 4. prevMessage.agent（最近消息代理）
 * 
 * @param args - 工具参数
 * @param toolContext - 工具上下文
 * @param manager - 后台任务管理器
 * @returns 任务启动结果消息
 */
async function executeBackground(
  args: CallOmoAgentArgs,
  toolContext: ToolContextWithMetadata,
  manager: BackgroundManager
): Promise<string> {
  try {
    // 解析父代理（用于权限继承）
    const messageDir = getMessageDir(toolContext.sessionID)
    const prevMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
    const firstMessageAgent = messageDir ? findFirstMessageWithAgent(messageDir) : null
    const sessionAgent = getSessionAgent(toolContext.sessionID)
    const parentAgent = toolContext.agent ?? sessionAgent ?? firstMessageAgent ?? prevMessage?.agent
    
    log("[call_omo_agent] parentAgent resolution", {
      sessionID: toolContext.sessionID,
      messageDir,
      ctxAgent: toolContext.agent,
      sessionAgent,
      firstMessageAgent,
      prevMessageAgent: prevMessage?.agent,
      resolvedParentAgent: parentAgent,
    })

    const task = await manager.launch({
      description: args.description,
      prompt: args.prompt,
      agent: args.subagent_type,
      parentSessionID: toolContext.sessionID,
      parentMessageID: toolContext.messageID,
      parentAgent,
    })

    toolContext.metadata?.({
      title: args.description,
      metadata: { sessionId: task.sessionID },
    })

    return `Background agent task launched successfully.

Task ID: ${task.id}
Session ID: ${task.sessionID}
Description: ${task.description}
Agent: ${task.agent} (subagent)
Status: ${task.status}

The system will notify you when the task completes.
Use \`background_output\` tool with task_id="${task.id}" to check progress:
- block=false (default): Check status immediately - returns full status info
- block=true: Wait for completion (rarely needed since system notifies)`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `Failed to launch background agent task: ${message}`
  }
}

/**
 * 同步执行模式
 * 等待代理完成并返回结果
 */
/**
 * 同步执行模式
 * 
 * 等待代理完成并返回结果，阻塞主流程直到任务完成。
 * 
 * ## 执行流程
 * 1. **会话管理**:
 *    - 使用现有会话（session_id）或创建新会话
 *    - 设置权限（禁用question权限）
 *    - 继承父会话的工作目录
 * 
 * 2. **发送提示词**:
 *    - 配置代理和工具权限
 *    - 发送用户提示词
 * 
 * 3. **轮询完成**:
 *    - 检查会话状态（idle/running）
 *    - 检测消息稳定性（连续N次消息数不变）
 *    - 超时保护（5分钟）
 * 
 * 4. **提取结果**:
 *    - 获取assistant和tool消息
 *    - 使用session-cursor过滤新消息（避免重复）
 *    - 提取文本和推理内容
 * 
 * @param args - 工具参数
 * @param toolContext - 工具上下文
 * @param ctx - 插件输入上下文
 * @returns 任务执行结果
 */
async function executeSync(
  args: CallOmoAgentArgs,
  toolContext: ToolContextWithMetadata,
  ctx: PluginInput
): Promise<string> {
  let sessionID: string

  // 使用现有会话或创建新会话
  if (args.session_id) {
    log(`[call_omo_agent] Using existing session: ${args.session_id}`)
    const sessionResult = await ctx.client.session.get({
      path: { id: args.session_id },
    })
    if (sessionResult.error) {
      log(`[call_omo_agent] Session get error:`, sessionResult.error)
      return `Error: Failed to get existing session: ${sessionResult.error}`
    }
    sessionID = args.session_id
  } else {
    log(`[call_omo_agent] Creating new session with parent: ${toolContext.sessionID}`)
    const parentSession = await ctx.client.session.get({
      path: { id: toolContext.sessionID },
    }).catch((err) => {
      log(`[call_omo_agent] Failed to get parent session:`, err)
      return null
    })
    log(`[call_omo_agent] Parent session dir: ${parentSession?.data?.directory}, fallback: ${ctx.directory}`)
    const parentDirectory = parentSession?.data?.directory ?? ctx.directory

    const createResult = await ctx.client.session.create({
      body: {
        parentID: toolContext.sessionID,
        title: `${args.description} (@${args.subagent_type} subagent)`,
        permission: [
          { permission: "question", action: "deny" as const, pattern: "*" },
        ],
      } as any,
      query: {
        directory: parentDirectory,
      },
    })

    if (createResult.error) {
      log(`[call_omo_agent] Session create error:`, createResult.error)
      const errorStr = String(createResult.error)
      if (errorStr.toLowerCase().includes("unauthorized")) {
        return `Error: Failed to create session (Unauthorized). This may be due to:
1. OAuth token restrictions (e.g., Claude Code credentials are restricted to Claude Code only)
2. Provider authentication issues
3. Session permission inheritance problems

Try using a different provider or API key authentication.

Original error: ${createResult.error}`
      }
      return `Error: Failed to create session: ${createResult.error}`
    }

    sessionID = createResult.data.id
    log(`[call_omo_agent] Created session: ${sessionID}`)
  }

  toolContext.metadata?.({
    title: args.description,
    metadata: { sessionId: sessionID },
  })

  log(`[call_omo_agent] Sending prompt to session ${sessionID}`)
  log(`[call_omo_agent] Prompt text:`, args.prompt.substring(0, 100))

  try {
    await ctx.client.session.prompt({
      path: { id: sessionID },
      body: {
        agent: args.subagent_type,
        tools: {
          ...getAgentToolRestrictions(args.subagent_type),
          task: false,
          delegate_task: false,
        },
        parts: [{ type: "text", text: args.prompt }],
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log(`[call_omo_agent] Prompt error:`, errorMessage)
    if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
      return `Error: Agent "${args.subagent_type}" not found. Make sure the agent is registered in your opencode.json or provided by a plugin.\n\n<task_metadata>\nsession_id: ${sessionID}\n</task_metadata>`
    }
    return `Error: Failed to send prompt: ${errorMessage}\n\n<task_metadata>\nsession_id: ${sessionID}\n</task_metadata>`
  }

  log(`[call_omo_agent] Prompt sent, polling for completion...`)

  // 轮询会话完成状态
  const POLL_INTERVAL_MS = 500 // 轮询间隔
  const MAX_POLL_TIME_MS = 5 * 60 * 1000 // 5分钟超时
  const pollStart = Date.now()
  let lastMsgCount = 0
  let stablePolls = 0
  const STABILITY_REQUIRED = 3 // 需要3次稳定轮询才认为完成

  while (Date.now() - pollStart < MAX_POLL_TIME_MS) {
    // 检查是否被中止
    if (toolContext.abort?.aborted) {
      log(`[call_omo_agent] Aborted by user`)
      return `Task aborted.\n\n<task_metadata>\nsession_id: ${sessionID}\n</task_metadata>`
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    // 检查会话状态
    const statusResult = await ctx.client.session.status()
    const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>
    const sessionStatus = allStatuses[sessionID]

    // 如果会话正在运行，重置稳定计数器
    if (sessionStatus && sessionStatus.type !== "idle") {
      stablePolls = 0
      lastMsgCount = 0
      continue
    }

    // 会话空闲 - 检查消息稳定性
    const messagesCheck = await ctx.client.session.messages({ path: { id: sessionID } })
    const msgs = ((messagesCheck as { data?: unknown }).data ?? messagesCheck) as Array<unknown>
    const currentMsgCount = msgs.length

    if (currentMsgCount > 0 && currentMsgCount === lastMsgCount) {
      stablePolls++
      if (stablePolls >= STABILITY_REQUIRED) {
        log(`[call_omo_agent] Session complete, ${currentMsgCount} messages`)
        break
      }
    } else {
      stablePolls = 0
      lastMsgCount = currentMsgCount
    }
  }

  if (Date.now() - pollStart >= MAX_POLL_TIME_MS) {
    log(`[call_omo_agent] Timeout reached`)
    return `Error: Agent task timed out after 5 minutes.\n\n<task_metadata>\nsession_id: ${sessionID}\n</task_metadata>`
  }

  const messagesResult = await ctx.client.session.messages({
    path: { id: sessionID },
  })

  if (messagesResult.error) {
    log(`[call_omo_agent] Messages error:`, messagesResult.error)
    return `Error: Failed to get messages: ${messagesResult.error}`
  }

  const messages = messagesResult.data
  log(`[call_omo_agent] Got ${messages.length} messages`)

  // 提取助手和工具消息
  // 工具结果（grep, glob, bash输出）来自role "tool"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relevantMessages = messages.filter(
    (m: any) => m.info?.role === "assistant" || m.info?.role === "tool"
  )

  if (relevantMessages.length === 0) {
    log(`[call_omo_agent] No assistant or tool messages found`)
    log(`[call_omo_agent] All messages:`, JSON.stringify(messages, null, 2))
    return `Error: No assistant or tool response found\n\n<task_metadata>\nsession_id: ${sessionID}\n</task_metadata>`
  }

  log(`[call_omo_agent] Found ${relevantMessages.length} relevant messages`)

  // 按时间升序排序（最旧的在前）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedMessages = [...relevantMessages].sort((a: any, b: any) => {
    const timeA = a.info?.time?.created ?? 0
    const timeB = b.info?.time?.created ?? 0
    return timeA - timeB
  })

  // 消费新消息（避免重复）
  const newMessages = consumeNewMessages(sessionID, sortedMessages)

  if (newMessages.length === 0) {
    return `No new output since last check.\n\n<task_metadata>\nsession_id: ${sessionID}\n</task_metadata>`
  }

  // 从所有消息中提取内容（不仅仅是最后一条）
  // 工具结果可能在早期消息中，而最终消息为空
  const extractedContent: string[] = []

  for (const message of newMessages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const part of (message as any).parts ?? []) {
      // 处理"text"和"reasoning"部分（思考模型使用"reasoning"）
      if ((part.type === "text" || part.type === "reasoning") && part.text) {
        extractedContent.push(part.text)
      } else if (part.type === "tool_result") {
        // 工具结果包含工具调用的实际输出
        const toolResult = part as { content?: string | Array<{ type: string; text?: string }> }
        if (typeof toolResult.content === "string" && toolResult.content) {
          extractedContent.push(toolResult.content)
        } else if (Array.isArray(toolResult.content)) {
          // 处理内容块数组
          for (const block of toolResult.content) {
            if ((block.type === "text" || block.type === "reasoning") && block.text) {
              extractedContent.push(block.text)
            }
          }
        }
      }
    }
  }

  const responseText = extractedContent
    .filter((text) => text.length > 0)
    .join("\n\n")

  log(`[call_omo_agent] Got response, length: ${responseText.length}`)

  const output =
    responseText + "\n\n" + ["<task_metadata>", `session_id: ${sessionID}`, "</task_metadata>"].join("\n")

  return output
}
