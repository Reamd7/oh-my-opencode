/**
 * 压缩上下文注入钩子 (Compaction Context Injector Hook)
 * 
 * 在会话上下文压缩（summarize）时注入结构化提示，确保压缩后的摘要包含关键信息。
 * 这使得代理在上下文窗口满时能够保留重要的工作状态和决策历史。
 * 
 * Injects structured prompt during session context compaction (summarize) to
 * ensure compressed summary contains critical information. This enables agent
 * to preserve important work state and decision history when context window is full.
 * 
 * 注入的摘要结构 (Injected summary structure):
 * 1. User Requests - 用户原始请求 (Original user requests as-is)
 * 2. Final Goal - 最终目标 (Ultimate goal and expected deliverable)
 * 3. Work Completed - 已完成工作 (Files modified, features implemented)
 * 4. Remaining Tasks - 剩余任务 (Pending items and follow-ups)
 * 5. Active Working Context - 活跃工作上下文 (Files, code, references, state)
 * 6. MUST NOT Do - 关键约束 (Forbidden approaches, failed attempts)
 * 7. Agent Verification State - 代理验证状态 (Review progress, rejections)
 * 
 * 触发时机 (Trigger timing):
 * - 上下文窗口使用率达到阈值时 (When context window usage reaches threshold)
 * - OpenCode 自动触发 summarize 操作 (OpenCode automatically triggers summarize)
 * 
 * 重要性 (Importance):
 * - 防止压缩后丢失关键决策和约束 (Prevent loss of critical decisions and constraints)
 * - 保持审查代理的验证状态连续性 (Maintain reviewer agent verification continuity)
 * - 确保工作可以无缝恢复 (Ensure work can resume seamlessly)
 */

import { injectHookMessage } from "../../features/hook-message-injector"
import { log } from "../../shared/logger"
import { createSystemDirective, SystemDirectiveTypes } from "../../shared/system-directive"

export interface SummarizeContext {
  sessionID: string
  providerID: string
  modelID: string
  usageRatio: number
  directory: string
}

const SUMMARIZE_CONTEXT_PROMPT = `${createSystemDirective(SystemDirectiveTypes.COMPACTION_CONTEXT)}

When summarizing this session, you MUST include the following sections in your summary:

## 1. User Requests (As-Is)
- List all original user requests exactly as they were stated
- Preserve the user's exact wording and intent

## 2. Final Goal
- What the user ultimately wanted to achieve
- The end result or deliverable expected

## 3. Work Completed
- What has been done so far
- Files created/modified
- Features implemented
- Problems solved

## 4. Remaining Tasks
- What still needs to be done
- Pending items from the original request
- Follow-up tasks identified during the work

## 5. Active Working Context (For Seamless Continuation)
- **Files**: Paths of files currently being edited or frequently referenced
- **Code in Progress**: Key code snippets, function signatures, or data structures under active development
- **External References**: Documentation URLs, library APIs, or external resources being consulted
- **State & Variables**: Important variable names, configuration values, or runtime state relevant to ongoing work

## 6. MUST NOT Do (Critical Constraints)
- Things that were explicitly forbidden
- Approaches that failed and should not be retried
- User's explicit restrictions or preferences
- Anti-patterns identified during the session

## 7. Agent Verification State (Critical for Reviewers)
- **Current Agent**: What agent is running (momus, oracle, etc.)
- **Verification Progress**: Files already verified/validated
- **Pending Verifications**: Files still needing verification
- **Previous Rejections**: If reviewer agent, what was rejected and why
- **Acceptance Status**: Current state of review process

This section is CRITICAL for reviewer agents (momus, oracle) to maintain continuity.

This context is critical for maintaining continuity after compaction.
`

/**
 * 创建压缩上下文注入器
 * Creates compaction context injector
 * 
 * @returns 异步函数，在 summarize 时注入上下文提示 (Async function that injects context prompt during summarize)
 */
export function createCompactionContextInjector() {
  return async (ctx: SummarizeContext): Promise<void> => {
    log("[compaction-context-injector] injecting context", { sessionID: ctx.sessionID })

    // 注入结构化摘要提示到消息历史 (Inject structured summary prompt into message history)
    const success = injectHookMessage(ctx.sessionID, SUMMARIZE_CONTEXT_PROMPT, {
      agent: "general",
      model: { providerID: ctx.providerID, modelID: ctx.modelID },
      path: { cwd: ctx.directory },
    })

    if (success) {
      log("[compaction-context-injector] context injected", { sessionID: ctx.sessionID })
    } else {
      log("[compaction-context-injector] injection failed", { sessionID: ctx.sessionID })
    }
  }
}
