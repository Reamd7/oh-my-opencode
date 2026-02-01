/**
 * 非交互环境检测钩子
 * 
 * 功能：
 * - 检测CI/CD等非交互环境
 * - 为git命令自动添加非交互环境变量
 * - 警告可能导致挂起的交互式命令
 * 
 * 使用场景：
 * - GitHub Actions、GitLab CI等CI/CD环境
 * - 无TTY的自动化脚本
 * - 防止git编辑器、分页器等阻塞执行
 */
import type { PluginInput } from "@opencode-ai/plugin"
import type { ShellType } from "../../shared"
import { HOOK_NAME, NON_INTERACTIVE_ENV, SHELL_COMMAND_PATTERNS } from "./constants"
import { isNonInteractive } from "./detector"
import { log, buildEnvPrefix } from "../../shared"

export * from "./constants"
export * from "./detector"
export * from "./types"

// 构建禁用命令的正则表达式列表
const BANNED_COMMAND_PATTERNS = SHELL_COMMAND_PATTERNS.banned
  .filter((cmd) => !cmd.includes("("))
  .map((cmd) => new RegExp(`\\b${cmd}\\b`))

/**
 * 检测命令中是否包含禁用的交互式命令
 */
function detectBannedCommand(command: string): string | undefined {
  for (let i = 0; i < BANNED_COMMAND_PATTERNS.length; i++) {
    if (BANNED_COMMAND_PATTERNS[i].test(command)) {
      return SHELL_COMMAND_PATTERNS.banned[i]
    }
  }
  return undefined
}

/**
 * 创建非交互环境钩子
 * 
 * 在工具执行前检查并调整命令：
 * 1. 检测禁用的交互式命令并发出警告
 * 2. 为git命令添加非交互环境变量（GIT_EDITOR=true, GIT_PAGER=cat等）
 * 3. 防止在CI/CD环境中因交互式提示而挂起
 */
export function createNonInteractiveEnvHook(_ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      // 仅处理bash工具
      if (input.tool.toLowerCase() !== "bash") {
        return
      }

      const command = output.args.command as string | undefined
      if (!command) {
        return
      }

      // 检测并警告禁用的交互式命令
      const bannedCmd = detectBannedCommand(command)
      if (bannedCmd) {
        output.message = `Warning: '${bannedCmd}' is an interactive command that may hang in non-interactive environments.`
      }

      // 仅为git命令添加环境变量（防止编辑器、分页器阻塞）
      const isGitCommand = /\bgit\b/.test(command)
      if (!isGitCommand) {
        return
      }

      if (!isNonInteractive()) {
        return
      }

      // bash工具始终在Unix-like shell中运行（bash/sh），即使在Windows上
      // （通过Git Bash、WSL等），因此始终使用unix导出语法
      // 修复GitHub issues #983和#889
      const shellType: ShellType = "unix"
      const envPrefix = buildEnvPrefix(NON_INTERACTIVE_ENV, shellType)
      output.args.command = `${envPrefix} ${command}`

      log(`[${HOOK_NAME}] Prepended non-interactive env vars to git command`, {
        sessionID: input.sessionID,
        envPrefix,
      })
    },
  }
}
