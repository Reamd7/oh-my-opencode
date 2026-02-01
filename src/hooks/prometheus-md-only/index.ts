/**
 * Prometheus 只读模式钩子 (Prometheus Read-Only Mode Hook)
 * 
 * 强制 Prometheus 计划代理只能写入 .sisyphus/*.md 文件，防止其修改代码或其他文件。
 * Prometheus 是一个只读的计划代理，负责制定工作计划，而不是执行实现。
 * 
 * Forces Prometheus planning agent to only write .sisyphus/*.md files,
 * preventing it from modifying code or other files. Prometheus is a read-only
 * planning agent responsible for creating work plans, not executing implementation.
 * 
 * 限制规则 (Restriction rules):
 * - 只能写入/编辑 .sisyphus/ 目录下的 .md 文件 (Only write/edit .md files in .sisyphus/)
 * - 阻止使用 Write/Edit 工具修改其他文件 (Block Write/Edit tools for other files)
 * - 委托任务时注入只读警告 (Inject read-only warning when delegating tasks)
 * - 写入计划文件时提醒工作流程 (Remind workflow when writing plan files)
 * 
 * 工作流程提醒 (Workflow reminder):
 * 1. INTERVIEW: 与用户充分沟通需求 (Full consultation with user)
 * 2. METIS CONSULTATION: 计划前的差距分析 (Pre-generation gap analysis)
 * 3. PLAN GENERATION: 写入计划文件 (Write plan file)
 * 4. MOMUS REVIEW: 高精度审查（可选）(High accuracy review - optional)
 * 5. SUMMARY: 向用户展示计划 (Present plan to user)
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { existsSync, readdirSync } from "node:fs"
import { join, resolve, relative, isAbsolute } from "node:path"
import { HOOK_NAME, PROMETHEUS_AGENTS, ALLOWED_EXTENSIONS, ALLOWED_PATH_PREFIX, BLOCKED_TOOLS, PLANNING_CONSULT_WARNING, PROMETHEUS_WORKFLOW_REMINDER } from "./constants"
import { findNearestMessageWithFields, findFirstMessageWithAgent, MESSAGE_STORAGE } from "../../features/hook-message-injector"
import { getSessionAgent } from "../../features/claude-code-session-state"
import { log } from "../../shared/logger"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { getAgentDisplayName } from "../../shared/agent-display-names"

export * from "./constants"

/**
 * 跨平台路径验证器 - 验证 Prometheus 是否可以写入指定文件
 * Cross-platform path validator for Prometheus file writes
 * 
 * 处理以下情况 (Handles):
 * - Windows 反斜杠 (Windows backslashes: .sisyphus\\plans\\x.md)
 * - 混合分隔符 (Mixed separators: .sisyphus\\plans/x.md)
 * - 大小写不敏感匹配 (Case-insensitive matching)
 * - 工作区限制 (Workspace confinement - blocks path traversal)
 * - 嵌套项目路径 (Nested project paths)
 */
function isAllowedFile(filePath: string, workspaceRoot: string): boolean {
  // 1. Resolve to absolute path
  const resolved = resolve(workspaceRoot, filePath)

  // 2. Get relative path from workspace root
  const rel = relative(workspaceRoot, resolved)

  // 3. Reject if escapes root (starts with ".." or is absolute)
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return false
  }

  // 4. Check if .sisyphus/ or .sisyphus\ exists anywhere in the path (case-insensitive)
  // This handles both direct paths (.sisyphus/x.md) and nested paths (project/.sisyphus/x.md)
  if (!/\.sisyphus[/\\]/i.test(rel)) {
    return false
  }

  // 5. Check extension matches one of ALLOWED_EXTENSIONS (case-insensitive)
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some(
    ext => resolved.toLowerCase().endsWith(ext.toLowerCase())
  )
  if (!hasAllowedExtension) {
    return false
  }

  return true
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

const TASK_TOOLS = ["delegate_task", "task", "call_omo_agent"]

function getAgentFromMessageFiles(sessionID: string): string | undefined {
  const messageDir = getMessageDir(sessionID)
  if (!messageDir) return undefined
  return findFirstMessageWithAgent(messageDir) ?? findNearestMessageWithFields(messageDir)?.agent
}

function getAgentFromSession(sessionID: string): string | undefined {
  return getSessionAgent(sessionID) ?? getAgentFromMessageFiles(sessionID)
}

/**
 * 创建 Prometheus 只读模式钩子
 * Creates Prometheus read-only mode hook
 * 
 * @param ctx - 插件上下文 (Plugin context)
 * @returns 钩子对象，监听 tool.execute.before 事件 (Hook object that listens to tool.execute.before)
 */
export function createPrometheusMdOnlyHook(ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      const agentName = getAgentFromSession(input.sessionID)

      // 只对 Prometheus 代理生效 (Only apply to Prometheus agent)
      if (!agentName || !PROMETHEUS_AGENTS.includes(agentName)) {
        return
      }

      const toolName = input.tool

      // 委托任务时注入只读警告 - 防止子代理修改文件
      // Inject read-only warning for task delegation - prevent sub-agents from modifying files
       if (TASK_TOOLS.includes(toolName)) {
         const prompt = output.args.prompt as string | undefined
         if (prompt && !prompt.includes(SYSTEM_DIRECTIVE_PREFIX)) {
           output.args.prompt = PLANNING_CONSULT_WARNING + prompt
          log(`[${HOOK_NAME}] Injected read-only planning warning to ${toolName}`, {
            sessionID: input.sessionID,
            tool: toolName,
            agent: agentName,
          })
        }
        return
      }

      // 只拦截 Write/Edit 工具 (Only intercept Write/Edit tools)
      if (!BLOCKED_TOOLS.includes(toolName)) {
        return
      }

      const filePath = (output.args.filePath ?? output.args.path ?? output.args.file) as string | undefined
      if (!filePath) {
        return
      }

      // 验证文件路径：只允许 .sisyphus/*.md (Validate file path: only allow .sisyphus/*.md)
       if (!isAllowedFile(filePath, ctx.directory)) {
         log(`[${HOOK_NAME}] Blocked: Prometheus can only write to .sisyphus/*.md`, {
           sessionID: input.sessionID,
           tool: toolName,
           filePath,
           agent: agentName,
         })
         throw new Error(
           `[${HOOK_NAME}] ${getAgentDisplayName("prometheus")} can only write/edit .md files inside .sisyphus/ directory. ` +
           `Attempted to modify: ${filePath}. ` +
           `${getAgentDisplayName("prometheus")} is a READ-ONLY planner. Use /start-work to execute the plan. ` +
           `APOLOGIZE TO THE USER, REMIND OF YOUR PLAN WRITING PROCESSES, TELL USER WHAT YOU WILL GOING TO DO AS THE PROCESS, WRITE THE PLAN`
         )
       }

      // 写入计划文件时注入工作流程提醒 (Inject workflow reminder when writing plan files)
      const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/")
      if (normalizedPath.includes(".sisyphus/plans/") || normalizedPath.includes(".sisyphus\\plans\\")) {
        log(`[${HOOK_NAME}] Injecting workflow reminder for plan write`, {
          sessionID: input.sessionID,
          tool: toolName,
          filePath,
          agent: agentName,
        })
        output.message = (output.message || "") + PROMETHEUS_WORKFLOW_REMINDER
      }

      log(`[${HOOK_NAME}] Allowed: .sisyphus/*.md write permitted`, {
        sessionID: input.sessionID,
        tool: toolName,
        filePath,
        agent: agentName,
      })
    },
  }
}
