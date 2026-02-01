/**
 * session-manager - 会话管理工具
 * 
 * ## 功能概述
 * 提供会话历史的搜索、读取和分析能力。允许 AI 代理访问和学习历史对话，
 * 从而改进决策、恢复上下文、分析模式。
 * 
 * ## 核心工具
 * - **session_list**: 列出所有会话，支持日期和项目过滤
 * - **session_read**: 读取会话消息，包含完整对话历史
 * - **session_search**: 全文搜索会话内容，快速定位相关对话
 * - **session_info**: 获取会话元数据和统计信息
 * 
 * ## 使用场景
 * - 查找历史对话：快速定位之前讨论过的问题
 * - 分析会话模式：了解常见问题和解决方案
 * - 恢复上下文：在新会话中继续之前的工作
 * - 学习和改进：从历史交互中学习最佳实践
 * 
 * ## 存储格式
 * 会话数据存储在本地文件系统：
 * - 消息历史：完整的对话记录（用户和助手消息）
 * - Todo列表：任务跟踪和状态
 * - Transcript日志：详细的执行日志
 * 
 * ## 性能优化
 * - 搜索超时：60秒防止长时间阻塞
 * - 扫描限制：最多扫描50个会话保证响应速度
 * - 异步处理：并发读取提高性能
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import {
  SESSION_LIST_DESCRIPTION,
  SESSION_READ_DESCRIPTION,
  SESSION_SEARCH_DESCRIPTION,
  SESSION_INFO_DESCRIPTION,
} from "./constants"
import { getAllSessions, getMainSessions, getSessionInfo, readSessionMessages, readSessionTodos, sessionExists } from "./storage"
import {
  filterSessionsByDate,
  formatSessionInfo,
  formatSessionList,
  formatSessionMessages,
  formatSearchResults,
  searchInSession,
} from "./utils"
import type { SessionListArgs, SessionReadArgs, SessionSearchArgs, SessionInfoArgs, SearchResult } from "./types"

/** 搜索操作超时时间（毫秒）- 防止长时间阻塞 */
const SEARCH_TIMEOUT_MS = 60_000
/** 最大扫描会话数 - 限制搜索范围以保证性能 */
const MAX_SESSIONS_TO_SCAN = 50

/**
 * 为异步操作添加超时保护
 * 
 * 使用 Promise.race 实现超时机制，防止长时间运行的操作阻塞系统。
 * 这对于文件系统操作和大规模搜索特别重要。
 * 
 * @param promise - 需要添加超时的 Promise
 * @param ms - 超时时间（毫秒）
 * @param operation - 操作名称，用于错误消息
 * @returns 带超时保护的 Promise
 */
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)),
  ])
}

/**
 * session_list - 列出会话工具
 * 
 * 列出所有主会话（非子会话），支持按日期范围和项目路径过滤。
 * 返回会话的基本元数据：ID、消息数、日期范围、使用的代理。
 * 
 * 过滤逻辑：
 * 1. 首先按项目路径过滤（默认当前目录）
 * 2. 然后按日期范围过滤（可选）
 * 3. 最后应用数量限制（可选）
 */
export const session_list: ToolDefinition = tool({
  description: SESSION_LIST_DESCRIPTION,
  args: {
    limit: tool.schema.number().optional().describe("Maximum number of sessions to return"),
    from_date: tool.schema.string().optional().describe("Filter sessions from this date (ISO 8601 format)"),
    to_date: tool.schema.string().optional().describe("Filter sessions until this date (ISO 8601 format)"),
    project_path: tool.schema.string().optional().describe("Filter sessions by project path (default: current working directory)"),
  },
  execute: async (args: SessionListArgs, _context) => {
    try {
      const directory = args.project_path ?? process.cwd()
      let sessions = await getMainSessions({ directory })
      let sessionIDs = sessions.map((s) => s.id)

      if (args.from_date || args.to_date) {
        sessionIDs = await filterSessionsByDate(sessionIDs, args.from_date, args.to_date)
      }

      if (args.limit && args.limit > 0) {
        sessionIDs = sessionIDs.slice(0, args.limit)
      }

      return await formatSessionList(sessionIDs)
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

/**
 * session_read - 读取会话工具
 * 
 * 读取指定会话的完整消息历史，包括用户和助手的所有交互。
 * 可选包含 Todo 列表和 Transcript 日志以获取完整上下文。
 * 
 * 消息格式包含：
 * - 角色（user/assistant）和代理名称
 * - 时间戳
 * - 消息部分（文本、思考、工具调用、工具结果）
 */
export const session_read: ToolDefinition = tool({
  description: SESSION_READ_DESCRIPTION,
  args: {
    session_id: tool.schema.string().describe("Session ID to read"),
    include_todos: tool.schema.boolean().optional().describe("Include todo list if available (default: false)"),
    include_transcript: tool.schema.boolean().optional().describe("Include transcript log if available (default: false)"),
    limit: tool.schema.number().optional().describe("Maximum number of messages to return (default: all)"),
  },
  execute: async (args: SessionReadArgs, _context) => {
    try {
      if (!sessionExists(args.session_id)) {
        return `Session not found: ${args.session_id}`
      }

      let messages = await readSessionMessages(args.session_id)

      if (args.limit && args.limit > 0) {
        messages = messages.slice(0, args.limit)
      }

      const todos = args.include_todos ? await readSessionTodos(args.session_id) : undefined

      return formatSessionMessages(messages, args.include_todos, todos)
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

/**
 * session_search - 搜索会话工具
 * 
 * 在会话消息中执行全文搜索，支持单会话或跨会话搜索。
 * 
 * 搜索策略：
 * - 单会话模式：搜索指定会话的所有消息
 * - 全局模式：扫描最近的 50 个会话（性能优化）
 * - 超时保护：60 秒后自动终止搜索
 * 
 * 搜索算法：
 * - 简单字符串匹配（支持大小写敏感/不敏感）
 * - 返回匹配上下文（前后各 50 字符）
 * - 统计每条消息的匹配次数
 */
export const session_search: ToolDefinition = tool({
  description: SESSION_SEARCH_DESCRIPTION,
  args: {
    query: tool.schema.string().describe("Search query string"),
    session_id: tool.schema.string().optional().describe("Search within specific session only (default: all sessions)"),
    case_sensitive: tool.schema.boolean().optional().describe("Case-sensitive search (default: false)"),
    limit: tool.schema.number().optional().describe("Maximum number of results to return (default: 20)"),
  },
  execute: async (args: SessionSearchArgs, _context) => {
    try {
      const resultLimit = args.limit && args.limit > 0 ? args.limit : 20

      const searchOperation = async (): Promise<SearchResult[]> => {
        if (args.session_id) {
          return searchInSession(args.session_id, args.query, args.case_sensitive, resultLimit)
        }

        const allSessions = await getAllSessions()
        const sessionsToScan = allSessions.slice(0, MAX_SESSIONS_TO_SCAN)

        const allResults: SearchResult[] = []
        for (const sid of sessionsToScan) {
          if (allResults.length >= resultLimit) break

          const remaining = resultLimit - allResults.length
          const sessionResults = await searchInSession(sid, args.query, args.case_sensitive, remaining)
          allResults.push(...sessionResults)
        }

        return allResults.slice(0, resultLimit)
      }

      const results = await withTimeout(searchOperation(), SEARCH_TIMEOUT_MS, "Search")

      return formatSearchResults(results)
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

/**
 * session_info - 会话信息工具
 * 
 * 获取会话的元数据和统计信息，不包含完整消息内容。
 * 用于快速了解会话概况，比 session_read 更轻量。
 * 
 * 返回信息包括：
 * - 消息数量和日期范围
 * - 使用的代理列表
 * - Todo 和 Transcript 可用性
 * - 会话持续时间
 */
export const session_info: ToolDefinition = tool({
  description: SESSION_INFO_DESCRIPTION,
  args: {
    session_id: tool.schema.string().describe("Session ID to inspect"),
  },
  execute: async (args: SessionInfoArgs, _context) => {
    try {
      const info = await getSessionInfo(args.session_id)

      if (!info) {
        return `Session not found: ${args.session_id}`
      }

      return formatSessionInfo(info)
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})
