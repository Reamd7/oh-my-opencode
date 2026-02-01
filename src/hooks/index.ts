/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 钩子系统核心 - Hook System Core
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * oh-my-opencode 的钩子系统提供了 32 个生命周期钩子，用于拦截和修改代理行为。
 * The hook system provides 32 lifecycle hooks to intercept and modify agent behavior.
 * 
 * 
 * ## 钩子命名规范 Hook Naming Convention
 * 
 * 所有钩子工厂函数遵循命名模式：`createXXXHook`
 * All hook factory functions follow the pattern: `createXXXHook`
 * 
 * 每个钩子位于独立的子目录中，通过 index.ts 导出工厂函数
 * Each hook resides in its own subdirectory, exposing a factory function via index.ts
 * 
 * 
 * ## 钩子组织方式 Hook Organization
 * 
 * hooks/
 * ├── <hook-name>/
 * │   ├── index.ts          # 钩子工厂函数 Hook factory function
 * │   ├── types.ts          # 类型定义（可选） Type definitions (optional)
 * │   ├── constants.ts      # 常量定义（可选） Constants (optional)
 * │   └── *.test.ts         # 单元测试 Unit tests
 * └── index.ts              # 本文件：聚合导出 This file: Aggregated exports
 * 
 * 
 * ## 钩子生命周期事件 Hook Lifecycle Events
 * 
 * | 事件类型 Event Type                  | 触发时机 Timing           | 可阻塞 Can Block | 用途 Use Case                           |
 * |-------------------------------------|---------------------------|------------------|-----------------------------------------|
 * | chat.message (UserPromptSubmit)     | 用户消息提交前             | ✅ Yes            | 关键词检测、斜杠命令、消息预处理          |
 * | tool.execute.before (PreToolUse)    | 工具调用前                 | ✅ Yes            | 参数验证、上下文注入、输入转换            |
 * | tool.execute.after (PostToolUse)    | 工具调用后                 | ❌ No             | 输出转换、错误恢复、结果缓存              |
 * | event (Stop)                        | 会话停止时                 | ❌ No             | 自动继续、通知发送                       |
 * | experimental.chat.messages.transform (onSummarize) | 上下文压缩时 | ❌ No   | 状态保存、摘要上下文注入                  |
 * 
 * 
 * ## 钩子执行顺序 Hook Execution Order
 * 
 * ### UserPromptSubmit (chat.message)
 * 
 * 1. keywordDetector       - 检测 ultrawork/search/analyze 模式关键词
 * 2. claudeCodeHooks       - Claude Code 兼容层
 * 3. autoSlashCommand      - 自动检测 /command 模式
 * 4. startWork             - Sisyphus 工作会话启动器
 * 
 * 
 * ### PreToolUse (tool.execute.before)
 * 
 * 1. questionLabelTruncator   - 自动截断问题标签（防止上下文膨胀）
 * 2. claudeCodeHooks          - Claude Code 兼容层
 * 3. nonInteractiveEnv        - 非 TTY 环境处理
 * 4. commentChecker           - 阻止 AI 添加过多注释
 * 5. directoryAgentsInjector  - 自动注入 AGENTS.md
 * 6. directoryReadmeInjector  - 自动注入 README.md
 * 7. rulesInjector            - 条件规则注入
 * 8. prometheusMdOnly         - Planner 只读模式
 * 9. sisyphusJuniorNotepad    - Sisyphus Junior 记事本
 * 10. atlasHook               - 主编排钩子（Orchestrator）
 * 
 * 
 * ### PostToolUse (tool.execute.after)
 * 
 * 1. claudeCodeHooks              - Claude Code 兼容层
 * 2. toolOutputTruncator          - 工具输出截断（防止上下文膨胀）
 * 3. contextWindowMonitor         - 上下文窗口监控
 * 4. commentChecker               - 注释检查警告
 * 5. directoryAgentsInjector      - AGENTS.md 注入后处理
 * 6. directoryReadmeInjector      - README.md 注入后处理
 * 7. rulesInjector                - 规则注入后处理
 * 8. emptyTaskResponseDetector    - 检测空响应
 * 9. agentUsageReminder           - 专业代理使用提示
 * 10. interactiveBashSession      - Tmux 会话管理
 * 11. editErrorRecovery           - Edit 工具错误恢复
 * 12. delegateTaskRetry           - 委托任务重试
 * 13. atlasHook                   - 主编排钩子（验证）
 * 14. taskResumeInfo              - 取消任务的恢复信息
 * 
 * 
 * ### Stop (event)
 * 
 * - ralphLoop                  - 自引用开发循环自动继续
 * - sessionNotification        - 会话停止通知
 * - contextWindowMonitor       - 清理已提醒会话
 * 
 * 
 * ### onSummarize (experimental.chat.messages.transform)
 * 
 * - compactionContextInjector  - 上下文压缩时注入状态
 * 
 * 
 * ## 钩子注册机制 Hook Registration
 * 
 * 钩子通过 src/index.ts 主插件入口注册到 OpenCode 插件系统：
 * Hooks are registered in the main plugin entry (src/index.ts):
 * 
 * ```typescript
 * export default function createPlugin(input: PluginInput): Plugin {
 *   return {
 *     chat: {
 *       message: async (message, sessionID) => {
 *         // UserPromptSubmit hooks
 *         await keywordDetectorHook["chat.message"](message, sessionID)
 *         await claudeCodeHooksHook["chat.message"]?.(message, sessionID)
 *         // ...
 *       }
 *     },
 *     tool: {
 *       execute: {
 *         before: async (input, output) => {
 *           // PreToolUse hooks
 *           await questionLabelTruncatorHook["tool.execute.before"](input, output)
 *           await claudeCodeHooksHook["tool.execute.before"]?.(input, output)
 *           // ...
 *         },
 *         after: async (input, output) => {
 *           // PostToolUse hooks
 *           await claudeCodeHooksHook["tool.execute.after"]?.(input, output)
 *           await toolOutputTruncatorHook["tool.execute.after"](input, output)
 *           // ...
 *         }
 *       }
 *     }
 *   }
 * }
 * ```
 * 
 * 
 * ## 钩子工厂模式 Hook Factory Pattern
 * 
 * 所有钩子遵循工厂函数模式，接收 PluginInput 上下文：
 * All hooks follow the factory function pattern, receiving PluginInput context:
 * 
 * ```typescript
 * // 单事件钩子 Single-event hook
 * export function createToolOutputTruncatorHook(ctx: PluginInput) {
 *   return {
 *     "tool.execute.after": async (input, output) => {
 *       // 修改 output.output 字段
 *       // Modify output.output field
 *     }
 *   }
 * }
 * 
 * // 多事件钩子（带状态） Multi-event hook with state
 * export function createContextWindowMonitorHook(ctx: PluginInput) {
 *   const remindedSessions = new Set<string>()  // 跨调用状态
 *   
 *   return {
 *     "tool.execute.after": async (input, output) => {
 *       // 监控并注入提醒
 *     },
 *     "event": async ({ event }) => {
 *       // 清理已删除会话
 *       if (event.type === "session.deleted") {
 *         remindedSessions.delete(sessionID)
 *       }
 *     }
 *   }
 * }
 * ```
 * 
 * 
 * ## 钩子禁用 Hook Disabling
 * 
 * 可通过配置文件禁用特定钩子：
 * Hooks can be disabled via configuration:
 * 
 * ```jsonc
 * // .opencode/oh-my-opencode.json
 * {
 *   "disabled_hooks": {
 *     "chat.message": ["keywordDetector"],
 *     "tool.execute.before": ["commentChecker"],
 *     "tool.execute.after": ["agentUsageReminder"]
 *   }
 * }
 * ```
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 核心生产力钩子 Core Productivity Hooks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * TODO 延续执行器 - Todo Continuation Enforcer
 * 
 * **最重要的钩子之一** - 这是让 Sisyphus 持续推动"巨石"的核心机制
 * The MOST IMPORTANT hook - this is what keeps Sisyphus rolling that boulder
 * 
 * 功能 Features:
 * - 强制代理完成 TODO 列表中的所有项目
 * - 检测代理是否中途退出
 * - 自动注入继续执行的提示
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测 TODO 未完成
 * - Stop: 自动继续会话
 */
export { createTodoContinuationEnforcer, type TodoContinuationEnforcer } from "./todo-continuation-enforcer";

/**
 * 上下文窗口监控器 - Context Window Monitor
 * 
 * 监控 Anthropic Claude 的上下文使用情况，提醒剩余空间
 * Monitors Anthropic Claude context usage and reminds of remaining capacity
 * 
 * 功能 Features:
 * - 追踪会话上下文窗口使用率
 * - 达到 70% 阈值时注入提醒
 * - 显示已用/剩余令牌统计
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检查上下文使用率
 * - Event: 清理已删除会话
 */
export { createContextWindowMonitorHook } from "./context-window-monitor";

/**
 * 会话通知 - Session Notification
 * 
 * 会话停止时发送系统通知（macOS/Linux/Windows）
 * Sends system notification when session stops
 * 
 * 功能 Features:
 * - 跨平台系统通知
 * - 通知内容可定制
 * 
 * 触发时机 Triggers:
 * - Stop: 会话停止时
 */
export { createSessionNotification } from "./session-notification";

/**
 * 会话恢复 - Session Recovery
 * 
 * 自动从崩溃中恢复会话状态
 * Automatically recovers session state from crashes
 * 
 * 功能 Features:
 * - 检测会话崩溃
 * - 恢复未完成的工作
 * - 保存关键状态
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 检测恢复需求
 * - Stop: 保存会话状态
 */
export { createSessionRecoveryHook, type SessionRecoveryHook, type SessionRecoveryOptions } from "./session-recovery";

/**
 * 注释检查器 - Comment Checker
 * 
 * **代码质量守护者** - 防止 AI 添加过多注释
 * Code quality guardian - prevents AI from adding excessive comments
 * 
 * 功能 Features:
 * - 检测代码中的注释密度
 * - 阻止 AI slop（过度注释）
 * - 保持代码简洁
 * 
 * 原则 Principle:
 * "AI 生成的代码应与人类代码无法区分"
 * "AI-generated code should be indistinguishable from human code"
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 警告即将写入注释
 * - PostToolUse: 检查已写入的注释
 */
export { createCommentCheckerHooks } from "./comment-checker";

/**
 * 工具输出截断器 - Tool Output Truncator
 * 
 * 防止工具输出过大导致上下文窗口膨胀
 * Prevents tool outputs from bloating the context window
 * 
 * 功能 Features:
 * - 自动截断大型工具输出
 * - 针对不同工具的特定限制（如 webfetch）
 * - 保留最相关的内容
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 截断输出
 */
export { createToolOutputTruncatorHook } from "./tool-output-truncator";

/**
 * 目录 AGENTS.md 注入器 - Directory Agents Injector
 * 
 * 自动注入项目的 AGENTS.md 知识库
 * Automatically injects project's AGENTS.md knowledge base
 * 
 * 功能 Features:
 * - 检测项目根目录和子目录的 AGENTS.md
 * - 自动注入到代理提示中
 * - 避免重复注入
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 注入 AGENTS.md 内容
 * - PostToolUse: 清理注入标记
 */
export { createDirectoryAgentsInjectorHook } from "./directory-agents-injector";

/**
 * 目录 README.md 注入器 - Directory Readme Injector
 * 
 * 自动注入项目的 README.md 文档
 * Automatically injects project's README.md documentation
 * 
 * 功能 Features:
 * - 检测项目根目录的 README.md
 * - 自动注入到代理提示中
 * - 避免重复注入
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 注入 README.md 内容
 * - PostToolUse: 清理注入标记
 */
export { createDirectoryReadmeInjectorHook } from "./directory-readme-injector";

/**
 * 空任务响应检测器 - Empty Task Response Detector
 * 
 * 检测代理返回空响应（代理"偷懒"）
 * Detects when agents return empty responses (agent "laziness")
 * 
 * 功能 Features:
 * - 检测空的 delegate_task 响应
 * - 强制代理重新执行
 * - 记录空响应事件
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测空响应
 */
export { createEmptyTaskResponseDetectorHook } from "./empty-task-response-detector";

/**
 * Anthropic 上下文窗口限制恢复 - Anthropic Context Window Limit Recovery
 * 
 * 当达到上下文限制时自动触发摘要压缩
 * Automatically triggers summarization when context limit is reached
 * 
 * 功能 Features:
 * - 监控 Anthropic 上下文使用
 * - 达到阈值时自动压缩
 * - 保留关键信息
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测上下文限制
 * - Event: 触发压缩
 */
export { createAnthropicContextWindowLimitRecoveryHook, type AnthropicContextWindowLimitRecoveryOptions } from "./anthropic-context-window-limit-recovery";


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 上下文管理钩子 Context Management Hooks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 压缩上下文注入器 - Compaction Context Injector
 * 
 * 在上下文压缩时注入关键状态信息
 * Injects critical state information during context compaction
 * 
 * 功能 Features:
 * - 在摘要前保存状态
 * - 注入到压缩后的上下文
 * - 防止重要信息丢失
 * 
 * 触发时机 Triggers:
 * - onSummarize: 上下文压缩时
 */
export { createCompactionContextInjector } from "./compaction-context-injector";

/**
 * 思考模式 - Think Mode
 * 
 * 动态调整代理的思考令牌预算
 * Dynamically adjusts agent's thinking token budget
 * 
 * 功能 Features:
 * - 根据任务复杂度调整思考预算
 * - 支持扩展思维（Extended Thinking）
 * - 优化推理质量
 * 
 * 触发时机 Triggers:
 * - chat.params: 调整思考预算
 * - Event: 清理状态
 */
export { createThinkModeHook } from "./think-mode";

/**
 * Claude Code 兼容钩子 - Claude Code Hooks
 * 
 * **兼容层** - 完整的 Claude Code settings.json 兼容性
 * Compatibility layer for Claude Code settings.json
 * 
 * 功能 Features:
 * - PreToolUse / PostToolUse 钩子
 * - UserPromptSubmit 钩子
 * - Stop 钩子
 * - onSummarize 钩子
 * - 完整的 Claude Code 功能覆盖
 * 
 * 触发时机 Triggers:
 * - All: 所有生命周期事件
 */
export { createClaudeCodeHooksHook } from "./claude-code-hooks";

/**
 * 规则注入器 - Rules Injector
 * 
 * 根据条件注入自定义规则到代理提示
 * Injects conditional custom rules into agent prompts
 * 
 * 功能 Features:
 * - 基于文件路径的条件规则
 * - 基于工具名称的条件规则
 * - 基于代理类型的条件规则
 * - 支持正则表达式匹配
 * 
 * 示例 Example:
 * ```jsonc
 * // RULE: If working with React components
 * // FILES: src/components/**\/*.tsx
 * Always use TypeScript strict mode
 * ```
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 注入规则
 * - PostToolUse: 清理规则
 */
export { createRulesInjectorHook } from "./rules-injector";

/**
 * 后台通知 - Background Notification
 * 
 * 后台任务完成时发送系统通知
 * Sends system notification when background tasks complete
 * 
 * 功能 Features:
 * - 跨平台系统通知
 * - 任务成功/失败通知
 * - 可配置通知内容
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测后台任务完成
 */
export { createBackgroundNotificationHook } from "./background-notification"

/**
 * 自动更新检查器 - Auto Update Checker
 * 
 * 定期检查 oh-my-opencode 插件更新
 * Periodically checks for oh-my-opencode plugin updates
 * 
 * 功能 Features:
 * - 检查 npm 最新版本
 * - 提示用户更新
 * - 缓存检查结果
 * 
 * 触发时机 Triggers:
 * - UserPromptSubmit: 检查更新
 */
export { createAutoUpdateCheckerHook } from "./auto-update-checker";


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 代理协作钩子 Agent Collaboration Hooks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 代理使用提醒器 - Agent Usage Reminder
 * 
 * 提示使用专业代理（explore, librarian）而非直接工具调用
 * Reminds to use specialized agents instead of direct tool calls
 * 
 * 功能 Features:
 * - 检测直接工具调用
 * - 建议使用更合适的代理
 * - 教育式提示
 * 
 * 示例 Example:
 * "检测到直接调用 grep。建议使用 delegate_task(agent='explore') 获得更好的结果"
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测工具调用模式
 */
export { createAgentUsageReminderHook } from "./agent-usage-reminder";

/**
 * 关键词检测器 - Keyword Detector
 * 
 * **魔法关键词** - 检测 ultrawork/ulw、search、analyze 等特殊关键词
 * Magic keywords - detects ultrawork/ulw, search, analyze, and other special keywords
 * 
 * 功能 Features:
 * - 检测 "ultrawork" 或 "ulw" → 启用完整工作流
 * - 检测 "search" → 激活搜索模式
 * - 检测 "analyze" → 激活分析模式
 * - 注入相应的工作流指令
 * 
 * 触发时机 Triggers:
 * - UserPromptSubmit: 检测关键词
 */
export { createKeywordDetectorHook } from "./keyword-detector";

/**
 * 非交互式环境处理器 - Non-Interactive Environment Handler
 * 
 * 处理非 TTY 环境（如 CI/CD）的特殊情况
 * Handles special cases for non-TTY environments (e.g., CI/CD)
 * 
 * 功能 Features:
 * - 检测非交互式环境
 * - 禁用需要用户输入的工具
 * - 注入环境提示
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 检测环境
 */
export { createNonInteractiveEnvHook } from "./non-interactive-env";

/**
 * 交互式 Bash 会话 - Interactive Bash Session
 * 
 * Tmux 集成 - 支持交互式终端应用（vim, htop, pudb）
 * Tmux integration - supports interactive terminal applications
 * 
 * 功能 Features:
 * - 创建和管理 Tmux 会话
 * - 支持 TUI 应用
 * - 会话生命周期管理
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测 interactive_bash 调用
 * - Event: 清理会话
 */
export { createInteractiveBashSessionHook } from "./interactive-bash-session";


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 高级工作流钩子 Advanced Workflow Hooks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 思考块验证器 - Thinking Block Validator
 * 
 * 确保代理的 <thinking> 块格式正确
 * Ensures agent's <thinking> blocks are properly formatted
 * 
 * 功能 Features:
 * - 检测未闭合的 <thinking> 标签
 * - 验证 XML 格式
 * - 防止格式错误
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 验证输出
 */
export { createThinkingBlockValidatorHook } from "./thinking-block-validator";

/**
 * 类别技能提醒器 - Category Skill Reminder
 * 
 * 提醒使用类别委托时加载相关技能
 * Reminds to load relevant skills when using category delegation
 * 
 * 功能 Features:
 * - 检测 delegate_task 调用
 * - 检查是否加载了相关技能
 * - 建议应加载的技能
 * 
 * 示例 Example:
 * "检测到 visual-engineering 类别，建议加载 'frontend-ui-ux' 技能"
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测委托调用
 */
export { createCategorySkillReminderHook } from "./category-skill-reminder";

/**
 * Ralph Loop 循环 - Ralph Loop
 * 
 * **自引用开发循环** - 持续工作直到完成
 * Self-referential development loop - continues until completion
 * 
 * 功能 Features:
 * - 启动自动开发循环
 * - 持续执行直到所有任务完成
 * - 支持中断和恢复
 * - 自动验证和修复
 * 
 * 使用 Usage:
 * /ralph-loop 或 在提示中包含特定关键词
 * 
 * 触发时机 Triggers:
 * - UserPromptSubmit: 启动循环
 * - Stop: 自动继续
 */
export { createRalphLoopHook, type RalphLoopHook } from "./ralph-loop";

/**
 * 自动斜杠命令 - Auto Slash Command
 * 
 * 检测并执行 /command 格式的命令
 * Detects and executes /command format commands
 * 
 * 功能 Features:
 * - 检测 /refactor, /commit, /playwright 等命令
 * - 自动加载相应的命令模板
 * - 传递参数
 * 
 * 支持命令 Supported Commands:
 * - /refactor - 智能重构
 * - /commit - Git 提交助手
 * - /playwright - 浏览器自动化
 * - /git-master - Git 高级操作
 * - 等等...
 * 
 * 触发时机 Triggers:
 * - UserPromptSubmit: 检测命令
 */
export { createAutoSlashCommandHook } from "./auto-slash-command";

/**
 * Edit 错误恢复 - Edit Error Recovery
 * 
 * 从 Edit 工具失败中自动恢复
 * Automatically recovers from Edit tool failures
 * 
 * 功能 Features:
 * - 检测 "oldString not found" 错误
 * - 检测 "oldString found multiple times" 错误
 * - 注入恢复建议
 * - 提供调试信息
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测错误
 */
export { createEditErrorRecoveryHook } from "./edit-error-recovery";

/**
 * Prometheus 只读模式 - Prometheus MD Only
 * 
 * **规划代理保护** - 限制 Prometheus 只能读写计划文件
 * Planner protection - restricts Prometheus to only read/write plan files
 * 
 * 功能 Features:
 * - 检测 Prometheus 代理
 * - 阻止修改非 .sisyphus/ 文件
 * - 允许读取项目文件
 * - 强制只写计划文档
 * 
 * 原则 Principle:
 * Prometheus 是战略规划者，不是实施者
 * Prometheus is a strategic planner, not an implementer
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 验证工具权限
 */
export { createPrometheusMdOnlyHook } from "./prometheus-md-only";

/**
 * Sisyphus Junior 记事本 - Sisyphus Junior Notepad
 * 
 * 为子代理提供记事本功能，记录学习和发现
 * Provides notepad functionality for subagents to record learnings and discoveries
 * 
 * 功能 Features:
 * - 自动创建记事本目录
 * - 跨任务保留笔记
 * - 支持 markdown 格式
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 注入记事本说明
 */
export { createSisyphusJuniorNotepadHook } from "./sisyphus-junior-notepad";

/**
 * 任务恢复信息 - Task Resume Info
 * 
 * 为被取消的任务提供恢复信息
 * Provides resume information for cancelled tasks
 * 
 * 功能 Features:
 * - 检测任务取消
 * - 保存会话 ID
 * - 注入恢复指令
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测取消
 */
export { createTaskResumeInfoHook } from "./task-resume-info";

/**
 * 启动工作 - Start Work
 * 
 * 从 Prometheus 计划启动 Sisyphus 工作会话
 * Starts Sisyphus work session from Prometheus plan
 * 
 * 功能 Features:
 * - 检测 /start-work 命令
 * - 加载计划文件
 * - 启动执行会话
 * - 注入工作上下文
 * 
 * 触发时机 Triggers:
 * - UserPromptSubmit: 检测启动命令
 */
export { createStartWorkHook } from "./start-work";

/**
 * Atlas 编排钩子 - Atlas Hook
 * 
 * **主编排器** - 最复杂的钩子（752 行）
 * Master orchestrator - the most complex hook (752 lines)
 * 
 * 功能 Features:
 * - 检测编排器代理
 * - 强制执行委托规则
 * - 验证子代理工作
 * - 管理 Boulder 状态
 * - 注入编排指令
 * 
 * 规则 Rules:
 * - 编排器不应直接修改代码
 * - 必须通过 delegate_task 委托工作
 * - 必须验证子代理结果
 * - 必须使用 /playwright 进行 UI QA
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 注入编排规则
 * - PostToolUse: 验证编排行为
 */
export { createAtlasHook } from "./atlas";

/**
 * 委托任务重试 - Delegate Task Retry
 * 
 * 自动重试失败的委托任务
 * Automatically retries failed delegate_task calls
 * 
 * 功能 Features:
 * - 检测委托失败
 * - 自动重试（最多 3 次）
 * - 指数退避
 * - 记录重试历史
 * 
 * 触发时机 Triggers:
 * - PostToolUse: 检测失败
 */
export { createDelegateTaskRetryHook } from "./delegate-task-retry";

/**
 * 问题标签截断器 - Question Label Truncator
 * 
 * 自动截断过长的问题标签（防止上下文膨胀）
 * Automatically truncates overly long question labels
 * 
 * 功能 Features:
 * - 检测过长的问题标签
 * - 自动截断到 30 字符
 * - 保留可读性
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 截断标签
 */
export { createQuestionLabelTruncatorHook } from "./question-label-truncator";

/**
 * 子代理问题阻止器 - Subagent Question Blocker
 * 
 * 阻止子代理使用 question 工具（减少交互）
 * Blocks subagents from using question tool (reduces interaction)
 * 
 * 功能 Features:
 * - 检测子代理调用 question 工具
 * - 阻止并注入警告
 * - 建议替代方案
 * 
 * 原则 Principle:
 * 子代理应该自主工作，避免打断编排器
 * Subagents should work autonomously, avoiding interruptions
 * 
 * 触发时机 Triggers:
 * - PreToolUse: 检测 question 调用
 */
export { createSubagentQuestionBlockerHook } from "./subagent-question-blocker";
