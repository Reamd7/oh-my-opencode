/**
 * 自动斜杠命令钩子 (Auto Slash Command Hook)
 * 
 * 自动检测用户消息中的斜杠命令（如 /commit, /plan）并将其转换为命令模板。
 * 这使得用户可以直接输入 /command 而无需手动调用 slashcommand 工具。
 * 
 * Automatically detects slash commands (like /commit, /plan) in user messages
 * and converts them to command templates. This allows users to type /command
 * directly without manually invoking the slashcommand tool.
 * 
 * 工作流程 (Workflow):
 * 1. 检测消息中的斜杠命令模式 (Detect slash command pattern in message)
 * 2. 解析命令名称和参数 (Parse command name and arguments)
 * 3. 查找对应的命令模板 (Find corresponding command template)
 * 4. 替换原始消息为命令模板 (Replace original message with command template)
 * 
 * 命令来源优先级 (Command source priority):
 * - .opencode/command/ (项目级 OpenCode 命令 / Project-level OpenCode commands)
 * - .claude/commands/ (项目级 Claude 命令 / Project-level Claude commands)
 * - ~/.config/opencode/command/ (用户级 OpenCode 命令 / User-level OpenCode commands)
 * - ~/.claude/commands/ (用户级 Claude 命令 / User-level Claude commands)
 * - Skills (技能命令 / Skill commands)
 */

import {
  detectSlashCommand,
  extractPromptText,
} from "./detector"
import { executeSlashCommand, type ExecutorOptions } from "./executor"
import { log } from "../../shared"
import {
  AUTO_SLASH_COMMAND_TAG_OPEN,
  AUTO_SLASH_COMMAND_TAG_CLOSE,
} from "./constants"
import type {
  AutoSlashCommandHookInput,
  AutoSlashCommandHookOutput,
} from "./types"
import type { LoadedSkill } from "../../features/opencode-skill-loader"

export * from "./detector"
export * from "./executor"
export * from "./constants"
export * from "./types"

// 会话级命令去重缓存 - 防止同一命令在同一会话中被重复处理
// Session-level command deduplication cache - prevents same command from being processed multiple times
const sessionProcessedCommands = new Set<string>()

export interface AutoSlashCommandHookOptions {
  skills?: LoadedSkill[]
}

/**
 * 创建自动斜杠命令钩子
 * Creates auto slash command hook
 * 
 * @param options - 配置选项，包含可用的技能列表 (Configuration options including available skills)
 * @returns 钩子对象，监听 chat.message 事件 (Hook object that listens to chat.message event)
 */
export function createAutoSlashCommandHook(options?: AutoSlashCommandHookOptions) {
  const executorOptions: ExecutorOptions = {
    skills: options?.skills,
  }

  return {
    "chat.message": async (
      input: AutoSlashCommandHookInput,
      output: AutoSlashCommandHookOutput
    ): Promise<void> => {
      const promptText = extractPromptText(output.parts)

      // 跳过已经被处理过的命令（避免重复转换）
      // Skip already processed commands (avoid duplicate conversion)
      if (
        promptText.includes(AUTO_SLASH_COMMAND_TAG_OPEN) ||
        promptText.includes(AUTO_SLASH_COMMAND_TAG_CLOSE)
      ) {
        return
      }

      // 检测斜杠命令模式 (Detect slash command pattern)
      const parsed = detectSlashCommand(promptText)

      if (!parsed) {
        return
      }

      // 会话级去重：防止同一命令在同一消息中被重复处理
      // Session-level deduplication: prevent same command from being processed multiple times
      const commandKey = `${input.sessionID}:${input.messageID}:${parsed.command}`
      if (sessionProcessedCommands.has(commandKey)) {
        return
      }
      sessionProcessedCommands.add(commandKey)

      log(`[auto-slash-command] Detected: /${parsed.command}`, {
        sessionID: input.sessionID,
        args: parsed.args,
      })

      // 执行命令：查找并加载命令模板 (Execute command: find and load command template)
      const result = await executeSlashCommand(parsed, executorOptions)

      const idx = output.parts.findIndex((p) => p.type === "text" && p.text)
      if (idx < 0) {
        return
      }

      // 命令未找到或执行失败，跳过转换 (Command not found or execution failed, skip conversion)
      if (!result.success || !result.replacementText) {
        log(`[auto-slash-command] Command not found, skipping`, {
          sessionID: input.sessionID,
          command: parsed.command,
          error: result.error,
        })
        return
      }

      // 替换原始消息为命令模板，并添加标记防止重复处理
      // Replace original message with command template, add tags to prevent reprocessing
      const taggedContent = `${AUTO_SLASH_COMMAND_TAG_OPEN}\n${result.replacementText}\n${AUTO_SLASH_COMMAND_TAG_CLOSE}`
      output.parts[idx].text = taggedContent

      log(`[auto-slash-command] Replaced message with command template`, {
        sessionID: input.sessionID,
        command: parsed.command,
      })
    },
  }
}
