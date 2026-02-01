/**
 * background-task 工具实现
 * 
 * 提供后台任务的启动、监控和取消功能
 */

import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import type { BackgroundManager, BackgroundTask } from "../../features/background-agent"
import type { BackgroundTaskArgs, BackgroundOutputArgs, BackgroundCancelArgs } from "./types"
import { BACKGROUND_TASK_DESCRIPTION, BACKGROUND_OUTPUT_DESCRIPTION, BACKGROUND_CANCEL_DESCRIPTION } from "./constants"
import { findNearestMessageWithFields, findFirstMessageWithAgent, MESSAGE_STORAGE } from "../../features/hook-message-injector"
import { getSessionAgent } from "../../features/claude-code-session-state"
import { log } from "../../shared/logger"
import { consumeNewMessages } from "../../shared/session-cursor"

type OpencodeClient = PluginInput["client"]

/**
 * 获取会话消息目录
 * 
 * 尝试在MESSAGE_STORAGE中查找sessionID对应的目录
 * 支持直接路径和嵌套路径两种结构
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
 * 格式化时间间隔
 * 
 * 将毫秒转换为人类可读的时间格式（小时/分钟/秒）
 */
function formatDuration(start: Date, end?: Date): string {
  const duration = (end ?? new Date()).getTime() - start.getTime()
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * 工具上下文（包含元数据回调）
 */
type ToolContextWithMetadata = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void
}

/**
 * 创建后台任务工具
 * 
 * ## 功能
 * 在后台启动新的代理任务，立即返回task_id，不阻塞主流程
 * 
 * ## 任务生命周期
 * 1. 创建任务 → pending状态
 * 2. 获取并发槽 → running状态
 * 3. 执行完成 → completed/error/cancelled状态
 * 
 * ## 父代理解析
 * 按优先级解析父代理：
 * 1. toolContext.agent（当前上下文）
 * 2. sessionAgent（会话级代理）
 * 3. firstMessageAgent（首条消息代理）
 * 4. prevMessage.agent（最近消息代理）
 */
export function createBackgroundTask(manager: BackgroundManager): ToolDefinition {
  return tool({
    description: BACKGROUND_TASK_DESCRIPTION,
    args: {
      description: tool.schema.string().describe("Short task description (shown in status)"),
      prompt: tool.schema.string().describe("Full detailed prompt for the agent"),
      agent: tool.schema.string().describe("Agent type to use (any registered agent)"),
    },
    async execute(args: BackgroundTaskArgs, toolContext) {
      const ctx = toolContext as ToolContextWithMetadata

      if (!args.agent || args.agent.trim() === "") {
        return `[ERROR] Agent parameter is required. Please specify which agent to use (e.g., "explore", "librarian", "build", etc.)`
      }

      try {
        // 解析父代理：按优先级从多个来源获取
        const messageDir = getMessageDir(ctx.sessionID)
        const prevMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
        const firstMessageAgent = messageDir ? findFirstMessageWithAgent(messageDir) : null
        const sessionAgent = getSessionAgent(ctx.sessionID)
        const parentAgent = ctx.agent ?? sessionAgent ?? firstMessageAgent ?? prevMessage?.agent
        
        log("[background_task] parentAgent resolution", {
          sessionID: ctx.sessionID,
          ctxAgent: ctx.agent,
          sessionAgent,
          firstMessageAgent,
          prevMessageAgent: prevMessage?.agent,
          resolvedParentAgent: parentAgent,
        })
        
        // 提取父模型信息（用于继承配置）
        const parentModel = prevMessage?.model?.providerID && prevMessage?.model?.modelID
          ? { 
              providerID: prevMessage.model.providerID, 
              modelID: prevMessage.model.modelID,
              ...(prevMessage.model.variant ? { variant: prevMessage.model.variant } : {})
            }
          : undefined

        const task = await manager.launch({
          description: args.description,
          prompt: args.prompt,
          agent: args.agent.trim(),
          parentSessionID: ctx.sessionID,
          parentMessageID: ctx.messageID,
          parentModel,
          parentAgent,
        })

        ctx.metadata?.({
          title: args.description,
          metadata: { sessionId: task.sessionID },
        })

        return `Background task launched successfully.

Task ID: ${task.id}
Session ID: ${task.sessionID}
Description: ${task.description}
Agent: ${task.agent}
Status: ${task.status}

The system will notify you when the task completes.
Use \`background_output\` tool with task_id="${task.id}" to check progress:
- block=false (default): Check status immediately - returns full status info
- block=true: Wait for completion (rarely needed since system notifies)`
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `[ERROR] Failed to launch background task: ${message}`
      }
    },
  })
}

/**
 * 延迟执行
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 截断文本
 * 
 * 超过maxLength时添加省略号
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + "..."
}

/**
 * 格式化任务状态
 * 
 * 生成包含任务详情、进度和状态的Markdown报告
 * 
 * ## 状态说明
 * - pending: 等待并发槽，显示排队时间
 * - running: 执行中，显示最后工具和消息
 * - completed: 已完成，显示总耗时
 * - error: 失败，显示错误信息
 * - cancelled: 已取消
 */
function formatTaskStatus(task: BackgroundTask): string {
  let duration: string
  if (task.status === "pending" && task.queuedAt) {
    duration = formatDuration(task.queuedAt, undefined)
  } else if (task.startedAt) {
    duration = formatDuration(task.startedAt, task.completedAt)
  } else {
    duration = "N/A"
  }
  const promptPreview = truncateText(task.prompt, 500)
  
  let progressSection = ""
  if (task.progress?.lastTool) {
    progressSection = `\n| Last tool | ${task.progress.lastTool} |`
  }

  let lastMessageSection = ""
  if (task.progress?.lastMessage) {
    const truncated = truncateText(task.progress.lastMessage, 500)
    const messageTime = task.progress.lastMessageAt 
      ? task.progress.lastMessageAt.toISOString()
      : "N/A"
    lastMessageSection = `

## Last Message (${messageTime})

\`\`\`
${truncated}
\`\`\``
  }

  let statusNote = ""
  if (task.status === "pending") {
    statusNote = `

> **Queued**: Task is waiting for a concurrency slot to become available.`
  } else if (task.status === "running") {
    statusNote = `

> **Note**: No need to wait explicitly - the system will notify you when this task completes.`
  } else if (task.status === "error") {
    statusNote = `

> **Failed**: The task encountered an error. Check the last message for details.`
  }

  const durationLabel = task.status === "pending" ? "Queued for" : "Duration"

  return `# Task Status

| Field | Value |
|-------|-------|
| Task ID | \`${task.id}\` |
| Description | ${task.description} |
| Agent | ${task.agent} |
| Status | **${task.status}** |
| ${durationLabel} | ${duration} |
| Session ID | \`${task.sessionID}\` |${progressSection}
${statusNote}
## Original Prompt

\`\`\`
${promptPreview}
\`\`\`${lastMessageSection}`
}

/**
 * 格式化任务结果
 * 
 * 从会话中提取任务输出，包括：
 * - 代理的文本响应
 * - 工具调用结果
 * - 推理过程（thinking models）
 * 
 * ## 消息处理
 * 1. 获取会话所有消息
 * 2. 过滤assistant和tool角色
 * 3. 按时间排序
 * 4. 使用session-cursor跟踪已读消息
 * 5. 提取新消息的文本内容
 */
async function formatTaskResult(task: BackgroundTask, client: OpencodeClient): Promise<string> {
  if (!task.sessionID) {
    return `Error: Task has no sessionID`
  }
  
  const messagesResult = await client.session.messages({
    path: { id: task.sessionID },
  })

  if (messagesResult.error) {
    return `Error fetching messages: ${messagesResult.error}`
  }

  // 处理SDK响应结构：直接数组或包装在.data中
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages = ((messagesResult as any).data ?? messagesResult) as Array<{
    info?: { role?: string; time?: string }
    parts?: Array<{ 
      type?: string
      text?: string
      content?: string | Array<{ type: string; text?: string }>
      name?: string
    }>
  }>

  if (!Array.isArray(messages) || messages.length === 0) {
    return `Task Result

Task ID: ${task.id}
Description: ${task.description}
Duration: ${formatDuration(task.startedAt ?? new Date(), task.completedAt)}
Session ID: ${task.sessionID}

---

(No messages found)`
  }

  // 包含assistant和tool消息
  // 工具结果（grep、glob、bash输出）来自role "tool"
  const relevantMessages = messages.filter(
    (m) => m.info?.role === "assistant" || m.info?.role === "tool"
  )

  if (relevantMessages.length === 0) {
    return `Task Result

Task ID: ${task.id}
Description: ${task.description}
Duration: ${formatDuration(task.startedAt ?? new Date(), task.completedAt)}
Session ID: ${task.sessionID}

---

(No assistant or tool response found)`
  }

  // 按时间升序排序（最旧的在前）以按顺序处理消息
  const sortedMessages = [...relevantMessages].sort((a, b) => {
    const timeA = String((a as { info?: { time?: string } }).info?.time ?? "")
    const timeB = String((b as { info?: { time?: string } }).info?.time ?? "")
    return timeA.localeCompare(timeB)
  })
  
  // 使用session-cursor过滤出新消息（避免重复输出）
  const newMessages = consumeNewMessages(task.sessionID, sortedMessages)
  if (newMessages.length === 0) {
    const duration = formatDuration(task.startedAt ?? new Date(), task.completedAt)
    return `Task Result

Task ID: ${task.id}
Description: ${task.description}
Duration: ${duration}
Session ID: ${task.sessionID}

---

(No new output since last check)`
  }

  // 从所有消息中提取内容，不仅仅是最后一条
  // 工具结果可能在早期消息中，而最终消息可能为空
  const extractedContent: string[] = []
  
  for (const message of newMessages) {
    for (const part of message.parts ?? []) {
      // 处理"text"和"reasoning"部分（thinking models使用"reasoning"）
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
            // 处理"text"和"reasoning"部分（thinking models使用"reasoning"）
            if ((block.type === "text" || block.type === "reasoning") && block.text) {
              extractedContent.push(block.text)
            }
          }
        }
      }
    }
  }
  
  const textContent = extractedContent
    .filter((text) => text.length > 0)
    .join("\n\n")

  const duration = formatDuration(task.startedAt ?? new Date(), task.completedAt)

  return `Task Result

Task ID: ${task.id}
Description: ${task.description}
Duration: ${duration}
Session ID: ${task.sessionID}

---

${textContent || "(No text output)"}`
}

/**
 * 创建后台输出工具
 * 
 * ## 功能
 * 获取后台任务的输出结果
 * 
 * ## 执行模式
 * 1. **非阻塞模式（默认）**: 立即返回当前状态
 *    - completed: 返回完整结果
 *    - running/pending: 返回状态信息
 *    - error/cancelled: 返回错误信息
 * 
 * 2. **阻塞模式（block=true）**: 轮询直到完成或超时
 *    - 每秒检查一次状态
 *    - 超时后返回当前状态
 *    - 很少需要，因为系统会自动通知完成
 * 
 * ## 结果收集
 * - 使用session-cursor跟踪已读消息
 * - 只返回新消息（避免重复）
 * - 提取文本、推理和工具结果
 */
export function createBackgroundOutput(manager: BackgroundManager, client: OpencodeClient): ToolDefinition {
  return tool({
    description: BACKGROUND_OUTPUT_DESCRIPTION,
    args: {
      task_id: tool.schema.string().describe("Task ID to get output from"),
      block: tool.schema.boolean().optional().describe("Wait for completion (default: false). System notifies when done, so blocking is rarely needed."),
      timeout: tool.schema.number().optional().describe("Max wait time in ms (default: 60000, max: 600000)"),
    },
    async execute(args: BackgroundOutputArgs) {
      try {
        const task = manager.getTask(args.task_id)
        if (!task) {
          return `Task not found: ${args.task_id}`
        }

        const shouldBlock = args.block === true
        const timeoutMs = Math.min(args.timeout ?? 60000, 600000)

        // 已完成：立即返回结果（无论block标志）
        if (task.status === "completed") {
          return await formatTaskResult(task, client)
        }

        // 错误或已取消：立即返回状态
        if (task.status === "error" || task.status === "cancelled") {
          return formatTaskStatus(task)
        }

        // 非阻塞且仍在运行：返回状态
        if (!shouldBlock) {
          return formatTaskStatus(task)
        }

        // 阻塞模式：轮询直到完成或超时
        const startTime = Date.now()

        while (Date.now() - startTime < timeoutMs) {
          await delay(1000)

          const currentTask = manager.getTask(args.task_id)
          if (!currentTask) {
            return `Task was deleted: ${args.task_id}`
          }

          if (currentTask.status === "completed") {
            return await formatTaskResult(currentTask, client)
          }

          if (currentTask.status === "error" || currentTask.status === "cancelled") {
            return formatTaskStatus(currentTask)
          }
        }

        // 超时：返回当前状态
        const finalTask = manager.getTask(args.task_id)
        if (!finalTask) {
          return `Task was deleted: ${args.task_id}`
        }
        return `Timeout exceeded (${timeoutMs}ms). Task still ${finalTask.status}.\n\n${formatTaskStatus(finalTask)}`
      } catch (error) {
        return `Error getting output: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}

/**
 * 创建后台取消工具
 * 
 * ## 功能
 * 取消运行中或等待中的后台任务
 * 
 * ## 取消逻辑
 * 1. **单个任务取消**:
 *    - pending: 从队列移除，不占用并发槽
 *    - running: 调用session.abort()终止执行
 * 
 * 2. **批量取消（all=true）**:
 *    - 获取当前会话的所有后代任务
 *    - 过滤出running和pending状态
 *    - 逐个取消
 * 
 * ## 会话继续
 * 已启动的任务（有sessionID）可以通过delegate_task(session_id=...)继续
 * 
 * ## Fire-and-forget
 * session.abort()不await，避免主会话被终止
 */
export function createBackgroundCancel(manager: BackgroundManager, client: OpencodeClient): ToolDefinition {
  return tool({
    description: BACKGROUND_CANCEL_DESCRIPTION,
    args: {
      taskId: tool.schema.string().optional().describe("Task ID to cancel (required if all=false)"),
      all: tool.schema.boolean().optional().describe("Cancel all running background tasks (default: false)"),
    },
    async execute(args: BackgroundCancelArgs, toolContext) {
      try {
        const cancelAll = args.all === true

        if (!cancelAll && !args.taskId) {
          return `[ERROR] Invalid arguments: Either provide a taskId or set all=true to cancel all running tasks.`
        }

        if (cancelAll) {
          const tasks = manager.getAllDescendantTasks(toolContext.sessionID)
          const cancellableTasks = tasks.filter(t => t.status === "running" || t.status === "pending")

          if (cancellableTasks.length === 0) {
            return `No running or pending background tasks to cancel.`
          }

          const cancelledInfo: Array<{
            id: string
            description: string
            status: string
            sessionID?: string
          }> = []

          for (const task of cancellableTasks) {
            if (task.status === "pending") {
              // pending任务：从队列移除
              manager.cancelPendingTask(task.id)
              cancelledInfo.push({
                id: task.id,
                description: task.description,
                status: "pending",
                sessionID: undefined,
              })
            } else if (task.sessionID) {
              // running任务：终止会话（fire-and-forget）
              client.session.abort({
                path: { id: task.sessionID },
              }).catch(() => {})

              task.status = "cancelled"
              task.completedAt = new Date()
              cancelledInfo.push({
                id: task.id,
                description: task.description,
                status: "running",
                sessionID: task.sessionID,
              })
            }
          }

          const tableRows = cancelledInfo
            .map(t => `| \`${t.id}\` | ${t.description} | ${t.status} | ${t.sessionID ? `\`${t.sessionID}\`` : "(not started)"} |`)
            .join("\n")

           const resumableTasks = cancelledInfo.filter(t => t.sessionID)
           const resumeSection = resumableTasks.length > 0
             ? `\n## Continue Instructions

To continue a cancelled task, use:
\`\`\`
delegate_task(session_id="<session_id>", prompt="Continue: <your follow-up>")
\`\`\`

Continuable sessions:
${resumableTasks.map(t => `- \`${t.sessionID}\` (${t.description})`).join("\n")}`
             : ""

          return `Cancelled ${cancellableTasks.length} background task(s):

| Task ID | Description | Status | Session ID |
|---------|-------------|--------|------------|
${tableRows}
${resumeSection}`
        }

        const task = manager.getTask(args.taskId!)
        if (!task) {
          return `[ERROR] Task not found: ${args.taskId}`
        }

        if (task.status !== "running" && task.status !== "pending") {
          return `[ERROR] Cannot cancel task: current status is "${task.status}".
Only running or pending tasks can be cancelled.`
        }

        if (task.status === "pending") {
          // pending任务：使用manager方法（无会话需终止，无槽位需释放）
          const cancelled = manager.cancelPendingTask(task.id)
          if (!cancelled) {
            return `[ERROR] Failed to cancel pending task: ${task.id}`
          }

          return `Pending task cancelled successfully

Task ID: ${task.id}
Description: ${task.description}
Status: ${task.status}`
        }

        // running任务：终止会话
        // Fire-and-forget：发送abort请求但不await
        // await会导致主会话也被终止
        if (task.sessionID) {
          client.session.abort({
            path: { id: task.sessionID },
          }).catch(() => {})
        }

        task.status = "cancelled"
        task.completedAt = new Date()

        return `Task cancelled successfully

Task ID: ${task.id}
Description: ${task.description}
Session ID: ${task.sessionID}
Status: ${task.status}`
      } catch (error) {
        return `[ERROR] Error cancelling task: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  })
}
