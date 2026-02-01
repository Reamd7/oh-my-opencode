import { join, dirname } from "path"
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs"
import { homedir } from "os"
import type { z } from "zod"
import type { OhMyOpenCodeConfig } from "../../config/schema"

/**
 * 获取任务列表存储目录
 * 
 * 根据配置返回任务存储路径：
 * - Claude Code兼容模式: ~/.cache/claude-code/tasks/{listId}
 * - 默认模式: {cwd}/.sisyphus/tasks/{listId}
 * 
 * @param listId 任务列表ID
 * @param config 配置对象
 * @returns 任务目录路径
 */
export function getTaskDir(listId: string, config: Partial<OhMyOpenCodeConfig>): string {
  const tasksConfig = config.sisyphus?.tasks

  if (tasksConfig?.claude_code_compat) {
    return join(homedir(), ".cache", "claude-code", "tasks", listId)
  }

  const storagePath = tasksConfig?.storage_path ?? ".sisyphus/tasks"
  return join(process.cwd(), storagePath, listId)
}

/**
 * 获取单个任务文件路径
 * 
 * @param listId 任务列表ID
 * @param taskId 任务ID
 * @param config 配置对象
 * @returns 任务文件路径
 */
export function getTaskPath(listId: string, taskId: string, config: Partial<OhMyOpenCodeConfig>): string {
  return join(getTaskDir(listId, config), `${taskId}.json`)
}

/**
 * 获取团队存储目录
 * 
 * 根据配置返回团队存储路径：
 * - Claude Code兼容模式: ~/.claude/teams/{teamName}
 * - 默认模式: {cwd}/.sisyphus/teams/{teamName}
 * 
 * @param teamName 团队名称
 * @param config 配置对象
 * @returns 团队目录路径
 */
export function getTeamDir(teamName: string, config: Partial<OhMyOpenCodeConfig>): string {
  const swarmConfig = config.sisyphus?.swarm

  if (swarmConfig?.storage_path?.includes("claude")) {
    return join(homedir(), ".claude", "teams", teamName)
  }

  const storagePath = swarmConfig?.storage_path ?? ".sisyphus/teams"
  return join(process.cwd(), storagePath, teamName)
}

/**
 * 获取代理收件箱文件路径
 * 
 * @param teamName 团队名称
 * @param agentName 代理名称
 * @param config 配置对象
 * @returns 收件箱文件路径
 */
export function getInboxPath(teamName: string, agentName: string, config: Partial<OhMyOpenCodeConfig>): string {
  return join(getTeamDir(teamName, config), "inboxes", `${agentName}.json`)
}

/**
 * 确保目录存在，不存在则递归创建
 * 
 * @param dirPath 目录路径
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * 安全读取JSON文件并验证schema
 * 
 * @param filePath 文件路径
 * @param schema Zod schema
 * @returns 解析后的数据，失败返回null
 */
export function readJsonSafe<T>(filePath: string, schema: z.ZodType<T>): T | null {
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content)
    const result = schema.safeParse(parsed)

    if (!result.success) {
      return null
    }

    return result.data
  } catch {
    return null
  }
}

/**
 * 原子写入JSON文件
 * 
 * 使用临时文件+重命名策略确保写入原子性，
 * 避免并发写入导致的数据损坏
 * 
 * @param filePath 目标文件路径
 * @param data 要写入的数据
 * @throws 写入失败时抛出错误
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = dirname(filePath)
  ensureDir(dir)

  const tempPath = `${filePath}.tmp.${Date.now()}`

  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8")
    renameSync(tempPath, filePath)
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}
