import { spawn } from "bun"
import { existsSync } from "fs"
import {
  getSgCliPath,
  setSgCliPath,
  findSgCliPathSync,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_MAX_MATCHES,
} from "./constants"
import { ensureAstGrepBinary } from "./downloader"
import type { CliMatch, CliLanguage, SgResult } from "./types"

/** AST-grep CLI执行选项 */
export interface RunOptions {
  pattern: string // 搜索模式（支持meta变量）
  lang: CliLanguage // 目标语言
  paths?: string[] // 搜索路径（默认为当前目录）
  globs?: string[] // 包含/排除的glob模式
  rewrite?: string // 替换模式（用于替换操作）
  context?: number // 上下文行数
  updateAll?: boolean // 是否实际修改文件（false为dry-run）
}

/** 已解析的CLI路径（缓存） */
let resolvedCliPath: string | null = null
/** 初始化Promise（避免重复初始化） */
let initPromise: Promise<string | null> | null = null

/**
 * 获取AST-grep CLI路径
 * 
 * 查找顺序：
 * 1. 缓存的路径
 * 2. 同步查找（node_modules、系统PATH）
 * 3. 自动下载二进制文件
 */
export async function getAstGrepPath(): Promise<string | null> {
  if (resolvedCliPath !== null && existsSync(resolvedCliPath)) {
    return resolvedCliPath
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const syncPath = findSgCliPathSync()
    if (syncPath && existsSync(syncPath)) {
      resolvedCliPath = syncPath
      setSgCliPath(syncPath)
      return syncPath
    }

    const downloadedPath = await ensureAstGrepBinary()
    if (downloadedPath) {
      resolvedCliPath = downloadedPath
      setSgCliPath(downloadedPath)
      return downloadedPath
    }

    return null
  })()

  return initPromise
}

/**
 * 启动后台初始化
 * 在插件加载时调用，提前下载二进制文件，避免首次使用时等待
 */
export function startBackgroundInit(): void {
  if (!initPromise) {
    initPromise = getAstGrepPath()
    initPromise.catch(() => {})
  }
}

/**
 * 执行AST-grep CLI命令
 * 
 * ## 超时和限制
 * - 超时: 300秒（DEFAULT_TIMEOUT_MS）
 * - 最大输出: 1MB（DEFAULT_MAX_OUTPUT_BYTES）
 * - 最大匹配数: 500（DEFAULT_MAX_MATCHES）
 * 
 * ## 错误处理
 * - 二进制不存在：自动下载
 * - 超时：返回截断结果
 * - 输出过大：截断并尝试解析
 */
export async function runSg(options: RunOptions): Promise<SgResult> {
  const args = ["run", "-p", options.pattern, "--lang", options.lang, "--json=compact"]

  if (options.rewrite) {
    args.push("-r", options.rewrite)
    if (options.updateAll) {
      args.push("--update-all")
    }
  }

  if (options.context && options.context > 0) {
    args.push("-C", String(options.context))
  }

  if (options.globs) {
    for (const glob of options.globs) {
      args.push("--globs", glob)
    }
  }

  const paths = options.paths && options.paths.length > 0 ? options.paths : ["."]
  args.push(...paths)

  let cliPath = getSgCliPath()

  if (!existsSync(cliPath) && cliPath !== "sg") {
    const downloadedPath = await getAstGrepPath()
    if (downloadedPath) {
      cliPath = downloadedPath
    }
  }

  const timeout = DEFAULT_TIMEOUT_MS

  const proc = spawn([cliPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      proc.kill()
      reject(new Error(`Search timeout after ${timeout}ms`))
    }, timeout)
    proc.exited.then(() => clearTimeout(id))
  })

  let stdout: string
  let stderr: string
  let exitCode: number

  try {
    stdout = await Promise.race([new Response(proc.stdout).text(), timeoutPromise])
    stderr = await new Response(proc.stderr).text()
    exitCode = await proc.exited
  } catch (e) {
    const error = e as Error
    if (error.message?.includes("timeout")) {
      return {
        matches: [],
        totalMatches: 0,
        truncated: true,
        truncatedReason: "timeout",
        error: error.message,
      }
    }

    const nodeError = e as NodeJS.ErrnoException
    if (
      nodeError.code === "ENOENT" ||
      nodeError.message?.includes("ENOENT") ||
      nodeError.message?.includes("not found")
    ) {
      const downloadedPath = await ensureAstGrepBinary()
      if (downloadedPath) {
        resolvedCliPath = downloadedPath
        setSgCliPath(downloadedPath)
        return runSg(options)
      } else {
        return {
          matches: [],
          totalMatches: 0,
          truncated: false,
          error:
            `ast-grep CLI binary not found.\n\n` +
            `Auto-download failed. Manual install options:\n` +
            `  bun add -D @ast-grep/cli\n` +
            `  cargo install ast-grep --locked\n` +
            `  brew install ast-grep`,
        }
      }
    }

    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      error: `Failed to spawn ast-grep: ${error.message}`,
    }
  }

  if (exitCode !== 0 && stdout.trim() === "") {
    if (stderr.includes("No files found")) {
      return { matches: [], totalMatches: 0, truncated: false }
    }
    if (stderr.trim()) {
      return { matches: [], totalMatches: 0, truncated: false, error: stderr.trim() }
    }
    return { matches: [], totalMatches: 0, truncated: false }
  }

  if (!stdout.trim()) {
    return { matches: [], totalMatches: 0, truncated: false }
  }

  const outputTruncated = stdout.length >= DEFAULT_MAX_OUTPUT_BYTES
  const outputToProcess = outputTruncated ? stdout.substring(0, DEFAULT_MAX_OUTPUT_BYTES) : stdout

  let matches: CliMatch[] = []
  try {
    matches = JSON.parse(outputToProcess) as CliMatch[]
  } catch {
    if (outputTruncated) {
      try {
        const lastValidIndex = outputToProcess.lastIndexOf("}")
        if (lastValidIndex > 0) {
          const bracketIndex = outputToProcess.lastIndexOf("},", lastValidIndex)
          if (bracketIndex > 0) {
            const truncatedJson = outputToProcess.substring(0, bracketIndex + 1) + "]"
            matches = JSON.parse(truncatedJson) as CliMatch[]
          }
        }
      } catch {
        return {
          matches: [],
          totalMatches: 0,
          truncated: true,
          truncatedReason: "max_output_bytes",
          error: "Output too large and could not be parsed",
        }
      }
    } else {
      return { matches: [], totalMatches: 0, truncated: false }
    }
  }

  const totalMatches = matches.length
  const matchesTruncated = totalMatches > DEFAULT_MAX_MATCHES
  const finalMatches = matchesTruncated ? matches.slice(0, DEFAULT_MAX_MATCHES) : matches

  return {
    matches: finalMatches,
    totalMatches,
    truncated: outputTruncated || matchesTruncated,
    truncatedReason: outputTruncated ? "max_output_bytes" : matchesTruncated ? "max_matches" : undefined,
  }
}

export function isCliAvailable(): boolean {
  const path = findSgCliPathSync()
  return path !== null && existsSync(path)
}

export async function ensureCliAvailable(): Promise<boolean> {
  const path = await getAstGrepPath()
  return path !== null && existsSync(path)
}
