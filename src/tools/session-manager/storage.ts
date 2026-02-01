/**
 * storage - 会话存储层
 * 
 * 负责从文件系统读取会话数据。会话数据存储在 OpenCode 的本地目录中：
 * - SESSION_STORAGE: 会话元数据（.json 文件）
 * - MESSAGE_STORAGE: 消息内容（按会话 ID 组织）
 * - PART_STORAGE: 消息部分（文本、工具调用等）
 * - TODO_DIR: Todo 列表
 * - TRANSCRIPT_DIR: 执行日志
 * 
 * 存储结构：
 * ```
 * ~/.local/share/opencode/
 *   sessions/
 *     <project-hash>/
 *       <session-id>.json  # 会话元数据
 *   messages/
 *     <project-hash>/
 *       <session-id>/
 *         <message-id>.json  # 消息元数据
 *   parts/
 *     <message-id>/
 *       <part-id>.json  # 消息部分内容
 * ```
 */
import { existsSync, readdirSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { MESSAGE_STORAGE, PART_STORAGE, SESSION_STORAGE, TODO_DIR, TRANSCRIPT_DIR } from "./constants"
import type { SessionMessage, SessionInfo, TodoItem, SessionMetadata } from "./types"

export interface GetMainSessionsOptions {
  directory?: string
}

/**
 * 获取主会话列表（排除子会话）
 * 
 * 扫描 SESSION_STORAGE 目录，读取所有会话元数据文件。
 * 过滤掉子会话（有 parentID 的会话）和不匹配的项目路径。
 * 
 * @param options.directory - 可选的项目路径过滤器
 * @returns 按更新时间倒序排列的会话元数据数组
 */
export async function getMainSessions(options: GetMainSessionsOptions): Promise<SessionMetadata[]> {
  if (!existsSync(SESSION_STORAGE)) return []

  const sessions: SessionMetadata[] = []

  try {
    const projectDirs = await readdir(SESSION_STORAGE, { withFileTypes: true })
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue

      const projectPath = join(SESSION_STORAGE, projectDir.name)
      const sessionFiles = await readdir(projectPath)

      for (const file of sessionFiles) {
        if (!file.endsWith(".json")) continue

        try {
          const content = await readFile(join(projectPath, file), "utf-8")
          const meta = JSON.parse(content) as SessionMetadata

          if (meta.parentID) continue

          if (options.directory && meta.directory !== options.directory) continue

          sessions.push(meta)
        } catch {
          continue
        }
      }
    }
  } catch {
    return []
  }

  return sessions.sort((a, b) => b.time.updated - a.time.updated)
}

/**
 * 获取所有会话 ID（包括主会话和子会话）
 * 
 * 递归扫描 MESSAGE_STORAGE 目录，查找所有包含 .json 文件的目录。
 * 这些目录的名称即为会话 ID。使用 Set 去重以处理可能的重复。
 * 
 * @returns 所有会话 ID 的数组（无特定顺序）
 */
export async function getAllSessions(): Promise<string[]> {
  if (!existsSync(MESSAGE_STORAGE)) return []

  const sessions: string[] = []

  async function scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionPath = join(dir, entry.name)
          const files = await readdir(sessionPath)
          if (files.some((f) => f.endsWith(".json"))) {
            sessions.push(entry.name)
          } else {
            await scanDirectory(sessionPath)
          }
        }
      }
    } catch {
      return
    }
  }

  await scanDirectory(MESSAGE_STORAGE)
  return [...new Set(sessions)]
}

export function getMessageDir(sessionID: string): string {
  if (!existsSync(MESSAGE_STORAGE)) return ""

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) {
    return directPath
  }

  try {
    for (const dir of readdirSync(MESSAGE_STORAGE)) {
      const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
      if (existsSync(sessionPath)) {
        return sessionPath
      }
    }
  } catch {
    return ""
  }

  return ""
}

export function sessionExists(sessionID: string): boolean {
  return getMessageDir(sessionID) !== ""
}

export async function readSessionMessages(sessionID: string): Promise<SessionMessage[]> {
  const messageDir = getMessageDir(sessionID)
  if (!messageDir || !existsSync(messageDir)) return []

  const messages: SessionMessage[] = []
  try {
    const files = await readdir(messageDir)
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const content = await readFile(join(messageDir, file), "utf-8")
        const meta = JSON.parse(content)

        const parts = await readParts(meta.id)

        messages.push({
          id: meta.id,
          role: meta.role,
          agent: meta.agent,
          time: meta.time,
          parts,
        })
      } catch {
        continue
      }
    }
  } catch {
    return []
  }

  return messages.sort((a, b) => {
    const aTime = a.time?.created ?? 0
    const bTime = b.time?.created ?? 0
    if (aTime !== bTime) return aTime - bTime
    return a.id.localeCompare(b.id)
  })
}

async function readParts(messageID: string): Promise<Array<{ id: string; type: string; [key: string]: unknown }>> {
  const partDir = join(PART_STORAGE, messageID)
  if (!existsSync(partDir)) return []

  const parts: Array<{ id: string; type: string; [key: string]: unknown }> = []
  try {
    const files = await readdir(partDir)
    for (const file of files) {
      if (!file.endsWith(".json")) continue
      try {
        const content = await readFile(join(partDir, file), "utf-8")
        parts.push(JSON.parse(content))
      } catch {
        continue
      }
    }
  } catch {
    return []
  }

  return parts.sort((a, b) => a.id.localeCompare(b.id))
}

export async function readSessionTodos(sessionID: string): Promise<TodoItem[]> {
  if (!existsSync(TODO_DIR)) return []

  try {
    const allFiles = await readdir(TODO_DIR)
    const todoFiles = allFiles.filter((f) => f.includes(sessionID) && f.endsWith(".json"))

    for (const file of todoFiles) {
      try {
        const content = await readFile(join(TODO_DIR, file), "utf-8")
        const data = JSON.parse(content)
        if (Array.isArray(data)) {
          return data.map((item) => ({
            id: item.id || "",
            content: item.content || "",
            status: item.status || "pending",
            priority: item.priority,
          }))
        }
      } catch {
        continue
      }
    }
  } catch {
    return []
  }

  return []
}

export async function readSessionTranscript(sessionID: string): Promise<number> {
  if (!existsSync(TRANSCRIPT_DIR)) return 0

  const transcriptFile = join(TRANSCRIPT_DIR, `${sessionID}.jsonl`)
  if (!existsSync(transcriptFile)) return 0

  try {
    const content = await readFile(transcriptFile, "utf-8")
    return content.trim().split("\n").filter(Boolean).length
  } catch {
    return 0
  }
}

export async function getSessionInfo(sessionID: string): Promise<SessionInfo | null> {
  const messages = await readSessionMessages(sessionID)
  if (messages.length === 0) return null

  const agentsUsed = new Set<string>()
  let firstMessage: Date | undefined
  let lastMessage: Date | undefined

  for (const msg of messages) {
    if (msg.agent) agentsUsed.add(msg.agent)
    if (msg.time?.created) {
      const date = new Date(msg.time.created)
      if (!firstMessage || date < firstMessage) firstMessage = date
      if (!lastMessage || date > lastMessage) lastMessage = date
    }
  }

  const todos = await readSessionTodos(sessionID)
  const transcriptEntries = await readSessionTranscript(sessionID)

  return {
    id: sessionID,
    message_count: messages.length,
    first_message: firstMessage,
    last_message: lastMessage,
    agents_used: Array.from(agentsUsed),
    has_todos: todos.length > 0,
    has_transcript: transcriptEntries > 0,
    todos,
    transcript_entries: transcriptEntries,
  }
}
