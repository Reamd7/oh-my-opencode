/**
 * interactive-bash - 交互式终端工具
 * 
 * ## 功能
 * 管理Tmux交互式会话（vim, htop等TUI应用）
 * 
 * ## 与Bash工具的区别
 * - Bash: 一次性命令（git status, npm install）
 * - Interactive-bash: 持续交互的TUI应用（vim, htop, pudb）
 * 
 * ## 使用场景
 * - 启动vim编辑器
 * - 运行htop监控
 * - 启动Python调试器（pudb）
 * - 管理tmux会话
 * 
 * ## 限制
 * - 阻止capture-pane等读取命令（使用Bash工具代替）
 * - 60s超时保护
 * 
 * ## 示例
 * interactive_bash(tmux_command="new-session -d -s omo-dev")
 * interactive_bash(tmux_command="send-keys -t omo-dev 'vim' Enter")
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { BLOCKED_TMUX_SUBCOMMANDS, DEFAULT_TIMEOUT_MS, INTERACTIVE_BASH_DESCRIPTION } from "./constants"
import { getCachedTmuxPath } from "./utils"

/**
 * 命令分词器（支持引号和转义）
 * 处理单引号/双引号和反斜杠转义，无需外部依赖
 */
export function tokenizeCommand(cmd: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inQuote = false
  let quoteChar = ""
  let escaped = false

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i]

    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if ((char === "'" || char === '"') && !inQuote) {
      inQuote = true
      quoteChar = char
    } else if (char === quoteChar && inQuote) {
      inQuote = false
      quoteChar = ""
    } else if (char === " " && !inQuote) {
      if (current) {
        tokens.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }

  if (current) tokens.push(current)
  return tokens
}

/**
 * interactive_bash工具定义
 * 直接传递tmux子命令（不带'tmux'前缀）
 */
export const interactive_bash: ToolDefinition = tool({
  description: INTERACTIVE_BASH_DESCRIPTION,
  args: {
    tmux_command: tool.schema.string().describe("The tmux command to execute (without 'tmux' prefix)"),
  },
  execute: async (args) => {
    try {
      // 获取tmux路径
      const tmuxPath = getCachedTmuxPath() ?? "tmux"

      // 分词命令
      const parts = tokenizeCommand(args.tmux_command)

      if (parts.length === 0) {
        return "Error: Empty tmux command"
      }

      // 检查是否为阻止的子命令
      const subcommand = parts[0].toLowerCase()
      if (BLOCKED_TMUX_SUBCOMMANDS.includes(subcommand)) {
        const sessionIdx = parts.findIndex(p => p === "-t" || p.startsWith("-t"))
        let sessionName = "omo-session"
        if (sessionIdx !== -1) {
          if (parts[sessionIdx] === "-t" && parts[sessionIdx + 1]) {
            sessionName = parts[sessionIdx + 1]
          } else if (parts[sessionIdx].startsWith("-t")) {
            sessionName = parts[sessionIdx].slice(2)
          }
        }

        return `Error: '${parts[0]}' is blocked in interactive_bash.

**USE BASH TOOL INSTEAD:**

\`\`\`bash
# Capture terminal output
tmux capture-pane -p -t ${sessionName}

# Or capture with history (last 1000 lines)
tmux capture-pane -p -t ${sessionName} -S -1000
\`\`\`

The Bash tool can execute these commands directly. Do NOT retry with interactive_bash.`
      }

      // 执行tmux命令
      const proc = Bun.spawn([tmuxPath, ...parts], {
        stdout: "pipe",
        stderr: "pipe",
      })

      // 设置超时保护
      const timeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(() => {
          proc.kill()
          reject(new Error(`Timeout after ${DEFAULT_TIMEOUT_MS}ms`))
        }, DEFAULT_TIMEOUT_MS)
        proc.exited.then(() => clearTimeout(id))
      })

      // 并行读取stdout和stderr，避免竞态条件
      const [stdout, stderr, exitCode] = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]),
        timeoutPromise,
      ])

      // 检查退出码
      if (exitCode !== 0) {
        const errorMsg = stderr.trim() || `Command failed with exit code ${exitCode}`
        return `Error: ${errorMsg}`
      }

      return stdout || "(no output)"
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
  },
})
