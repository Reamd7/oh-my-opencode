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

你刚刚在 \`.sisyphus/\` 目录外执行了直接文件修改。

**你是编排器，不是实现者。**

作为编排器，你应该：
- **委托** 实现工作给子代理，通过 \`delegate_task\`
- **验证** 子代理完成的工作
- **协调** 多个任务并确保完成

你不应该：
- 直接编写代码（除了 \`.sisyphus/\` 文件，如计划和笔记）
- 在 \`.sisyphus/\` 外直接编辑文件
- 自己实现功能

**如果你需要进行更改：**
1. 使用 \`delegate_task\` 委托给合适的子代理
2. 在提示词中提供清晰的指令
3. 完成后验证子代理的工作

---
`

const BOULDER_CONTINUATION_PROMPT = `${createSystemDirective(SystemDirectiveTypes.BOULDER_CONTINUATION)}

你有一个活跃的工作计划，其中包含未完成的任务。继续工作。

规则：
- 无需请求许可即可继续
- 完成后在计划文件中标记每个复选框 [x]
- 使用 .sisyphus/notepads/{PLAN_NAME}/ 的笔记本记录学习内容
- 在所有任务完成前不要停止
- 如果被阻塞，记录阻塞原因并转到下一个任务`

const VERIFICATION_REMINDER = `**强制要求：你现在必须做的事情**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

关键：子代理经常谎报完成情况。
测试失败、代码有错误、实现不完整 - 但他们说"完成了"。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**步骤 1：使用你自己的工具调用进行验证（现在就做）**

自己运行这些命令 - 不要相信代理的声明：
1. 对修改的文件运行 \`lsp_diagnostics\` → 必须干净
2. 运行 \`bash\` 执行测试 → 必须通过
3. 运行 \`bash\` 执行构建/类型检查 → 必须成功
4. \`Read\` 实际代码 → 必须符合需求

**步骤 2：确定是否需要实际操作 QA**

| 交付物类型 | QA 方法 | 工具 |
|------------------|-----------|------|
| **前端/UI** | 浏览器交互 | \`/playwright\` 技能 |
| **TUI/CLI** | 交互式运行 | \`interactive_bash\` (tmux) |
| **API/后端** | 发送真实请求 | \`bash\` 配合 curl |

静态分析无法捕获：视觉错误、动画问题、用户流程中断。

**步骤 3：如果需要 QA - 立即添加到待办列表**

\`\`\`
todowrite([
  { id: "qa-X", content: "实际操作 QA：[具体验证操作]", status: "pending", priority: "high" }
])
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**阻塞：在步骤 1-3 验证完成前，不要继续步骤 4。**`

const ORCHESTRATOR_DELEGATION_REQUIRED = `

---

${createSystemDirective(SystemDirectiveTypes.DELEGATION_REQUIRED)}

**停止。你正在违反编排器协议。**

你（Atlas）正在尝试直接修改 \`.sisyphus/\` 外的文件。

**尝试的路径：** $FILE_PATH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**这是被禁止的**（除了验证目的）

作为编排器，你必须：
1. **委托** 所有实现工作，通过 \`delegate_task\`
2. **验证** 子代理完成的工作（读取文件是允许的）
3. **协调** - 你编排，你不实现

**允许的直接文件操作：**
- \`.sisyphus/\` 内的文件（计划、笔记、草稿）
- 为验证目的读取文件
- 运行诊断/测试

**禁止的直接文件操作：**
- 编写/编辑源代码
- 在 \`.sisyphus/\` 外创建新文件
- 任何实现工作

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**如果这是为了验证：**
如果你正在通过小修复来验证子代理的工作，可以继续。
但对于任何实质性更改，使用 \`delegate_task\`。

**正确的方法：**
\`\`\`
delegate_task(
  category="...",
  prompt="[具体的单一任务，带有明确的验收标准]"
)
\`\`\`

委托。不要实现。

---
`

const SINGLE_TASK_DIRECTIVE = `

${createSystemDirective(SystemDirectiveTypes.SINGLE_TASK_ONLY)}

**停止。在继续之前阅读此内容。**

如果你没有收到**恰好一个原子任务**，你必须：
1. **立即拒绝**此请求
2. **要求**编排器提供单一、具体的任务

**如果检测到多个任务，你的响应：**
> "我拒绝继续。你提供了多个任务。编排器的不耐烦会破坏工作质量。
> 
> 提供恰好一个任务。一个文件。一个更改。一个验证。
> 
> 你的急躁会导致：工作不完整、遗漏边缘情况、测试中断、上下文浪费。"

**对编排器的警告：**
- 你的匆忙批处理会毁掉交付物
- 每个任务都需要充分的关注和适当的验证
- 批量委托 = 草率工作 = 返工 = token 浪费

**拒绝多任务请求。要求单任务清晰度。**
`

function buildVerificationReminder(sessionId: string): string {
   return `${VERIFICATION_REMINDER}

---

**如果任何验证失败，立即使用此方法：**
\`\`\`
delegate_task(session_id="${sessionId}", prompt="修复：[描述具体失败]")
\`\`\``
}

function buildOrchestratorReminder(planName: string, progress: { total: number; completed: number }, sessionId: string): string {
  const remaining = progress.total - progress.completed
  return `
---

**巨石状态：** 计划：\`${planName}\` | ${progress.completed}/${progress.total} 完成 | ${remaining} 剩余

---

${buildVerificationReminder(sessionId)}

**步骤 4：在计划文件中标记完成（立即）**

现在就做 - 不要延迟。验证通过 → 立即标记。

更新计划文件 \`.sisyphus/tasks/${planName}.yaml\`：
- 将已完成任务的 \`[ ]\` 改为 \`[x]\`
- 使用 \`Edit\` 工具修改复选框

**在做任何其他事情之前先做这个。未标记 = 未跟踪 = 进度丢失。**

**步骤 5：提交原子单元**

- 仅暂存已验证的更改
- 用清晰的消息提交，描述完成的工作

**步骤 6：继续下一个任务**

- 阅读计划文件以识别下一个 \`[ ]\` 任务
- 立即开始 - 不要停止

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**剩余 ${remaining} 个任务。继续推石头。**`
}

function buildStandaloneVerificationReminder(sessionId: string): string {
  return `
---

${buildVerificationReminder(sessionId)}

**步骤 4：更新待办状态（立即）**

现在就做 - 不要延迟。验证通过 → 立即标记。

1. 运行 \`todoread\` 查看你的待办列表
2. 使用 \`todowrite\` 将已完成的任务标记为 \`completed\`

**在做任何其他事情之前先做这个。未标记 = 未跟踪 = 进度丢失。**

**步骤 5：执行 QA 任务（如果有）**

如果你的待办列表中存在 QA 任务：
- 在继续之前执行它们
- 成功验证后标记每个 QA 任务为完成

**步骤 6：继续下一个待处理任务**

- 从你的待办列表中识别下一个 \`pending\` 任务
- 立即开始 - 不要停止

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**没有待办 = 没有跟踪 = 工作不完整。积极使用 todowrite。**`
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
  if (stats.length === 0) return "[文件变更摘要]\n未检测到文件变更。\n"

  const modified = stats.filter((s) => s.status === "modified")
  const added = stats.filter((s) => s.status === "added")
  const deleted = stats.filter((s) => s.status === "deleted")

  const lines: string[] = ["[文件变更摘要]"]

  if (modified.length > 0) {
    lines.push("修改的文件：")
    for (const f of modified) {
      lines.push(`  ${f.path}  (+${f.added}, -${f.removed})`)
    }
    lines.push("")
  }

  if (added.length > 0) {
    lines.push("创建的文件：")
    for (const f of added) {
      lines.push(`  ${f.path}  (+${f.added})`)
    }
    lines.push("")
  }

  if (deleted.length > 0) {
    lines.push("删除的文件：")
    for (const f of deleted) {
      lines.push(`  ${f.path}  (-${f.removed})`)
    }
    lines.push("")
  }

  if (notepadPath) {
    const notepadStat = stats.find((s) => s.path.includes("notepad") || s.path.includes(".sisyphus"))
    if (notepadStat) {
      lines.push("[笔记本已更新]")
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
      log(`[${HOOK_NAME}] 跳过注入：后台任务正在运行`, { sessionID })
      return
    }

    // 构建继续提示，包含计划名称和进度
    // Build continuation prompt with plan name and progress
    const prompt = BOULDER_CONTINUATION_PROMPT
      .replace(/{PLAN_NAME}/g, planName) +
      `\n\n[状态：${total - remaining}/${total} 已完成，${remaining} 剩余]`

    try {
      log(`[${HOOK_NAME}] 注入巨石继续提示`, { sessionID, planName, remaining })

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

      log(`[${HOOK_NAME}] 巨石继续提示已注入`, { sessionID })
    } catch (err) {
      log(`[${HOOK_NAME}] 巨石继续提示失败`, { sessionID, error: String(err) })
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
          log(`[${HOOK_NAME}] 跳过：不是主会话、后台任务或巨石会话`, { sessionID })
          return
        }

        const state = getState(sessionID)

        // 步骤2: 检查是否刚发生中止错误
        // Step 2: Check if abort error just occurred
        // 如果用户刚刚中止，不要自动继续
        // If user just aborted, don't auto-continue
        if (state.lastEventWasAbortError) {
          state.lastEventWasAbortError = false
          log(`[${HOOK_NAME}] 跳过：空闲前立即发生中止错误`, { sessionID })
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
          log(`[${HOOK_NAME}] 跳过：后台任务正在运行`, { sessionID })
          return
        }

        // 步骤4: 检查是否存在活跃的Boulder计划
        // Step 4: Check if active Boulder plan exists
        if (!boulderState) {
          log(`[${HOOK_NAME}] 没有活跃的巨石`, { sessionID })
          return
        }

        // 步骤5: 检查最后一个代理是否为Atlas
        // Step 5: Check if last agent is Atlas
        // 只有Atlas编排器才应该继续Boulder工作
        // Only Atlas orchestrator should continue Boulder work
        if (!isCallerOrchestrator(sessionID)) {
          log(`[${HOOK_NAME}] 跳过：最后一个代理不是 Atlas`, { sessionID })
          return
        }

        // 步骤6: 检查计划是否已完成
        // Step 6: Check if plan is complete
        const progress = getPlanProgress(boulderState.active_plan)
        if (progress.isComplete) {
          log(`[${HOOK_NAME}] 巨石完成`, { sessionID, plan: boulderState.plan_name })
          return
        }

        // 步骤7: 检查冷却时间
        // Step 7: Check cooldown period
        // 防止过于频繁的注入
        // Prevent too frequent injections
        const now = Date.now()
        if (state.lastContinuationInjectedAt && now - state.lastContinuationInjectedAt < CONTINUATION_COOLDOWN_MS) {
          log(`[${HOOK_NAME}] 跳过：继续冷却中`, { sessionID, cooldownRemaining: CONTINUATION_COOLDOWN_MS - (now - state.lastContinuationInjectedAt) })
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
          log(`[${HOOK_NAME}] 会话已删除：已清理`, { sessionID: sessionInfo.id })
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
          log(`[${HOOK_NAME}] 为直接文件修改注入委托警告`, {
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
          log(`[${HOOK_NAME}] 向 delegate_task 注入单任务指令`, {
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
          log(`[${HOOK_NAME}] 已追加直接工作提醒`, {
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
            log(`[${HOOK_NAME}] 已将会话追加到巨石`, {
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
## 子代理工作已完成

${fileChanges}

---

**子代理响应：**

${originalResponse}

<system-reminder>
${buildOrchestratorReminder(boulderState.plan_name, progress, subagentSessionId)}
</system-reminder>`

          log(`[${HOOK_NAME}] 为编排器模式（巨石）转换输出`, {
            plan: boulderState.plan_name,
            progress: `${progress.completed}/${progress.total}`,
            fileCount: gitStats.length,
          })
        } else {
          // 独立模式：只注入验证提醒
          // Standalone mode: only inject verification reminder
          output.output += `\n<system-reminder>\n${buildStandaloneVerificationReminder(subagentSessionId)}\n</system-reminder>`

          log(`[${HOOK_NAME}] 为编排器追加验证提醒`, {
            sessionID: input.sessionID,
            fileCount: gitStats.length,
          })
        }
      }
    },
  }
}
