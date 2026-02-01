/**
 * Atlas 编排钩子 (Atlas Orchestration Hook)
 * 
 * ## 功能概述 (Overview)
 * Atlas钩子是系统的主编排器，在工具调用前后拦截并协调代理行为。
 * 它负责任务路由、代理选择、状态跟踪和错误恢复。
 * 
 * The Atlas hook is the system's main orchestrator, intercepting and coordinating
 * agent behavior before and after tool calls. It handles task routing, agent selection,
 * state tracking, and error recovery.
 * 
 * ## 核心职责 (Core Responsibilities)
 * 1. **任务路由决策** - 决定任务是直接执行还是委托给子代理
 *    Task routing decisions - determines if tasks should be executed directly or delegated
 * 
 * 2. **编排器行为强制** - 防止编排器直接修改代码，强制使用委托
 *    Orchestrator behavior enforcement - prevents orchestrators from directly modifying code
 * 
 * 3. **Boulder状态管理** - 跟踪长期工作计划的进度和会话
 *    Boulder state management - tracks progress and sessions for long-term work plans
 * 
 * 4. **验证提醒注入** - 在子代理完成后注入验证步骤提醒
 *    Verification reminder injection - injects verification step reminders after subagent completion
 * 
 * 5. **自动继续机制** - 在会话空闲时自动注入继续提示
 *    Auto-continuation mechanism - automatically injects continuation prompts when sessions idle
 * 
 * ## 触发时机 (Trigger Points)
 * - **tool.execute.before**: 工具调用前，拦截并修改参数
 *   Before tool execution, intercepts and modifies parameters
 * 
 * - **tool.execute.after**: 工具调用后，注入提醒和状态更新
 *   After tool execution, injects reminders and updates state
 * 
 * - **session.idle**: 会话空闲时，检查是否需要自动继续
 *   When session idles, checks if auto-continuation is needed
 * 
 * - **session.error**: 会话错误时，跟踪中止状态
 *   When session errors, tracks abort state
 * 
 * ## 与Atlas代理的关系 (Relationship with Atlas Agent)
 * - 钩子是轻量级路由层，不执行复杂逻辑
 *   Hook is a lightweight routing layer, doesn't execute complex logic
 * 
 * - 复杂编排决策委托给Atlas代理处理
 *   Complex orchestration decisions are delegated to the Atlas agent
 * 
 * - 钩子专注于拦截、注入和状态管理
 *   Hook focuses on interception, injection, and state management
 * 
 * ## 关键概念 (Key Concepts)
 * 
 * ### Boulder Mode (巨石模式)
 * 长期工作计划模式，代理持续工作直到所有任务完成。
 * 钩子负责在会话空闲时自动注入继续提示。
 * 
 * Long-term work plan mode where agents work continuously until all tasks complete.
 * Hook automatically injects continuation prompts when sessions idle.
 * 
 * ### Orchestrator vs Implementer (编排器 vs 实现者)
 * - 编排器(Atlas)：负责任务分解和委托，不直接修改代码
 *   Orchestrator (Atlas): responsible for task breakdown and delegation, doesn't modify code directly
 * 
 * - 实现者(Sisyphus等)：负责实际的代码修改和实现
 *   Implementer (Sisyphus, etc.): responsible for actual code modification and implementation
 * 
 * ### Verification Workflow (验证工作流)
 * 子代理完成后，钩子注入强制验证步骤：
 * 1. 运行LSP诊断
 * 2. 运行测试
 * 3. 执行QA（如需要）
 * 4. 标记任务完成
 * 
 * After subagent completion, hook injects mandatory verification steps:
 * 1. Run LSP diagnostics
 * 2. Run tests
 * 3. Execute QA (if needed)
 * 4. Mark task complete
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  readBoulderState,
  appendSessionId,
  getPlanProgress,
} from "../../features/boulder-state"
import { getMainSessionID, subagentSessions } from "../../features/claude-code-session-state"
import { findNearestMessageWithFields, MESSAGE_STORAGE } from "../../features/hook-message-injector"
import { log } from "../../shared/logger"
import { createSystemDirective, SYSTEM_DIRECTIVE_PREFIX, SystemDirectiveTypes } from "../../shared/system-directive"
import { isCallerOrchestrator, getMessageDir } from "../../shared/session-utils"
import type { BackgroundManager } from "../../features/background-agent"

export const HOOK_NAME = "atlas"

/**
 * 跨平台检查路径是否在 .sisyphus/ 目录内
 * Cross-platform check if a path is inside .sisyphus/ directory.
 * 
 * .sisyphus/ 目录用于存储计划、笔记等编排器专用文件。
 * 编排器可以直接修改这些文件，但不应直接修改源代码。
 * 
 * The .sisyphus/ directory stores plans, notepads, and other orchestrator-specific files.
 * Orchestrators can directly modify these files, but should not directly modify source code.
 * 
 * @param filePath - 要检查的文件路径 (file path to check)
 * @returns 如果路径在 .sisyphus/ 目录内返回 true (true if path is inside .sisyphus/)
 */
function isSisyphusPath(filePath: string): boolean {
  return /\.sisyphus[/\\]/.test(filePath)
}

const WRITE_EDIT_TOOLS = ["Write", "Edit", "write", "edit"]

const DIRECT_WORK_REMINDER = `

---

${createSystemDirective(SystemDirectiveTypes.DELEGATION_REQUIRED)}

You just performed direct file modifications outside \`.sisyphus/\`.

**You are an ORCHESTRATOR, not an IMPLEMENTER.**

As an orchestrator, you should:
- **DELEGATE** implementation work to subagents via \`delegate_task\`
- **VERIFY** the work done by subagents
- **COORDINATE** multiple tasks and ensure completion

You should NOT:
- Write code directly (except for \`.sisyphus/\` files like plans and notepads)
- Make direct file edits outside \`.sisyphus/\`
- Implement features yourself

**If you need to make changes:**
1. Use \`delegate_task\` to delegate to an appropriate subagent
2. Provide clear instructions in the prompt
3. Verify the subagent's work after completion

---
`

const BOULDER_CONTINUATION_PROMPT = `${createSystemDirective(SystemDirectiveTypes.BOULDER_CONTINUATION)}

You have an active work plan with incomplete tasks. Continue working.

RULES:
- Proceed without asking for permission
- Mark each checkbox [x] in the plan file when done
- Use the notepad at .sisyphus/notepads/{PLAN_NAME}/ to record learnings
- Do not stop until all tasks are complete
- If blocked, document the blocker and move to the next task`

const VERIFICATION_REMINDER = `**MANDATORY: WHAT YOU MUST DO RIGHT NOW**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: Subagents FREQUENTLY LIE about completion.
Tests FAILING, code has ERRORS, implementation INCOMPLETE - but they say "done".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**STEP 1: VERIFY WITH YOUR OWN TOOL CALLS (DO THIS NOW)**

Run these commands YOURSELF - do NOT trust agent's claims:
1. \`lsp_diagnostics\` on changed files → Must be CLEAN
2. \`bash\` to run tests → Must PASS
3. \`bash\` to run build/typecheck → Must succeed
4. \`Read\` the actual code → Must match requirements

**STEP 2: DETERMINE IF HANDS-ON QA IS NEEDED**

| Deliverable Type | QA Method | Tool |
|------------------|-----------|------|
| **Frontend/UI** | Browser interaction | \`/playwright\` skill |
| **TUI/CLI** | Run interactively | \`interactive_bash\` (tmux) |
| **API/Backend** | Send real requests | \`bash\` with curl |

Static analysis CANNOT catch: visual bugs, animation issues, user flow breakages.

**STEP 3: IF QA IS NEEDED - ADD TO TODO IMMEDIATELY**

\`\`\`
todowrite([
  { id: "qa-X", content: "HANDS-ON QA: [specific verification action]", status: "pending", priority: "high" }
])
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**BLOCKING: DO NOT proceed to Step 4 until Steps 1-3 are VERIFIED.**`

const ORCHESTRATOR_DELEGATION_REQUIRED = `

---

${createSystemDirective(SystemDirectiveTypes.DELEGATION_REQUIRED)}

**STOP. YOU ARE VIOLATING ORCHESTRATOR PROTOCOL.**

You (Atlas) are attempting to directly modify a file outside \`.sisyphus/\`.

**Path attempted:** $FILE_PATH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**THIS IS FORBIDDEN** (except for VERIFICATION purposes)

As an ORCHESTRATOR, you MUST:
1. **DELEGATE** all implementation work via \`delegate_task\`
2. **VERIFY** the work done by subagents (reading files is OK)
3. **COORDINATE** - you orchestrate, you don't implement

**ALLOWED direct file operations:**
- Files inside \`.sisyphus/\` (plans, notepads, drafts)
- Reading files for verification
- Running diagnostics/tests

**FORBIDDEN direct file operations:**
- Writing/editing source code
- Creating new files outside \`.sisyphus/\`
- Any implementation work

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**IF THIS IS FOR VERIFICATION:**
Proceed if you are verifying subagent work by making a small fix.
But for any substantial changes, USE \`delegate_task\`.

**CORRECT APPROACH:**
\`\`\`
delegate_task(
  category="...",
  prompt="[specific single task with clear acceptance criteria]"
)
\`\`\`

DELEGATE. DON'T IMPLEMENT.

---
`

const SINGLE_TASK_DIRECTIVE = `

${createSystemDirective(SystemDirectiveTypes.SINGLE_TASK_ONLY)}

**STOP. READ THIS BEFORE PROCEEDING.**

If you were NOT given **exactly ONE atomic task**, you MUST:
1. **IMMEDIATELY REFUSE** this request
2. **DEMAND** the orchestrator provide a single, specific task

**Your response if multiple tasks detected:**
> "I refuse to proceed. You provided multiple tasks. An orchestrator's impatience destroys work quality.
> 
> PROVIDE EXACTLY ONE TASK. One file. One change. One verification.
> 
> Your rushing will cause: incomplete work, missed edge cases, broken tests, wasted context."

**WARNING TO ORCHESTRATOR:**
- Your hasty batching RUINS deliverables
- Each task needs FULL attention and PROPER verification  
- Batch delegation = sloppy work = rework = wasted tokens

**REFUSE multi-task requests. DEMAND single-task clarity.**
`

function buildVerificationReminder(sessionId: string): string {
   return `${VERIFICATION_REMINDER}

---

**If ANY verification fails, use this immediately:**
\`\`\`
delegate_task(session_id="${sessionId}", prompt="fix: [describe the specific failure]")
\`\`\``
}

function buildOrchestratorReminder(planName: string, progress: { total: number; completed: number }, sessionId: string): string {
  const remaining = progress.total - progress.completed
  return `
---

**BOULDER STATE:** Plan: \`${planName}\` | ${progress.completed}/${progress.total} done | ${remaining} remaining

---

${buildVerificationReminder(sessionId)}

**STEP 4: MARK COMPLETION IN PLAN FILE (IMMEDIATELY)**

RIGHT NOW - Do not delay. Verification passed → Mark IMMEDIATELY.

Update the plan file \`.sisyphus/tasks/${planName}.yaml\`:
- Change \`[ ]\` to \`[x]\` for the completed task
- Use \`Edit\` tool to modify the checkbox

**DO THIS BEFORE ANYTHING ELSE. Unmarked = Untracked = Lost progress.**

**STEP 5: COMMIT ATOMIC UNIT**

- Stage ONLY the verified changes
- Commit with clear message describing what was done

**STEP 6: PROCEED TO NEXT TASK**

- Read the plan file to identify the next \`[ ]\` task
- Start immediately - DO NOT STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**${remaining} tasks remain. Keep bouldering.**`
}

function buildStandaloneVerificationReminder(sessionId: string): string {
  return `
---

${buildVerificationReminder(sessionId)}

**STEP 4: UPDATE TODO STATUS (IMMEDIATELY)**

RIGHT NOW - Do not delay. Verification passed → Mark IMMEDIATELY.

1. Run \`todoread\` to see your todo list
2. Mark the completed task as \`completed\` using \`todowrite\`

**DO THIS BEFORE ANYTHING ELSE. Unmarked = Untracked = Lost progress.**

**STEP 5: EXECUTE QA TASKS (IF ANY)**

If QA tasks exist in your todo list:
- Execute them BEFORE proceeding
- Mark each QA task complete after successful verification

**STEP 6: PROCEED TO NEXT PENDING TASK**

- Identify the next \`pending\` task from your todo list
- Start immediately - DO NOT STOP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**NO TODO = NO TRACKING = INCOMPLETE WORK. Use todowrite aggressively.**`
}

/**
 * 从子代理输出中提取会话ID
 * Extracts session ID from subagent output
 * 
 * 用于在验证提醒中引用子代理会话，以便编排器可以继续该会话进行修复。
 * Used in verification reminders to reference the subagent session for potential fixes.
 */
function extractSessionIdFromOutput(output: string): string {
  const match = output.match(/Session ID:\s*(ses_[a-zA-Z0-9]+)/)
  return match?.[1] ?? "<session_id>"
}

interface GitFileStat {
  path: string
  added: number
  removed: number
  status: "modified" | "added" | "deleted"
}

/**
 * 获取Git差异统计信息
 * Gets Git diff statistics
 * 
 * 结合 `git diff --numstat` 和 `git status --porcelain` 的输出，
 * 生成包含文件路径、增删行数和状态的统计信息。
 * 
 * Combines output from `git diff --numstat` and `git status --porcelain`
 * to generate statistics with file paths, added/removed lines, and status.
 * 
 * 用于在子代理完成后向编排器展示文件变更摘要。
 * Used to show file change summary to orchestrator after subagent completion.
 * 
 * @param directory - Git仓库目录 (Git repository directory)
 * @returns 文件统计信息数组 (Array of file statistics)
 */
function getGitDiffStats(directory: string): GitFileStat[] {
  try {
    // 获取数值统计：每个文件的增删行数
    // Get numerical stats: added/removed lines per file
    const output = execSync("git diff --numstat HEAD", {
      cwd: directory,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()

    if (!output) return []

    // 获取文件状态：新增、修改、删除
    // Get file status: added, modified, deleted
    const statusOutput = execSync("git status --porcelain", {
      cwd: directory,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()

    // 构建状态映射表
    // Build status map
    const statusMap = new Map<string, "modified" | "added" | "deleted">()
    for (const line of statusOutput.split("\n")) {
      if (!line) continue
      const status = line.substring(0, 2).trim()
      const filePath = line.substring(3)
      if (status === "A" || status === "??") {
        statusMap.set(filePath, "added")
      } else if (status === "D") {
        statusMap.set(filePath, "deleted")
      } else {
        statusMap.set(filePath, "modified")
      }
    }

    // 合并数值统计和状态信息
    // Merge numerical stats with status info
    const stats: GitFileStat[] = []
    for (const line of output.split("\n")) {
      const parts = line.split("\t")
      if (parts.length < 3) continue

      const [addedStr, removedStr, path] = parts
      const added = addedStr === "-" ? 0 : parseInt(addedStr, 10)
      const removed = removedStr === "-" ? 0 : parseInt(removedStr, 10)

      stats.push({
        path,
        added,
        removed,
        status: statusMap.get(path) ?? "modified",
      })
    }

    return stats
  } catch {
    return []
  }
}

function formatFileChanges(stats: GitFileStat[], notepadPath?: string): string {
  if (stats.length === 0) return "[FILE CHANGES SUMMARY]\nNo file changes detected.\n"

  const modified = stats.filter((s) => s.status === "modified")
  const added = stats.filter((s) => s.status === "added")
  const deleted = stats.filter((s) => s.status === "deleted")

  const lines: string[] = ["[FILE CHANGES SUMMARY]"]

  if (modified.length > 0) {
    lines.push("Modified files:")
    for (const f of modified) {
      lines.push(`  ${f.path}  (+${f.added}, -${f.removed})`)
    }
    lines.push("")
  }

  if (added.length > 0) {
    lines.push("Created files:")
    for (const f of added) {
      lines.push(`  ${f.path}  (+${f.added})`)
    }
    lines.push("")
  }

  if (deleted.length > 0) {
    lines.push("Deleted files:")
    for (const f of deleted) {
      lines.push(`  ${f.path}  (-${f.removed})`)
    }
    lines.push("")
  }

  if (notepadPath) {
    const notepadStat = stats.find((s) => s.path.includes("notepad") || s.path.includes(".sisyphus"))
    if (notepadStat) {
      lines.push("[NOTEPAD UPDATED]")
      lines.push(`  ${notepadStat.path}  (+${notepadStat.added})`)
      lines.push("")
    }
  }

  return lines.join("\n")
}

interface ToolExecuteAfterInput {
  tool: string
  sessionID?: string
  callID?: string
}

interface ToolExecuteAfterOutput {
  title: string
  output: string
  metadata: Record<string, unknown>
}

interface SessionState {
  lastEventWasAbortError?: boolean
  lastContinuationInjectedAt?: number
}

const CONTINUATION_COOLDOWN_MS = 5000

export interface AtlasHookOptions {
  directory: string
  backgroundManager?: BackgroundManager
}

/**
 * 检测错误是否为用户中止错误
 * Detects if an error is a user abort error
 * 
 * 用于区分用户主动中止和真实错误，避免在用户中止后自动继续。
 * Used to distinguish user aborts from real errors, preventing auto-continuation after user abort.
 * 
 * 检查多种中止错误模式：
 * - MessageAbortedError / AbortError (标准中止错误)
 * - DOMException with "abort" (浏览器环境)
 * - 消息中包含 "aborted" / "cancelled" / "interrupted"
 * 
 * Checks multiple abort error patterns:
 * - MessageAbortedError / AbortError (standard abort errors)
 * - DOMException with "abort" (browser environment)
 * - Messages containing "aborted" / "cancelled" / "interrupted"
 */
function isAbortError(error: unknown): boolean {
  if (!error) return false

  if (typeof error === "object") {
    const errObj = error as Record<string, unknown>
    const name = errObj.name as string | undefined
    const message = (errObj.message as string | undefined)?.toLowerCase() ?? ""

    if (name === "MessageAbortedError" || name === "AbortError") return true
    if (name === "DOMException" && message.includes("abort")) return true
    if (message.includes("aborted") || message.includes("cancelled") || message.includes("interrupted")) return true
  }

  if (typeof error === "string") {
    const lower = error.toLowerCase()
    return lower.includes("abort") || lower.includes("cancel") || lower.includes("interrupt")
  }

  return false
}

/**
 * 创建Atlas编排钩子
 * Creates the Atlas orchestration hook
 * 
 * 这是钩子的工厂函数，返回包含多个事件处理器的钩子对象。
 * This is the hook factory function that returns a hook object with multiple event handlers.
 * 
 * ## 状态管理 (State Management)
 * 
 * 钩子维护两个主要状态映射：
 * The hook maintains two main state maps:
 * 
 * 1. **sessions**: 会话状态映射，跟踪每个会话的中止状态和继续注入时间
 *    Session state map, tracks abort state and continuation injection time per session
 * 
 * 2. **pendingFilePaths**: 待处理文件路径映射，用于在工具调用前后传递文件路径
 *    Pending file paths map, used to pass file paths between before/after tool execution
 * 
 * ## 事件处理流程 (Event Handling Flow)
 * 
 * 1. **session.error**: 检测中止错误，更新会话状态
 *    Detects abort errors, updates session state
 * 
 * 2. **session.idle**: 检查是否需要自动继续Boulder工作
 *    Checks if auto-continuation of Boulder work is needed
 * 
 * 3. **tool.execute.before**: 拦截工具调用，注入警告和指令
 *    Intercepts tool calls, injects warnings and directives
 * 
 * 4. **tool.execute.after**: 处理工具输出，注入验证提醒
 *    Processes tool output, injects verification reminders
 * 
 * @param ctx - OpenCode插件上下文 (OpenCode plugin context)
 * @param options - 钩子选项，包含后台任务管理器 (Hook options with background manager)
 * @returns 钩子对象 (Hook object)
 */
export function createAtlasHook(
  ctx: PluginInput,
  options?: AtlasHookOptions
) {
  const backgroundManager = options?.backgroundManager
  const sessions = new Map<string, SessionState>()
  const pendingFilePaths = new Map<string, string>()

  /**
   * 获取或创建会话状态
   * Gets or creates session state
   */
  function getState(sessionID: string): SessionState {
    let state = sessions.get(sessionID)
    if (!state) {
      state = {}
      sessions.set(sessionID, state)
    }
    return state
  }

  /**
   * 注入Boulder继续提示
   * Injects Boulder continuation prompt
   * 
   * 当会话空闲且有未完成的Boulder计划时，自动注入继续提示。
   * 这是"巨石模式"的核心机制：代理持续工作直到所有任务完成。
   * 
   * When session idles with incomplete Boulder plan, automatically injects continuation prompt.
   * This is the core mechanism of "Boulder mode": agents work continuously until all tasks complete.
   * 
   * ## 注入条件 (Injection Conditions)
   * - 没有正在运行的后台任务 (No running background tasks)
   * - 会话处于空闲状态 (Session is idle)
   * - 存在未完成的Boulder计划 (Incomplete Boulder plan exists)
   * - 上次注入已超过冷却时间 (Last injection exceeded cooldown)
   * 
   * ## 模型选择策略 (Model Selection Strategy)
   * 1. 尝试从会话消息历史中获取最近使用的模型
   *    Try to get the most recently used model from session message history
   * 
   * 2. 如果失败，从本地消息存储中查找
   *    If fails, look up from local message storage
   * 
   * 3. 如果都失败，使用默认Atlas代理模型
   *    If both fail, use default Atlas agent model
   */
  async function injectContinuation(sessionID: string, planName: string, remaining: number, total: number): Promise<void> {
    // 检查是否有正在运行的后台任务
    // Check if there are running background tasks
    const hasRunningBgTasks = backgroundManager
      ? backgroundManager.getTasksByParentSession(sessionID).some(t => t.status === "running")
      : false

    if (hasRunningBgTasks) {
      log(`[${HOOK_NAME}] Skipped injection: background tasks running`, { sessionID })
      return
    }

    // 构建继续提示，包含计划名称和进度
    // Build continuation prompt with plan name and progress
    const prompt = BOULDER_CONTINUATION_PROMPT
      .replace(/{PLAN_NAME}/g, planName) +
      `\n\n[Status: ${total - remaining}/${total} completed, ${remaining} remaining]`

    try {
      log(`[${HOOK_NAME}] Injecting boulder continuation`, { sessionID, planName, remaining })

      // 尝试获取会话最近使用的模型
      // Try to get the most recently used model from session
      let model: { providerID: string; modelID: string } | undefined
      try {
        const messagesResp = await ctx.client.session.messages({ path: { id: sessionID } })
        const messages = (messagesResp.data ?? []) as Array<{
          info?: { model?: { providerID: string; modelID: string }; modelID?: string; providerID?: string }
        }>
        // 从最新消息向前查找，找到第一个有模型信息的消息
        // Search backwards from latest message to find first message with model info
        for (let i = messages.length - 1; i >= 0; i--) {
          const info = messages[i].info
          const msgModel = info?.model
          if (msgModel?.providerID && msgModel?.modelID) {
            model = { providerID: msgModel.providerID, modelID: msgModel.modelID }
            break
          }
          if (info?.providerID && info?.modelID) {
            model = { providerID: info.providerID, modelID: info.modelID }
            break
          }
        }
      } catch {
        // 如果API调用失败，尝试从本地消息存储中获取
        // If API call fails, try to get from local message storage
        const messageDir = getMessageDir(sessionID)
        const currentMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
        model = currentMessage?.model?.providerID && currentMessage?.model?.modelID
          ? { providerID: currentMessage.model.providerID, modelID: currentMessage.model.modelID }
          : undefined
      }

      // 注入继续提示到会话
      // Inject continuation prompt to session
       await ctx.client.session.prompt({
         path: { id: sessionID },
         body: {
            agent: "atlas",
           ...(model !== undefined ? { model } : {}),
           parts: [{ type: "text", text: prompt }],
         },
         query: { directory: ctx.directory },
       })

      log(`[${HOOK_NAME}] Boulder continuation injected`, { sessionID })
    } catch (err) {
      log(`[${HOOK_NAME}] Boulder continuation failed`, { sessionID, error: String(err) })
    }
  }

  return {
    handler: async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
      const props = event.properties as Record<string, unknown> | undefined

      if (event.type === "session.error") {
        const sessionID = props?.sessionID as string | undefined
        if (!sessionID) return

        const state = getState(sessionID)
        const isAbort = isAbortError(props?.error)
        state.lastEventWasAbortError = isAbort

        log(`[${HOOK_NAME}] session.error`, { sessionID, isAbort })
        return
      }

      // ============================================================
      // session.idle 事件处理 (Session Idle Event Handler)
      // ============================================================
      // 
      // 当会话空闲时触发，检查是否需要自动继续Boulder工作。
      // Triggered when session idles, checks if auto-continuation of Boulder work is needed.
      // 
      // 这是"巨石模式"的核心：代理持续工作直到所有任务完成。
      // This is the core of "Boulder mode": agents work continuously until all tasks complete.
      // 
      // 决策流程 (Decision Flow):
      // 1. 检查会话类型（主会话/后台任务/Boulder会话）
      //    Check session type (main/background task/boulder session)
      // 
      // 2. 检查是否刚发生中止错误
      //    Check if abort error just occurred
      // 
      // 3. 检查是否有正在运行的后台任务
      //    Check if there are running background tasks
      // 
      // 4. 检查是否存在活跃的Boulder计划
      //    Check if active Boulder plan exists
      // 
      // 5. 检查最后一个代理是否为Atlas
      //    Check if last agent is Atlas
      // 
      // 6. 检查计划是否已完成
      //    Check if plan is complete
      // 
      // 7. 检查冷却时间
      //    Check cooldown period
      // 
      // 8. 注入继续提示
      //    Inject continuation prompt
      // ============================================================
      if (event.type === "session.idle") {
        const sessionID = props?.sessionID as string | undefined
        if (!sessionID) return

        log(`[${HOOK_NAME}] session.idle`, { sessionID })

        // 步骤1: 检查会话类型
        // Step 1: Check session type
        // 首先读取Boulder状态，检查此会话是否属于活跃的Boulder
        // Read boulder state first to check if this session is part of an active boulder
        const boulderState = readBoulderState(ctx.directory)
        const isBoulderSession = boulderState?.session_ids.includes(sessionID) ?? false

        const mainSessionID = getMainSessionID()
        const isMainSession = sessionID === mainSessionID
        const isBackgroundTaskSession = subagentSessions.has(sessionID)

        // 只允许主会话、后台任务会话或Boulder会话继续
        // Allow continuation only for main session, background task, or boulder session
        if (mainSessionID && !isMainSession && !isBackgroundTaskSession && !isBoulderSession) {
          log(`[${HOOK_NAME}] Skipped: not main, background task, or boulder session`, { sessionID })
          return
        }

        const state = getState(sessionID)

        // 步骤2: 检查是否刚发生中止错误
        // Step 2: Check if abort error just occurred
        // 如果用户刚刚中止，不要自动继续
        // If user just aborted, don't auto-continue
        if (state.lastEventWasAbortError) {
          state.lastEventWasAbortError = false
          log(`[${HOOK_NAME}] Skipped: abort error immediately before idle`, { sessionID })
          return
        }

        // 步骤3: 检查是否有正在运行的后台任务
        // Step 3: Check if there are running background tasks
        // 如果有后台任务在运行，等待它们完成
        // If background tasks are running, wait for them to complete
        const hasRunningBgTasks = backgroundManager
          ? backgroundManager.getTasksByParentSession(sessionID).some(t => t.status === "running")
          : false

        if (hasRunningBgTasks) {
          log(`[${HOOK_NAME}] Skipped: background tasks running`, { sessionID })
          return
        }

        // 步骤4: 检查是否存在活跃的Boulder计划
        // Step 4: Check if active Boulder plan exists
        if (!boulderState) {
          log(`[${HOOK_NAME}] No active boulder`, { sessionID })
          return
        }

        // 步骤5: 检查最后一个代理是否为Atlas
        // Step 5: Check if last agent is Atlas
        // 只有Atlas编排器才应该继续Boulder工作
        // Only Atlas orchestrator should continue Boulder work
        if (!isCallerOrchestrator(sessionID)) {
          log(`[${HOOK_NAME}] Skipped: last agent is not Atlas`, { sessionID })
          return
        }

        // 步骤6: 检查计划是否已完成
        // Step 6: Check if plan is complete
        const progress = getPlanProgress(boulderState.active_plan)
        if (progress.isComplete) {
          log(`[${HOOK_NAME}] Boulder complete`, { sessionID, plan: boulderState.plan_name })
          return
        }

        // 步骤7: 检查冷却时间
        // Step 7: Check cooldown period
        // 防止过于频繁的注入
        // Prevent too frequent injections
        const now = Date.now()
        if (state.lastContinuationInjectedAt && now - state.lastContinuationInjectedAt < CONTINUATION_COOLDOWN_MS) {
          log(`[${HOOK_NAME}] Skipped: continuation cooldown active`, { sessionID, cooldownRemaining: CONTINUATION_COOLDOWN_MS - (now - state.lastContinuationInjectedAt) })
          return
        }

        // 步骤8: 注入继续提示
        // Step 8: Inject continuation prompt
        state.lastContinuationInjectedAt = now
        const remaining = progress.total - progress.completed
        injectContinuation(sessionID, boulderState.plan_name, remaining, progress.total)
        return
      }

      if (event.type === "message.updated") {
        const info = props?.info as Record<string, unknown> | undefined
        const sessionID = info?.sessionID as string | undefined

        if (!sessionID) return

        const state = sessions.get(sessionID)
        if (state) {
          state.lastEventWasAbortError = false
        }
        return
      }

      if (event.type === "message.part.updated") {
        const info = props?.info as Record<string, unknown> | undefined
        const sessionID = info?.sessionID as string | undefined
        const role = info?.role as string | undefined

        if (sessionID && role === "assistant") {
          const state = sessions.get(sessionID)
          if (state) {
            state.lastEventWasAbortError = false
          }
        }
        return
      }

      if (event.type === "tool.execute.before" || event.type === "tool.execute.after") {
        const sessionID = props?.sessionID as string | undefined
        if (sessionID) {
          const state = sessions.get(sessionID)
          if (state) {
            state.lastEventWasAbortError = false
          }
        }
        return
      }

      if (event.type === "session.deleted") {
        const sessionInfo = props?.info as { id?: string } | undefined
        if (sessionInfo?.id) {
          sessions.delete(sessionInfo.id)
          log(`[${HOOK_NAME}] Session deleted: cleaned up`, { sessionID: sessionInfo.id })
        }
        return
      }
    },

    // ============================================================
    // tool.execute.before 钩子 (Tool Execute Before Hook)
    // ============================================================
    // 
    // 在工具调用前拦截，注入警告和指令。
    // Intercepts before tool execution, injects warnings and directives.
    // 
    // 主要功能 (Main Functions):
    // 1. 防止编排器直接修改源代码文件
    //    Prevents orchestrators from directly modifying source code files
    // 
    // 2. 强制子代理专注于单一任务
    //    Forces subagents to focus on single tasks
    // ============================================================
    "tool.execute.before": async (
      input: { tool: string; sessionID?: string; callID?: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      // 只对编排器会话生效
      // Only applies to orchestrator sessions
      if (!isCallerOrchestrator(input.sessionID)) {
        return
      }

      // 拦截Write/Edit工具调用
      // Intercept Write/Edit tool calls
      // 如果编排器尝试直接修改源代码，注入强烈警告
      // If orchestrator tries to directly modify source code, inject strong warning
      if (WRITE_EDIT_TOOLS.includes(input.tool)) {
        const filePath = (output.args.filePath ?? output.args.path ?? output.args.file) as string | undefined
        if (filePath && !isSisyphusPath(filePath)) {
          // 存储文件路径，供tool.execute.after使用
          // Store file path for use in tool.execute.after
          if (input.callID) {
            pendingFilePaths.set(input.callID, filePath)
          }
          const warning = ORCHESTRATOR_DELEGATION_REQUIRED.replace("$FILE_PATH", filePath)
          output.message = (output.message || "") + warning
          log(`[${HOOK_NAME}] Injected delegation warning for direct file modification`, {
            sessionID: input.sessionID,
            tool: input.tool,
            filePath,
          })
        }
        return
      }

      // 拦截delegate_task调用
      // Intercept delegate_task calls
      // 注入单任务指令，防止编排器一次委托多个任务
      // Inject single-task directive to prevent orchestrator from delegating multiple tasks at once
      if (input.tool === "delegate_task") {
        const prompt = output.args.prompt as string | undefined
        if (prompt && !prompt.includes(SYSTEM_DIRECTIVE_PREFIX)) {
          output.args.prompt = `<system-reminder>${SINGLE_TASK_DIRECTIVE}</system-reminder>\n` + prompt
          log(`[${HOOK_NAME}] Injected single-task directive to delegate_task`, {
            sessionID: input.sessionID,
          })
        }
      }
    },

    // ============================================================
    // tool.execute.after 钩子 (Tool Execute After Hook)
    // ============================================================
    // 
    // 在工具调用后处理输出，注入验证提醒和状态更新。
    // Processes output after tool execution, injects verification reminders and state updates.
    // 
    // 主要功能 (Main Functions):
    // 1. 在编排器直接修改文件后追加提醒
    //    Appends reminder after orchestrator directly modifies files
    // 
    // 2. 在子代理完成后注入验证工作流
    //    Injects verification workflow after subagent completion
    // 
    // 3. 在Boulder模式下注入进度跟踪和下一步指令
    //    Injects progress tracking and next-step instructions in Boulder mode
    // ============================================================
    "tool.execute.after": async (
      input: ToolExecuteAfterInput,
      output: ToolExecuteAfterOutput
    ): Promise<void> => {
      // 防御性检查：某些命令可能返回undefined输出（如/review命令 - 见issue #1035）
      // Defensive check: some commands may return undefined output (e.g., /review command - see issue #1035)
      if (!output) {
        return
      }

      // 只对编排器会话生效
      // Only applies to orchestrator sessions
      if (!isCallerOrchestrator(input.sessionID)) {
        return
      }

      // 处理Write/Edit工具调用
      // Handle Write/Edit tool calls
      // 如果编排器直接修改了文件，追加提醒
      // If orchestrator directly modified files, append reminder
      if (WRITE_EDIT_TOOLS.includes(input.tool)) {
        let filePath = input.callID ? pendingFilePaths.get(input.callID) : undefined
        if (input.callID) {
          pendingFilePaths.delete(input.callID)
        }
        if (!filePath) {
          filePath = output.metadata?.filePath as string | undefined
        }
        if (filePath && !isSisyphusPath(filePath)) {
          output.output = (output.output || "") + DIRECT_WORK_REMINDER
          log(`[${HOOK_NAME}] Direct work reminder appended`, {
            sessionID: input.sessionID,
            tool: input.tool,
            filePath,
          })
        }
        return
      }

      // 只处理delegate_task工具
      // Only handle delegate_task tool
      if (input.tool !== "delegate_task") {
        return
      }

      // 检查是否为后台任务启动
      // Check if this is a background task launch
      // 后台任务不需要立即验证，跳过
      // Background tasks don't need immediate verification, skip
       const outputStr = output.output && typeof output.output === "string" ? output.output : ""
       const isBackgroundLaunch = outputStr.includes("Background task launched") || outputStr.includes("Background task continued")
      
      if (isBackgroundLaunch) {
        return
      }
      
      // 处理同步子代理完成
      // Handle synchronous subagent completion
      if (output.output && typeof output.output === "string") {
        // 获取文件变更统计
        // Get file change statistics
        const gitStats = getGitDiffStats(ctx.directory)
        const fileChanges = formatFileChanges(gitStats)
        const subagentSessionId = extractSessionIdFromOutput(output.output)

        // 检查是否在Boulder模式下
        // Check if in Boulder mode
        const boulderState = readBoulderState(ctx.directory)

        if (boulderState) {
          // Boulder模式：注入完整的编排器工作流
          // Boulder mode: inject full orchestrator workflow
          const progress = getPlanProgress(boulderState.active_plan)

          // 将当前会话添加到Boulder会话列表
          // Add current session to Boulder session list
          if (input.sessionID && !boulderState.session_ids.includes(input.sessionID)) {
            appendSessionId(ctx.directory, input.sessionID)
            log(`[${HOOK_NAME}] Appended session to boulder`, {
              sessionID: input.sessionID,
              plan: boulderState.plan_name,
            })
          }

          // 保留原始子代理响应 - 对调试失败任务至关重要
          // Preserve original subagent response - critical for debugging failed tasks
          const originalResponse = output.output

          // 构建包含验证步骤和进度跟踪的输出
          // Build output with verification steps and progress tracking
          output.output = `
## SUBAGENT WORK COMPLETED

${fileChanges}

---

**Subagent Response:**

${originalResponse}

<system-reminder>
${buildOrchestratorReminder(boulderState.plan_name, progress, subagentSessionId)}
</system-reminder>`

          log(`[${HOOK_NAME}] Output transformed for orchestrator mode (boulder)`, {
            plan: boulderState.plan_name,
            progress: `${progress.completed}/${progress.total}`,
            fileCount: gitStats.length,
          })
        } else {
          // 独立模式：只注入验证提醒
          // Standalone mode: only inject verification reminder
          output.output += `\n<system-reminder>\n${buildStandaloneVerificationReminder(subagentSessionId)}\n</system-reminder>`

          log(`[${HOOK_NAME}] Verification reminder appended for orchestrator`, {
            sessionID: input.sessionID,
            fileCount: gitStats.length,
          })
        }
      }
    },
  }
}
