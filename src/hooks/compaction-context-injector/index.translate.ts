/**
 * 压缩上下文注入钩子 (Compaction Context Injector Hook)
 * 
 * 在会话上下文压缩（summarize）时注入结构化提示词，确保压缩后的摘要包含关键信息。
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

在总结此会话时，你必须在摘要中包含以下部分：

## 1. 用户请求（原样保留）
- 列出所有原始用户请求，完全按照其陈述的方式
- 保留用户的确切措辞和意图

## 2. 最终目标
- 用户最终想要实现的目标
- 预期的最终结果或交付物

## 3. 已完成工作
- 到目前为止已完成的工作
- 已创建/修改的文件
- 已实现的功能
- 已解决的问题

## 4. 剩余任务
- 仍需完成的工作
- 原始请求中的待办事项
- 工作期间识别的后续任务

## 5. 活跃工作上下文（用于无缝继续）
- **文件**：当前正在编辑或频繁引用的文件路径
- **进行中的代码**：关键代码片段、函数签名或正在积极开发的数据结构
- **外部引用**：正在查阅的文档 URL、库 API 或外部资源
- **状态与变量**：与正在进行的工作相关的重要变量名、配置值或运行时状态

## 6. 禁止事项（关键约束）
- 明确禁止的事项
- 失败的方法，不应重试
- 用户的明确限制或偏好
- 会话期间识别的反模式

## 7. 代理验证状态（对审查者至关重要）
- **当前代理**：正在运行的代理（momus、oracle 等）
- **验证进度**：已验证/确认的文件
- **待验证项**：仍需验证的文件
- **先前拒绝**：如果是审查代理，被拒绝的内容及原因
- **接受状态**：审查流程的当前状态

此部分对于审查代理（momus、oracle）保持连续性至关重要。

此上下文对于在压缩后保持连续性至关重要。
`

/**
 * 创建压缩上下文注入器
 * Creates compaction context injector
 * 
 * @returns 异步函数，在 summarize 时注入上下文提示词 (Async function that injects context prompt during summarize)
 */
export function createCompactionContextInjector() {
  return async (ctx: SummarizeContext): Promise<void> => {
    log("[compaction-context-injector] injecting context", { sessionID: ctx.sessionID })

    // 注入结构化摘要提示词到消息历史 (Inject structured summary prompt into message history)
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
