/**
 * 开始工作钩子 (Start Work Hook)
 * 
 * 处理 /start-work 命令，启动 Sisyphus 工作会话以执行 Prometheus 计划。
 * 自动检测可用计划、管理工作状态、支持计划恢复和多计划选择。
 * 
 * Handles /start-work command to start Sisyphus work session for executing
 * Prometheus plans. Automatically detects available plans, manages work state,
 * supports plan resumption and multi-plan selection.
 * 
 * 工作流程 (Workflow):
 * 1. 检测 /start-work 命令触发 (Detect /start-work command trigger)
 * 2. 查找可用的 Prometheus 计划 (Find available Prometheus plans)
 * 3. 创建或恢复 boulder.json 工作状态 (Create or resume boulder.json work state)
 * 4. 注入计划上下文到会话 (Inject plan context into session)
 * 5. 切换到 Atlas 编排器代理 (Switch to Atlas orchestrator agent)
 * 
 * 计划选择逻辑 (Plan selection logic):
 * - 用户指定计划名：使用指定计划 (User specified plan: use specified plan)
 * - 存在活跃工作：恢复现有工作 (Active work exists: resume existing work)
 * - 单个未完成计划：自动选择 (Single incomplete plan: auto-select)
 * - 多个未完成计划：询问用户选择 (Multiple incomplete plans: ask user to choose)
 * 
 * 状态管理 (State management):
 * - boulder.json 记录活跃计划和会话ID (boulder.json tracks active plan and session IDs)
 * - 支持跨会话恢复工作 (Supports cross-session work resumption)
 * - 自动检测计划完成状态 (Auto-detects plan completion status)
 */

import type { PluginInput } from "@opencode-ai/plugin"
import {
  readBoulderState,
  writeBoulderState,
  appendSessionId,
  findPrometheusPlans,
  getPlanProgress,
  createBoulderState,
  getPlanName,
  clearBoulderState,
} from "../../features/boulder-state"
import { log } from "../../shared/logger"
import { getSessionAgent, updateSessionAgent } from "../../features/claude-code-session-state"

export const HOOK_NAME = "start-work"

// ultrawork/ulw 关键词模式 (ultrawork/ulw keyword pattern)
const KEYWORD_PATTERN = /\b(ultrawork|ulw)\b/gi

interface StartWorkHookInput {
  sessionID: string
  messageID?: string
}

interface StartWorkHookOutput {
  parts: Array<{ type: string; text?: string }>
}

function extractUserRequestPlanName(promptText: string): string | null {
  const userRequestMatch = promptText.match(/<user-request>\s*([\s\S]*?)\s*<\/user-request>/i)
  if (!userRequestMatch) return null
  
  const rawArg = userRequestMatch[1].trim()
  if (!rawArg) return null
  
  const cleanedArg = rawArg.replace(KEYWORD_PATTERN, "").trim()
  return cleanedArg || null
}

function findPlanByName(plans: string[], requestedName: string): string | null {
  const lowerName = requestedName.toLowerCase()
  
  const exactMatch = plans.find(p => getPlanName(p).toLowerCase() === lowerName)
  if (exactMatch) return exactMatch
  
  const partialMatch = plans.find(p => getPlanName(p).toLowerCase().includes(lowerName))
  return partialMatch || null
}

/**
 * 创建开始工作钩子
 * Creates start work hook
 * 
 * @param ctx - 插件上下文 (Plugin context)
 * @returns 钩子对象，监听 chat.message 事件 (Hook object that listens to chat.message event)
 */
export function createStartWorkHook(ctx: PluginInput) {
  return {
    "chat.message": async (
      input: StartWorkHookInput,
      output: StartWorkHookOutput
    ): Promise<void> => {
      const parts = output.parts
      const promptText = parts
        ?.filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join("\n")
        .trim() || ""

      // 只在实际命令执行时触发（包含 <session-context> 标签）
      // 不在描述文本时触发（如 "Start Sisyphus work session from Prometheus plan"）
      // Only trigger on actual command execution (contains <session-context> tag)
      // NOT on description text like "Start Sisyphus work session from Prometheus plan"
      const isStartWorkCommand = promptText.includes("<session-context>")

      if (!isStartWorkCommand) {
        return
      }

      log(`[${HOOK_NAME}] Processing start-work command`, {
        sessionID: input.sessionID,
      })

      // 确保会话使用 Atlas 编排器 (Ensure session uses Atlas orchestrator)
      const currentAgent = getSessionAgent(input.sessionID)
      if (!currentAgent) {
        updateSessionAgent(input.sessionID, "atlas")
      }

      const existingState = readBoulderState(ctx.directory)
      const sessionId = input.sessionID
      const timestamp = new Date().toISOString()

      let contextInfo = ""
      
      // 提取用户指定的计划名称 (Extract user-specified plan name)
      const explicitPlanName = extractUserRequestPlanName(promptText)
      
      if (explicitPlanName) {
        log(`[${HOOK_NAME}] Explicit plan name requested: ${explicitPlanName}`, {
          sessionID: input.sessionID,
        })
        
        const allPlans = findPrometheusPlans(ctx.directory)
        const matchedPlan = findPlanByName(allPlans, explicitPlanName)
        
        if (matchedPlan) {
          const progress = getPlanProgress(matchedPlan)
          
          if (progress.isComplete) {
            contextInfo = `
## Plan Already Complete

The requested plan "${getPlanName(matchedPlan)}" has been completed.
All ${progress.total} tasks are done. Create a new plan with: /plan "your task"`
          } else {
            if (existingState) {
              clearBoulderState(ctx.directory)
            }
            const newState = createBoulderState(matchedPlan, sessionId)
            writeBoulderState(ctx.directory, newState)
            
            contextInfo = `
## Auto-Selected Plan

**Plan**: ${getPlanName(matchedPlan)}
**Path**: ${matchedPlan}
**Progress**: ${progress.completed}/${progress.total} tasks
**Session ID**: ${sessionId}
**Started**: ${timestamp}

boulder.json has been created. Read the plan and begin execution.`
          }
        } else {
          const incompletePlans = allPlans.filter(p => !getPlanProgress(p).isComplete)
          if (incompletePlans.length > 0) {
            const planList = incompletePlans.map((p, i) => {
              const prog = getPlanProgress(p)
              return `${i + 1}. [${getPlanName(p)}] - Progress: ${prog.completed}/${prog.total}`
            }).join("\n")
            
            contextInfo = `
## Plan Not Found

Could not find a plan matching "${explicitPlanName}".

Available incomplete plans:
${planList}

Ask the user which plan to work on.`
          } else {
            contextInfo = `
## Plan Not Found

Could not find a plan matching "${explicitPlanName}".
No incomplete plans available. Create a new plan with: /plan "your task"`
          }
        }
      } else if (existingState) {
        const progress = getPlanProgress(existingState.active_plan)
        
        if (!progress.isComplete) {
          appendSessionId(ctx.directory, sessionId)
          contextInfo = `
## Active Work Session Found

**Status**: RESUMING existing work
**Plan**: ${existingState.plan_name}
**Path**: ${existingState.active_plan}
**Progress**: ${progress.completed}/${progress.total} tasks completed
**Sessions**: ${existingState.session_ids.length + 1} (current session appended)
**Started**: ${existingState.started_at}

The current session (${sessionId}) has been added to session_ids.
Read the plan file and continue from the first unchecked task.`
        } else {
          contextInfo = `
## Previous Work Complete

The previous plan (${existingState.plan_name}) has been completed.
Looking for new plans...`
        }
      }

      if ((!existingState && !explicitPlanName) || (existingState && !explicitPlanName && getPlanProgress(existingState.active_plan).isComplete)) {
        const plans = findPrometheusPlans(ctx.directory)
        const incompletePlans = plans.filter(p => !getPlanProgress(p).isComplete)
        
        if (plans.length === 0) {
          contextInfo += `

## No Plans Found

No Prometheus plan files found at .sisyphus/plans/
Use Prometheus to create a work plan first: /plan "your task"`
        } else if (incompletePlans.length === 0) {
          contextInfo += `

## All Plans Complete

All ${plans.length} plan(s) are complete. Create a new plan with: /plan "your task"`
        } else if (incompletePlans.length === 1) {
          const planPath = incompletePlans[0]
          const progress = getPlanProgress(planPath)
          const newState = createBoulderState(planPath, sessionId)
          writeBoulderState(ctx.directory, newState)

          contextInfo += `

## Auto-Selected Plan

**Plan**: ${getPlanName(planPath)}
**Path**: ${planPath}
**Progress**: ${progress.completed}/${progress.total} tasks
**Session ID**: ${sessionId}
**Started**: ${timestamp}

boulder.json has been created. Read the plan and begin execution.`
        } else {
          const planList = incompletePlans.map((p, i) => {
            const progress = getPlanProgress(p)
            const stat = require("node:fs").statSync(p)
            const modified = new Date(stat.mtimeMs).toISOString()
            return `${i + 1}. [${getPlanName(p)}] - Modified: ${modified} - Progress: ${progress.completed}/${progress.total}`
          }).join("\n")

          contextInfo += `

<system-reminder>
## Multiple Plans Found

Current Time: ${timestamp}
Session ID: ${sessionId}

${planList}

Ask the user which plan to work on. Present the options above and wait for their response.
</system-reminder>`
        }
      }

      const idx = output.parts.findIndex((p) => p.type === "text" && p.text)
      if (idx >= 0 && output.parts[idx].text) {
        output.parts[idx].text = output.parts[idx].text
          .replace(/\$SESSION_ID/g, sessionId)
          .replace(/\$TIMESTAMP/g, timestamp)
        
        output.parts[idx].text += `\n\n---\n${contextInfo}`
      }

      log(`[${HOOK_NAME}] Context injected`, {
        sessionID: input.sessionID,
        hasExistingState: !!existingState,
      })
    },
  }
}
