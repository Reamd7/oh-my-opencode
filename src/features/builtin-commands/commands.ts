/**
 * 内置命令注册和加载器
 * 
 * 本模块负责注册和管理所有内置命令，包括：
 * - init-deep: 初始化分层AGENTS.md知识库
 * - ralph-loop: 自引用开发循环，持续执行直到完成
 * - ulw-loop: ultrawork循环，使用ultrawork模式持续执行
 * - cancel-ralph: 取消活动的Ralph循环
 * - refactor: 智能重构命令（LSP + AST-grep + TDD）
 * - start-work: 从Prometheus计划启动Sisyphus工作会话
 */

import type { CommandDefinition } from "../claude-code-command-loader"
import type { BuiltinCommandName, BuiltinCommands } from "./types"
import { INIT_DEEP_TEMPLATE } from "./templates/init-deep"
import { RALPH_LOOP_TEMPLATE, CANCEL_RALPH_TEMPLATE } from "./templates/ralph-loop"
import { REFACTOR_TEMPLATE } from "./templates/refactor"
import { START_WORK_TEMPLATE } from "./templates/start-work"

// 内置命令定义映射表
// 每个命令包含：description（描述）、template（模板）、argumentHint（参数提示）
const BUILTIN_COMMAND_DEFINITIONS: Record<BuiltinCommandName, Omit<CommandDefinition, "name">> = {
  "init-deep": {
    description: "(builtin) Initialize hierarchical AGENTS.md knowledge base",
    template: `<command-instruction>
${INIT_DEEP_TEMPLATE}
</command-instruction>

<user-request>
$ARGUMENTS
</user-request>`,
    argumentHint: "[--create-new] [--max-depth=N]",
  },
   "ralph-loop": {
     description: "(builtin) Start self-referential development loop until completion",
     template: `<command-instruction>
${RALPH_LOOP_TEMPLATE}
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
     argumentHint: '"task description" [--completion-promise=TEXT] [--max-iterations=N]',
   },
   "ulw-loop": {
     description: "(builtin) Start ultrawork loop - continues until completion with ultrawork mode",
     template: `<command-instruction>
${RALPH_LOOP_TEMPLATE}
</command-instruction>

<user-task>
$ARGUMENTS
</user-task>`,
     argumentHint: '"task description" [--completion-promise=TEXT] [--max-iterations=N]',
   },
  "cancel-ralph": {
    description: "(builtin) Cancel active Ralph Loop",
    template: `<command-instruction>
${CANCEL_RALPH_TEMPLATE}
</command-instruction>`,
  },
  refactor: {
    description:
      "(builtin) Intelligent refactoring command with LSP, AST-grep, architecture analysis, codemap, and TDD verification.",
    template: `<command-instruction>
${REFACTOR_TEMPLATE}
</command-instruction>`,
    argumentHint: "<refactoring-target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]",
  },
  "start-work": {
    description: "(builtin) Start Sisyphus work session from Prometheus plan",
    template: `<command-instruction>
${START_WORK_TEMPLATE}
</command-instruction>

<session-context>
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP
</session-context>

<user-request>
$ARGUMENTS
</user-request>`,
    argumentHint: "[plan-name]",
  },
}

/**
 * 加载内置命令
 * 
 * @param disabledCommands - 要禁用的命令名称列表
 * @returns 启用的命令映射表
 * 
 * 工作流程：
 * 1. 创建禁用命令集合
 * 2. 遍历所有命令定义
 * 3. 过滤掉被禁用的命令
 * 4. 移除argumentHint（OpenCode不需要）
 * 5. 返回最终的命令映射表
 */
export function loadBuiltinCommands(
  disabledCommands?: BuiltinCommandName[]
): BuiltinCommands {
  const disabled = new Set(disabledCommands ?? [])
  const commands: BuiltinCommands = {}

  // 遍历所有命令定义，过滤禁用的命令
  for (const [name, definition] of Object.entries(BUILTIN_COMMAND_DEFINITIONS)) {
    if (!disabled.has(name as BuiltinCommandName)) {
      // 移除argumentHint，保持OpenCode兼容性
      const { argumentHint: _argumentHint, ...openCodeCompatible } = definition
      commands[name] = { ...openCodeCompatible, name } as CommandDefinition
    }
  }

  return commands
}
