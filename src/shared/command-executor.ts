/**
 * 命令执行工具
 * 
 * 核心功能：
 * - 执行 shell 命令并捕获输出
 * - 支持 stdin 输入（用于 hook 命令）
 * - 自动查找和使用 zsh/bash
 * - 环境变量展开（~、$CLAUDE_PROJECT_DIR）
 * 
 * 使用场景：
 * - Hook 命令执行（PreToolUse、PostToolUse 等）
 * - 嵌入式命令解析（!`command` 语法）
 * - 配置文件中的动态命令
 * 
 * 设计理念：
 * - 优先使用用户的 login shell（保留 PATH 等环境变量）
 * - 安全的路径展开和环境变量替换
 * - 递归命令解析（支持命令嵌套）
 */
import { spawn } from "child_process"
import { exec } from "child_process"
import { promisify } from "util"
import { existsSync } from "fs"
import { homedir } from "os"

const DEFAULT_ZSH_PATHS = ["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh"]
const DEFAULT_BASH_PATHS = ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"]

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir()
}

/**
 * 查找 shell 可执行文件路径
 */
function findShellPath(defaultPaths: string[], customPath?: string): string | null {
  if (customPath && existsSync(customPath)) {
    return customPath
  }
  for (const path of defaultPaths) {
    if (existsSync(path)) {
      return path
    }
  }
  return null
}

function findZshPath(customZshPath?: string): string | null {
  return findShellPath(DEFAULT_ZSH_PATHS, customZshPath)
}

function findBashPath(): string | null {
  return findShellPath(DEFAULT_BASH_PATHS)
}

const execAsync = promisify(exec)

/** 命令执行结果 */
export interface CommandResult {
  /** 退出码 */
  exitCode: number
  /** 标准输出 */
  stdout?: string
  /** 标准错误 */
  stderr?: string
}

/** Hook 命令执行选项 */
export interface ExecuteHookOptions {
  /** 强制使用 zsh */
  forceZsh?: boolean
  /** 自定义 zsh 路径 */
  zshPath?: string
}

/**
 * 执行 hook 命令（支持 stdin 输入）
 * 
 * 特性：
 * - 自动展开 ~ 和 $CLAUDE_PROJECT_DIR
 * - 优先使用 zsh login shell（保留用户环境）
 * - 回退到 bash login shell
 * - 捕获 stdout 和 stderr
 * 
 * @param command 要执行的命令
 * @param stdin 标准输入内容
 * @param cwd 工作目录
 * @param options 执行选项
 */
export async function executeHookCommand(
  command: string,
  stdin: string,
  cwd: string,
  options?: ExecuteHookOptions
): Promise<CommandResult> {
  const home = getHomeDir()

  let expandedCommand = command
    .replace(/^~(?=\/|$)/g, home)
    .replace(/\s~(?=\/)/g, ` ${home}`)
    .replace(/\$CLAUDE_PROJECT_DIR/g, cwd)
    .replace(/\$\{CLAUDE_PROJECT_DIR\}/g, cwd)

  let finalCommand = expandedCommand

  if (options?.forceZsh) {
    const zshPath = findZshPath(options.zshPath)
    const escapedCommand = expandedCommand.replace(/'/g, "'\\''")
    if (zshPath) {
      finalCommand = `${zshPath} -lc '${escapedCommand}'`
    } else {
      const bashPath = findBashPath()
      if (bashPath) {
        finalCommand = `${bashPath} -lc '${escapedCommand}'`
      }
    }
  }

  return new Promise((resolve) => {
    const proc = spawn(finalCommand, {
      cwd,
      shell: true,
      env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: cwd },
    })

    let stdout = ""
    let stderr = ""

    proc.stdout?.on("data", (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on("data", (data) => {
      stderr += data.toString()
    })

    proc.stdin?.write(stdin)
    proc.stdin?.end()

    proc.on("close", (code) => {
      resolve({
        exitCode: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })

    proc.on("error", (err) => {
      resolve({
        exitCode: 1,
        stderr: err.message,
      })
    })
  })
}

/**
 * 执行简单命令并返回输出
 * 
 * 用于嵌入式命令解析（!`command` 语法）。
 * 
 * @returns 命令输出，错误时返回 [stderr: ...] 格式
 */
export async function executeCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command)

    const out = stdout?.toString().trim() ?? ""
    const err = stderr?.toString().trim() ?? ""

    if (err) {
      if (out) {
        return `${out}\n[stderr: ${err}]`
      }
      return `[stderr: ${err}]`
    }

    return out
  } catch (error: unknown) {
    const e = error as { stdout?: Buffer; stderr?: Buffer; message?: string }
    const stdout = e?.stdout?.toString().trim() ?? ""
    const stderr = e?.stderr?.toString().trim() ?? ""
    const errMsg = stderr || e?.message || String(error)

    if (stdout) {
      return `${stdout}\n[stderr: ${errMsg}]`
    }
    return `[stderr: ${errMsg}]`
  }
}

/**
 * 嵌入式命令匹配结果
 */
interface CommandMatch {
  fullMatch: string
  command: string
  start: number
  end: number
}

/** 嵌入式命令模式：!`command` */
const COMMAND_PATTERN = /!`([^`]+)`/g

/**
 * 查找文本中的所有嵌入式命令
 */
function findCommands(text: string): CommandMatch[] {
  const matches: CommandMatch[] = []
  let match: RegExpExecArray | null

  COMMAND_PATTERN.lastIndex = 0

  while ((match = COMMAND_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      command: match[1],
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return matches
}

/**
 * 递归解析文本中的嵌入式命令
 * 
 * 将文本中的 !`command` 替换为命令执行结果。
 * 支持嵌套命令（命令输出中可以再包含命令）。
 * 
 * @param text 待解析的文本
 * @param depth 当前递归深度
 * @param maxDepth 最大递归深度（防止无限递归）
 * @returns 解析后的文本
 */
export async function resolveCommandsInText(
  text: string,
  depth: number = 0,
  maxDepth: number = 3
): Promise<string> {
  if (depth >= maxDepth) {
    return text
  }

  const matches = findCommands(text)
  if (matches.length === 0) {
    return text
  }

  const tasks = matches.map((m) => executeCommand(m.command))
  const results = await Promise.allSettled(tasks)

  const replacements = new Map<string, string>()

  matches.forEach((match, idx) => {
    const result = results[idx]
    if (result.status === "rejected") {
      replacements.set(
        match.fullMatch,
        `[error: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}]`
      )
    } else {
      replacements.set(match.fullMatch, result.value)
    }
  })

  let resolved = text
  for (const [pattern, replacement] of replacements.entries()) {
    resolved = resolved.split(pattern).join(replacement)
  }

  if (findCommands(resolved).length > 0) {
    return resolveCommandsInText(resolved, depth + 1, maxDepth)
  }

  return resolved
}
