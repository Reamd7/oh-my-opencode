/**
 * Ralph Loop 状态持久化模块
 * 
 * 负责将循环状态保存到文件系统并读取恢复
 * 使用Markdown frontmatter格式存储结构化数据
 * 
 * 文件格式示例：
 * ---
 * active: true
 * iteration: 3
 * max_iterations: 100
 * completion_promise: "DONE"
 * started_at: "2026-01-29T10:00:00Z"
 * session_id: "abc123"
 * ultrawork: true
 * ---
 * 原始任务提示内容...
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { parseFrontmatter } from "../../shared/frontmatter"
import type { RalphLoopState } from "./types"
import { DEFAULT_STATE_FILE, DEFAULT_COMPLETION_PROMISE, DEFAULT_MAX_ITERATIONS } from "./constants"

export function getStateFilePath(directory: string, customPath?: string): string {
  return customPath
    ? join(directory, customPath)
    : join(directory, DEFAULT_STATE_FILE)
}

export function readState(directory: string, customPath?: string): RalphLoopState | null {
  const filePath = getStateFilePath(directory, customPath)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    const { data, body } = parseFrontmatter<Record<string, unknown>>(content)

    const active = data.active
    const iteration = data.iteration
    
    if (active === undefined || iteration === undefined) {
      return null
    }

    // 类型转换：支持字符串和布尔值
    const isActive = active === true || active === "true"
    const iterationNum = typeof iteration === "number" ? iteration : Number(iteration)
    
    if (isNaN(iterationNum)) {
      return null
    }

    // 去除YAML字符串值的引号
    const stripQuotes = (val: unknown): string => {
      const str = String(val ?? "")
      return str.replace(/^["']|["']$/g, "")
    }

    return {
      active: isActive,
      iteration: iterationNum,
      max_iterations: Number(data.max_iterations) || DEFAULT_MAX_ITERATIONS,
      completion_promise: stripQuotes(data.completion_promise) || DEFAULT_COMPLETION_PROMISE,
      started_at: stripQuotes(data.started_at) || new Date().toISOString(),
      prompt: body.trim(),
      session_id: data.session_id ? stripQuotes(data.session_id) : undefined,
      ultrawork: data.ultrawork === true || data.ultrawork === "true" ? true : undefined,
    }
  } catch {
    return null
  }
}

export function writeState(
  directory: string,
  state: RalphLoopState,
  customPath?: string
): boolean {
  const filePath = getStateFilePath(directory, customPath)

  try {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const sessionIdLine = state.session_id ? `session_id: "${state.session_id}"\n` : ""
    const ultraworkLine = state.ultrawork !== undefined ? `ultrawork: ${state.ultrawork}\n` : ""
    const content = `---
active: ${state.active}
iteration: ${state.iteration}
max_iterations: ${state.max_iterations}
completion_promise: "${state.completion_promise}"
started_at: "${state.started_at}"
${sessionIdLine}${ultraworkLine}---
${state.prompt}
`

    writeFileSync(filePath, content, "utf-8")
    return true
  } catch {
    return false
  }
}

export function clearState(directory: string, customPath?: string): boolean {
  const filePath = getStateFilePath(directory, customPath)

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
    return true
  } catch {
    return false
  }
}

export function incrementIteration(
  directory: string,
  customPath?: string
): RalphLoopState | null {
  const state = readState(directory, customPath)
  if (!state) return null

  state.iteration += 1
  if (writeState(directory, state, customPath)) {
    return state
  }
  return null
}
