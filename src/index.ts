/**
 * @fileoverview Oh My OpenCode 插件主入口文件
 * 
 * 这是 oh-my-opencode 插件的核心架构文件，负责：
 * 1. 加载和初始化所有生命周期钩子（32个）
 * 2. 注册工具集（20+个工具，包括LSP、AST-Grep、代理委托等）
 * 3. 配置10个专业化AI代理（Sisyphus、Oracle、Librarian等）
 * 4. 管理后台任务和并行代理执行
 * 5. 提供完整的Claude Code兼容层
 * 6. 集成内置MCP服务器（websearch、context7、grep_app）
 * 
 * 架构设计：
 * - 插件采用三层配置系统：项目配置 → 用户配置 → 默认配置
 * - 所有钩子都可通过 disabled_hooks 配置禁用
 * - 支持多模型编排和任务委托
 * - 提供完整的会话状态管理和恢复机制
 * 
 * @module oh-my-opencode
 * @version 3.0.0
 */

import type { Plugin } from "@opencode-ai/plugin";

// ============================================================================
// 生命周期钩子导入
// ============================================================================
// 这些钩子在插件生命周期的不同阶段被调用，用于扩展和修改OpenCode的行为
import {
  createTodoContinuationEnforcer,        // Todo持续执行强制器：防止代理中途放弃任务
  createContextWindowMonitorHook,        // 上下文窗口监控：跟踪token使用情况
  createSessionRecoveryHook,             // 会话恢复：从错误中自动恢复会话
  createSessionNotification,             // 会话通知：显示会话状态变化通知
  createCommentCheckerHooks,             // 注释检查器：防止AI添加过多注释
  createToolOutputTruncatorHook,         // 工具输出截断：防止输出过长占用上下文
  createDirectoryAgentsInjectorHook,     // 目录AGENTS.md注入：自动注入项目知识库
  createDirectoryReadmeInjectorHook,     // 目录README注入：自动注入项目说明文档
  createEmptyTaskResponseDetectorHook,   // 空任务响应检测：检测代理是否返回空响应
  createThinkModeHook,                   // 思考模式：启用深度思考模式
  createClaudeCodeHooksHook,             // Claude Code兼容层：支持Claude Code的钩子系统
  createAnthropicContextWindowLimitRecoveryHook, // Anthropic上下文窗口限制恢复

  createCompactionContextInjector,       // 压缩上下文注入：优化上下文使用
  createRulesInjectorHook,               // 规则注入：注入项目特定规则
  createBackgroundNotificationHook,      // 后台通知：显示后台任务状态
  createAutoUpdateCheckerHook,           // 自动更新检查：检查插件更新
  createKeywordDetectorHook,             // 关键词检测：检测特殊关键词（如ultrawork）
  createAgentUsageReminderHook,          // 代理使用提醒：提醒使用合适的代理
  createNonInteractiveEnvHook,           // 非交互环境：处理非交互式环境
  createInteractiveBashSessionHook,      // 交互式Bash会话：支持tmux交互

  createThinkingBlockValidatorHook,      // 思考块验证：验证思考块格式
  createCategorySkillReminderHook,       // 分类技能提醒：提醒使用分类相关技能
  createRalphLoopHook,                   // Ralph循环：自引用开发循环直到完成
  createAutoSlashCommandHook,            // 自动斜杠命令：自动触发斜杠命令
  createEditErrorRecoveryHook,           // 编辑错误恢复：从编辑错误中恢复
  createDelegateTaskRetryHook,           // 委托任务重试：重试失败的委托任务
  createTaskResumeInfoHook,              // 任务恢复信息：提供任务恢复信息
  createStartWorkHook,                   // 开始工作：启动Sisyphus工作会话
  createAtlasHook,                       // Atlas编排器：主编排器钩子
  createPrometheusMdOnlyHook,            // Prometheus仅Markdown：限制Prometheus只输出Markdown
  createSisyphusJuniorNotepadHook,       // Sisyphus Junior记事本：记录学习和问题
  createQuestionLabelTruncatorHook,      // 问题标签截断：截断过长的问题标签
  createSubagentQuestionBlockerHook,     // 子代理问题阻止：阻止子代理提问
} from "./hooks";

// ============================================================================
// 功能模块导入
// ============================================================================
import {
  contextCollector,                      // 上下文收集器：收集需要注入的上下文信息
  createContextInjectorMessagesTransformHook, // 上下文注入消息转换钩子
} from "./features/context-injector";
import { applyAgentVariant, resolveAgentVariant, resolveVariantForModel } from "./shared/agent-variant"; // 代理变体解析：处理不同模型的变体配置
import { createFirstMessageVariantGate } from "./shared/first-message-variant"; // 首消息变体门控：控制首次消息的变体应用
import {
  discoverUserClaudeSkills,             // 发现用户Claude技能
  discoverProjectClaudeSkills,           // 发现项目Claude技能
  discoverOpencodeGlobalSkills,          // 发现OpenCode全局技能
  discoverOpencodeProjectSkills,         // 发现OpenCode项目技能
  mergeSkills,                           // 合并技能：按优先级合并不同来源的技能
} from "./features/opencode-skill-loader";
import { createBuiltinSkills } from "./features/builtin-skills"; // 创建内置技能：playwright、git-master等
import { getSystemMcpServerNames } from "./features/claude-code-mcp-loader"; // 获取系统MCP服务器名称
import {
  setMainSession,                        // 设置主会话ID
  getMainSessionID,                      // 获取主会话ID
  setSessionAgent,                       // 设置会话代理
  updateSessionAgent,                    // 更新会话代理
  clearSessionAgent,                     // 清除会话代理
} from "./features/claude-code-session-state";

// ============================================================================
// 工具集导入
// ============================================================================
import {
  builtinTools,                          // 内置工具集：session_list、session_read等
  createCallOmoAgent,                    // 创建调用OMO代理工具：spawn explore/librarian
  createBackgroundTools,                 // 创建后台工具：background_output、background_cancel
  createLookAt,                          // 创建look_at工具：多模态内容分析
  createSkillTool,                       // 创建skill工具：加载和使用技能
  createSkillMcpTool,                    // 创建skill_mcp工具：调用技能嵌入的MCP
  createSlashcommandTool,                // 创建slashcommand工具：执行斜杠命令
  discoverCommandsSync,                  // 同步发现命令
  sessionExists,                         // 检查会话是否存在
  createDelegateTask,                    // 创建delegate_task工具：任务委托
  interactive_bash,                      // 交互式bash工具：tmux集成
  startTmuxCheck,                        // 启动tmux检查
  lspManager,                            // LSP管理器：管理LSP客户端
} from "./tools";

// ============================================================================
// 管理器和状态导入
// ============================================================================
import { BackgroundManager } from "./features/background-agent"; // 后台代理管理器：管理并行代理执行
import { SkillMcpManager } from "./features/skill-mcp-manager"; // 技能MCP管理器：管理技能嵌入的MCP服务器
import { initTaskToastManager } from "./features/task-toast-manager"; // 初始化任务Toast管理器
import { TmuxSessionManager } from "./features/tmux-subagent"; // Tmux会话管理器：管理tmux窗格
import { type HookName } from "./config"; // 钩子名称类型定义
import { log, detectExternalNotificationPlugin, getNotificationConflictWarning, resetMessageCursor, includesCaseInsensitive, hasConnectedProvidersCache, getOpenCodeVersion, isOpenCodeVersionAtLeast, OPENCODE_NATIVE_AGENTS_INJECTION_VERSION } from "./shared"; // 共享工具函数
import { loadPluginConfig } from "./plugin-config"; // 加载插件配置：支持JSONC格式
import { createModelCacheState, getModelLimit } from "./plugin-state"; // 模型缓存状态管理
import { createConfigHandler } from "./plugin-handlers"; // 配置处理器：处理config钩子

/**
 * Oh My OpenCode 插件主入口函数
 * 
 * @description
 * 这是插件的核心初始化函数，负责完整的插件生命周期管理：
 * 
 * **初始化流程：**
 * 1. 加载配置文件（支持JSONC格式，多层级配置合并）
 * 2. 初始化所有生命周期钩子（32个可配置钩子）
 * 3. 创建后台任务管理器（支持并行代理执行）
 * 4. 注册工具集（LSP、AST-Grep、代理委托等20+工具）
 * 5. 加载技能系统（内置技能 + Claude Code技能 + 用户自定义技能）
 * 6. 配置MCP服务器（websearch、context7、grep_app）
 * 7. 设置Tmux集成（可选的交互式终端支持）
 * 
 * **生命周期钩子触发顺序：**
 * - `chat.message`: 用户发送消息时触发
 * - `tool.execute.before`: 工具执行前触发（可修改参数）
 * - `tool.execute.after`: 工具执行后触发（可修改输出）
 * - `event`: 系统事件触发（session.created、session.deleted等）
 * - `experimental.chat.messages.transform`: 消息转换（上下文注入）
 * - `config`: 配置查询和更新
 * 
 * **配置系统：**
 * - 项目配置：`.opencode/oh-my-opencode.json`
 * - 用户配置：`~/.config/opencode/oh-my-opencode.json`
 * - 配置优先级：项目 > 用户 > 默认
 * - 支持JSONC格式（注释和尾随逗号）
 * 
 * **代理系统：**
 * - Sisyphus (Opus 4.5): 主编排器
 * - Atlas: 高级编排器（可选）
 * - Prometheus: 战略规划器
 * - Oracle (GPT 5.2): 架构咨询和调试
 * - Librarian (Sonnet 4.5): 文档搜索和代码探索
 * - Explore (Grok Code): 快速代码库grep
 * - Multimodal Looker (Gemini 3 Flash): PDF/图像分析
 * 
 * @param ctx - OpenCode插件上下文对象
 * @param ctx.directory - 当前工作目录路径
 * @param ctx.client - OpenCode客户端API（用于调用TUI、会话等）
 * 
 * @returns 返回插件对象，包含：
 * - `tool`: 工具集对象（所有可用工具）
 * - `chat.message`: 消息钩子处理器
 * - `tool.execute.before`: 工具执行前钩子
 * - `tool.execute.after`: 工具执行后钩子
 * - `event`: 事件钩子处理器
 * - `experimental.chat.messages.transform`: 消息转换钩子
 * - `config`: 配置处理器
 * 
 * @example
 * ```typescript
 * // 在 opencode.json 中配置插件
 * {
 *   "plugin": ["oh-my-opencode"]
 * }
 * ```
 * 
 * @see {@link https://github.com/code-yeongyu/oh-my-opencode} 项目主页
 * @see {@link ./config/schema.ts} 完整配置架构定义
 */
const OhMyOpenCodePlugin: Plugin = async (ctx) => {
  log("[OhMyOpenCodePlugin] ENTRY - plugin loading", { directory: ctx.directory })
  
  // 立即启动后台tmux检查（用于交互式终端支持）
  startTmuxCheck();

  // ============================================================================
  // 第一步：加载配置文件
  // ============================================================================
  // 从项目目录和用户目录加载配置，支持JSONC格式
  // 配置优先级：项目配置 > 用户配置 > 默认配置
  const pluginConfig = loadPluginConfig(ctx.directory, ctx);
  const disabledHooks = new Set(pluginConfig.disabled_hooks ?? []);
  const firstMessageVariantGate = createFirstMessageVariantGate();

  // Tmux配置：用于交互式终端集成
  const tmuxConfig = {
    enabled: pluginConfig.tmux?.enabled ?? false,
    layout: pluginConfig.tmux?.layout ?? 'main-vertical',
    main_pane_size: pluginConfig.tmux?.main_pane_size ?? 60,
    main_pane_min_width: pluginConfig.tmux?.main_pane_min_width ?? 120,
    agent_pane_min_width: pluginConfig.tmux?.agent_pane_min_width ?? 40,
  } as const;
  
  // 钩子启用检查函数：通过配置控制钩子的启用/禁用
  const isHookEnabled = (hookName: HookName) => !disabledHooks.has(hookName);

  // ============================================================================
  // 第二步：初始化核心状态管理
  // ============================================================================
  const modelCacheState = createModelCacheState();

  // ============================================================================
  // 第三步：初始化生命周期钩子（32个可配置钩子）
  // ============================================================================
  // 每个钩子都可以通过 disabled_hooks 配置禁用
  const contextWindowMonitor = isHookEnabled("context-window-monitor")
    ? createContextWindowMonitorHook(ctx)
    : null;
  const sessionRecovery = isHookEnabled("session-recovery")
    ? createSessionRecoveryHook(ctx, { experimental: pluginConfig.experimental })
    : null;
  
  // Check for conflicting notification plugins before creating session-notification
  let sessionNotification = null;
  if (isHookEnabled("session-notification")) {
    const forceEnable = pluginConfig.notification?.force_enable ?? false;
    const externalNotifier = detectExternalNotificationPlugin(ctx.directory);
    
    if (externalNotifier.detected && !forceEnable) {
      // External notification plugin detected - skip our notification to avoid conflicts
      console.warn(getNotificationConflictWarning(externalNotifier.pluginName!));
      log("session-notification disabled due to external notifier conflict", {
        detected: externalNotifier.pluginName,
        allPlugins: externalNotifier.allPlugins,
      });
    } else {
      sessionNotification = createSessionNotification(ctx);
    }
  }

  const commentChecker = isHookEnabled("comment-checker")
    ? createCommentCheckerHooks(pluginConfig.comment_checker)
    : null;
  const toolOutputTruncator = isHookEnabled("tool-output-truncator")
    ? createToolOutputTruncatorHook(ctx, {
        experimental: pluginConfig.experimental,
      })
    : null;
  // Check for native OpenCode AGENTS.md injection support before creating hook
  let directoryAgentsInjector = null;
  if (isHookEnabled("directory-agents-injector")) {
    const currentVersion = getOpenCodeVersion();
    const hasNativeSupport = currentVersion !== null &&
      isOpenCodeVersionAtLeast(OPENCODE_NATIVE_AGENTS_INJECTION_VERSION);

    if (hasNativeSupport) {
      log("directory-agents-injector auto-disabled due to native OpenCode support", {
        currentVersion,
        nativeVersion: OPENCODE_NATIVE_AGENTS_INJECTION_VERSION,
      });
    } else {
      directoryAgentsInjector = createDirectoryAgentsInjectorHook(ctx);
    }
  }
  const directoryReadmeInjector = isHookEnabled("directory-readme-injector")
    ? createDirectoryReadmeInjectorHook(ctx)
    : null;
  const emptyTaskResponseDetector = isHookEnabled("empty-task-response-detector")
    ? createEmptyTaskResponseDetectorHook(ctx)
    : null;
  const thinkMode = isHookEnabled("think-mode") ? createThinkModeHook() : null;
  const claudeCodeHooks = createClaudeCodeHooksHook(
    ctx,
    {
      disabledHooks: (pluginConfig.claude_code?.hooks ?? true) ? undefined : true,
      keywordDetectorDisabled: !isHookEnabled("keyword-detector"),
    },
    contextCollector
  );
  const anthropicContextWindowLimitRecovery = isHookEnabled(
    "anthropic-context-window-limit-recovery"
  )
    ? createAnthropicContextWindowLimitRecoveryHook(ctx, {
        experimental: pluginConfig.experimental,
      })
    : null;
  const compactionContextInjector = isHookEnabled("compaction-context-injector")
    ? createCompactionContextInjector()
    : undefined;
  const rulesInjector = isHookEnabled("rules-injector")
    ? createRulesInjectorHook(ctx)
    : null;
  const autoUpdateChecker = isHookEnabled("auto-update-checker")
    ? createAutoUpdateCheckerHook(ctx, {
        showStartupToast: isHookEnabled("startup-toast"),
        isSisyphusEnabled: pluginConfig.sisyphus_agent?.disabled !== true,
        autoUpdate: pluginConfig.auto_update ?? true,
      })
    : null;
  const keywordDetector = isHookEnabled("keyword-detector")
    ? createKeywordDetectorHook(ctx, contextCollector)
    : null;
  const contextInjectorMessagesTransform =
    createContextInjectorMessagesTransformHook(contextCollector);
  const agentUsageReminder = isHookEnabled("agent-usage-reminder")
    ? createAgentUsageReminderHook(ctx)
    : null;
  const nonInteractiveEnv = isHookEnabled("non-interactive-env")
    ? createNonInteractiveEnvHook(ctx)
    : null;
  const interactiveBashSession = isHookEnabled("interactive-bash-session")
    ? createInteractiveBashSessionHook(ctx)
    : null;

  const thinkingBlockValidator = isHookEnabled("thinking-block-validator")
    ? createThinkingBlockValidatorHook()
    : null;

  const categorySkillReminder = isHookEnabled("category-skill-reminder")
    ? createCategorySkillReminderHook(ctx)
    : null;

  const ralphLoop = isHookEnabled("ralph-loop")
    ? createRalphLoopHook(ctx, {
        config: pluginConfig.ralph_loop,
        checkSessionExists: async (sessionId) => sessionExists(sessionId),
      })
    : null;

  const editErrorRecovery = isHookEnabled("edit-error-recovery")
    ? createEditErrorRecoveryHook(ctx)
    : null;

  const delegateTaskRetry = isHookEnabled("delegate-task-retry")
    ? createDelegateTaskRetryHook(ctx)
    : null;

  const startWork = isHookEnabled("start-work")
    ? createStartWorkHook(ctx)
    : null;

  const prometheusMdOnly = isHookEnabled("prometheus-md-only")
    ? createPrometheusMdOnlyHook(ctx)
    : null;

  const sisyphusJuniorNotepad = isHookEnabled("sisyphus-junior-notepad")
    ? createSisyphusJuniorNotepadHook(ctx)
    : null;

  const questionLabelTruncator = createQuestionLabelTruncatorHook();
  const subagentQuestionBlocker = createSubagentQuestionBlockerHook();

  const taskResumeInfo = createTaskResumeInfoHook();

  const tmuxSessionManager = new TmuxSessionManager(ctx, tmuxConfig);

  const backgroundManager = new BackgroundManager(ctx, pluginConfig.background_task, {
    tmuxConfig,
    onSubagentSessionCreated: async (event) => {
      log("[index] onSubagentSessionCreated callback received", {
        sessionID: event.sessionID,
        parentID: event.parentID,
        title: event.title,
      });
      await tmuxSessionManager.onSessionCreated({
        type: "session.created",
        properties: {
          info: {
            id: event.sessionID,
            parentID: event.parentID,
            title: event.title,
          },
        },
      });
      log("[index] onSubagentSessionCreated callback completed");
    },
    onShutdown: () => {
      tmuxSessionManager.cleanup().catch((error) => {
        log("[index] tmux cleanup error during shutdown:", error)
      })
    },
  });

  const atlasHook = isHookEnabled("atlas")
    ? createAtlasHook(ctx, { directory: ctx.directory, backgroundManager })
    : null;

  initTaskToastManager(ctx.client);

  const todoContinuationEnforcer = isHookEnabled("todo-continuation-enforcer")
    ? createTodoContinuationEnforcer(ctx, { backgroundManager })
    : null;

  if (sessionRecovery && todoContinuationEnforcer) {
    sessionRecovery.setOnAbortCallback(todoContinuationEnforcer.markRecovering);
    sessionRecovery.setOnRecoveryCompleteCallback(
      todoContinuationEnforcer.markRecoveryComplete
    );
  }

  const backgroundNotificationHook = isHookEnabled("background-notification")
    ? createBackgroundNotificationHook(backgroundManager)
    : null;
  const backgroundTools = createBackgroundTools(backgroundManager, ctx.client);

  const callOmoAgent = createCallOmoAgent(ctx, backgroundManager);
  const isMultimodalLookerEnabled = !includesCaseInsensitive(
    pluginConfig.disabled_agents ?? [],
    "multimodal-looker"
  );
  const lookAt = isMultimodalLookerEnabled ? createLookAt(ctx) : null;
  const browserProvider = pluginConfig.browser_automation_engine?.provider ?? "playwright";
  const delegateTask = createDelegateTask({
    manager: backgroundManager,
    client: ctx.client,
    directory: ctx.directory,
    userCategories: pluginConfig.categories,
    gitMasterConfig: pluginConfig.git_master,
    sisyphusJuniorModel: pluginConfig.agents?.["sisyphus-junior"]?.model,
    browserProvider,
    onSyncSessionCreated: async (event) => {
      log("[index] onSyncSessionCreated callback", {
        sessionID: event.sessionID,
        parentID: event.parentID,
        title: event.title,
      });
      await tmuxSessionManager.onSessionCreated({
        type: "session.created",
        properties: {
          info: {
            id: event.sessionID,
            parentID: event.parentID,
            title: event.title,
          },
        },
      });
    },
  });
  const disabledSkills = new Set(pluginConfig.disabled_skills ?? []);
  const systemMcpNames = getSystemMcpServerNames();
  const builtinSkills = createBuiltinSkills({ browserProvider }).filter((skill) => {
    if (disabledSkills.has(skill.name as never)) return false;
    if (skill.mcpConfig) {
      for (const mcpName of Object.keys(skill.mcpConfig)) {
        if (systemMcpNames.has(mcpName)) return false;
      }
    }
    return true;
  });
  const includeClaudeSkills = pluginConfig.claude_code?.skills !== false;
  const [userSkills, globalSkills, projectSkills, opencodeProjectSkills] = await Promise.all([
    includeClaudeSkills ? discoverUserClaudeSkills() : Promise.resolve([]),
    discoverOpencodeGlobalSkills(),
    includeClaudeSkills ? discoverProjectClaudeSkills() : Promise.resolve([]),
    discoverOpencodeProjectSkills(),
  ]);
  const mergedSkills = mergeSkills(
    builtinSkills,
    pluginConfig.skills,
    userSkills,
    globalSkills,
    projectSkills,
    opencodeProjectSkills
  );
  const skillMcpManager = new SkillMcpManager();
  const getSessionIDForMcp = () => getMainSessionID() || "";
  const skillTool = createSkillTool({
    skills: mergedSkills,
    mcpManager: skillMcpManager,
    getSessionID: getSessionIDForMcp,
    gitMasterConfig: pluginConfig.git_master,
  });
  const skillMcpTool = createSkillMcpTool({
    manager: skillMcpManager,
    getLoadedSkills: () => mergedSkills,
    getSessionID: getSessionIDForMcp,
  });

  const commands = discoverCommandsSync();
  const slashcommandTool = createSlashcommandTool({
    commands,
    skills: mergedSkills,
  });

  const autoSlashCommand = isHookEnabled("auto-slash-command")
    ? createAutoSlashCommandHook({ skills: mergedSkills })
    : null;

  const configHandler = createConfigHandler({
    ctx: { directory: ctx.directory, client: ctx.client },
    pluginConfig,
    modelCacheState,
  });

  return {
    // ============================================================================
    // 工具集注册
    // ============================================================================
    // 将所有工具暴露给OpenCode，使代理可以调用这些工具
    // 工具分类：
    // - builtinTools: 会话管理工具（session_list, session_read, session_search等）
    // - backgroundTools: 后台任务工具（background_output, background_cancel）
    // - call_omo_agent: 调用专业代理（explore, librarian）
    // - look_at: 多模态内容分析（PDF/图像）
    // - delegate_task: 任务委托（核心工具，支持category和agent两种模式）
    // - skill: 技能加载和使用
    // - skill_mcp: 技能嵌入的MCP调用
    // - slashcommand: 斜杠命令执行
    // - interactive_bash: 交互式bash（tmux集成）
    tool: {
      ...builtinTools,
      ...backgroundTools,
      call_omo_agent: callOmoAgent,
      ...(lookAt ? { look_at: lookAt } : {}),
      delegate_task: delegateTask,
      skill: skillTool,
      skill_mcp: skillMcpTool,
      slashcommand: slashcommandTool,
      interactive_bash,
    },

    // ============================================================================
    // chat.message 钩子：用户发送消息时触发
    // ============================================================================
    // 职责：
    // 1. 记录会话使用的代理（用于会话状态管理）
    // 2. 应用代理变体配置（控制代理行为的细微差异）
    // 3. 触发关键词检测（如ultrawork）
    // 4. 处理Claude Code钩子
    // 5. 处理自动斜杠命令
    // 6. 处理Ralph Loop启动/取消
    // 7. 检查provider连接状态
    "chat.message": async (input, output) => {
      // 记录当前会话使用的代理名称
      if (input.agent) {
        setSessionAgent(input.sessionID, input.agent);
      }

      // 代理变体系统：根据配置为不同代理应用不同的行为变体
      // 变体可以控制代理的温度、思考模式、工具权限等
      // firstMessageVariantGate确保首次消息的变体应用逻辑正确
      const message = (output as { message: { variant?: string } }).message
      if (firstMessageVariantGate.shouldOverride(input.sessionID)) {
        const variant = input.model && input.agent
          ? resolveVariantForModel(pluginConfig, input.agent, input.model)
          : resolveAgentVariant(pluginConfig, input.agent)
        if (variant !== undefined) {
          message.variant = variant
        }
        firstMessageVariantGate.markApplied(input.sessionID)
      } else {
        if (input.model && input.agent && message.variant === undefined) {
          const variant = resolveVariantForModel(pluginConfig, input.agent, input.model)
          if (variant !== undefined) {
            message.variant = variant
          }
        } else {
          applyAgentVariant(pluginConfig, input.agent, message)
        }
      }

      // 触发各个子钩子处理消息
      // keywordDetector: 检测ultrawork等关键词，自动启用高级功能
      // claudeCodeHooks: Claude Code兼容层，处理PreToolUse/PostToolUse等钩子
      // autoSlashCommand: 自动触发斜杠命令（如/init-deep）
      // startWork: 处理/start-work命令，启动Sisyphus工作会话
      await keywordDetector?.["chat.message"]?.(input, output);
      await claudeCodeHooks["chat.message"]?.(input, output);
      await autoSlashCommand?.["chat.message"]?.(input, output);
      await startWork?.["chat.message"]?.(input, output);

      // Provider连接状态检查：确保模型过滤功能正常工作
      // 如果缓存缺失，模型过滤将被禁用，需要重启OpenCode
      if (!hasConnectedProvidersCache()) {
        ctx.client.tui.showToast({
          body: {
            title: "⚠️ Provider Cache Missing",
            message: "Model filtering disabled. RESTART OpenCode to enable full functionality.",
            variant: "warning" as const,
            duration: 6000,
          },
        }).catch(() => {});
      }

      // Ralph Loop处理：自引用开发循环，持续执行直到任务完成
      // Ralph Loop是一个强大的功能，允许代理自我迭代改进代码
      // 它会持续运行直到满足完成条件（completion-promise）或达到最大迭代次数
      if (ralphLoop) {
        const parts = (
          output as { parts?: Array<{ type: string; text?: string }> }
        ).parts;
        const promptText =
          parts
            ?.filter((p) => p.type === "text" && p.text)
            .map((p) => p.text)
            .join("\n")
            .trim() || "";

        // 检测Ralph Loop启动模板
        const isRalphLoopTemplate =
          promptText.includes("You are starting a Ralph Loop") &&
          promptText.includes("<user-task>");
        const isCancelRalphTemplate = promptText.includes(
          "Cancel the currently active Ralph Loop"
        );

        if (isRalphLoopTemplate) {
          // 从模板中提取任务描述和配置参数
          const taskMatch = promptText.match(
            /<user-task>\s*([\s\S]*?)\s*<\/user-task>/i
          );
          const rawTask = taskMatch?.[1]?.trim() || "";

          const quotedMatch = rawTask.match(/^["'](.+?)["']/);
          const prompt =
            quotedMatch?.[1] ||
            rawTask.split(/\s+--/)[0]?.trim() ||
            "Complete the task as instructed";

          // 解析可选参数：最大迭代次数和完成条件
          const maxIterMatch = rawTask.match(/--max-iterations=(\d+)/i);
          const promiseMatch = rawTask.match(
            /--completion-promise=["']?([^"'\s]+)["']?/i
          );

          log("[ralph-loop] Starting loop from chat.message", {
            sessionID: input.sessionID,
            prompt,
          });
          ralphLoop.startLoop(input.sessionID, prompt, {
            maxIterations: maxIterMatch
              ? parseInt(maxIterMatch[1], 10)
              : undefined,
            completionPromise: promiseMatch?.[1],
          });
        } else if (isCancelRalphTemplate) {
          log("[ralph-loop] Cancelling loop from chat.message", {
            sessionID: input.sessionID,
          });
          ralphLoop.cancelLoop(input.sessionID);
        }
      }
    },

    // ============================================================================
    // experimental.chat.messages.transform 钩子：消息转换
    // ============================================================================
    // 职责：在消息发送给模型前进行转换和注入
    // 1. contextInjectorMessagesTransform: 注入上下文信息（AGENTS.md、README.md等）
    // 2. thinkingBlockValidator: 验证思考块格式是否正确
    // 
    // 这是一个实验性钩子，用于在消息流中注入额外的上下文信息
    // 例如：自动注入项目知识库、规则文件、目录说明等
    "experimental.chat.messages.transform": async (
      input: Record<string, never>,
      output: { messages: Array<{ info: unknown; parts: unknown[] }> }
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await contextInjectorMessagesTransform?.["experimental.chat.messages.transform"]?.(input, output as any);
      await thinkingBlockValidator?.[
        "experimental.chat.messages.transform"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]?.(input, output as any);

    },

    config: configHandler,

    // ============================================================================
    // event 钩子：系统事件处理
    // ============================================================================
    // 职责：处理OpenCode系统事件（session.created、session.deleted、message.updated等）
    // 这是插件响应系统状态变化的核心机制
    // 
    // 事件类型：
    // - session.created: 新会话创建时触发
    // - session.deleted: 会话删除时触发
    // - message.updated: 消息更新时触发
    // - session.error: 会话错误时触发（用于错误恢复）
    event: async (input) => {
      // 触发所有事件钩子处理器
      // 每个钩子负责处理特定的系统事件
      await autoUpdateChecker?.event(input);
      await claudeCodeHooks.event(input);
      await backgroundNotificationHook?.event(input);
      await sessionNotification?.(input);
      await todoContinuationEnforcer?.handler(input);
      await contextWindowMonitor?.event(input);
      await directoryAgentsInjector?.event(input);
      await directoryReadmeInjector?.event(input);
      await rulesInjector?.event(input);
      await thinkMode?.event(input);
      await anthropicContextWindowLimitRecovery?.event(input);
      await agentUsageReminder?.event(input);
      await categorySkillReminder?.event(input);
      await interactiveBashSession?.event(input);
      await ralphLoop?.event(input);
      await atlasHook?.handler(input);

      const { event } = input;
      const props = event.properties as Record<string, unknown> | undefined;

       // session.created事件：新会话创建时的初始化
       // 职责：
       // 1. 识别主会话（没有parentID的会话）
       // 2. 初始化首消息变体门控
       // 3. 通知tmux会话管理器创建对应的窗格
       if (event.type === "session.created") {
         const sessionInfo = props?.info as
           | { id?: string; title?: string; parentID?: string }
           | undefined;
         log("[event] session.created", { sessionInfo, props });
         // 主会话：用户直接创建的会话（没有父会话）
         // 子会话：通过delegate_task或call_omo_agent创建的会话（有parentID）
         if (!sessionInfo?.parentID) {
           setMainSession(sessionInfo?.id);
         }
         firstMessageVariantGate.markSessionCreated(sessionInfo);
         await tmuxSessionManager.onSessionCreated(
           event as { type: string; properties?: { info?: { id?: string; parentID?: string; title?: string } } }
         );
       }

       // session.deleted事件：会话删除时的清理
       // 职责：
       // 1. 清理主会话标记
       // 2. 清理会话代理记录
       // 3. 重置消息游标
       // 4. 断开技能MCP连接
       // 5. 清理LSP临时目录客户端
       // 6. 通知tmux会话管理器删除对应的窗格
       if (event.type === "session.deleted") {
         const sessionInfo = props?.info as { id?: string } | undefined;
         if (sessionInfo?.id === getMainSessionID()) {
           setMainSession(undefined);
         }
         if (sessionInfo?.id) {
           clearSessionAgent(sessionInfo.id);
           resetMessageCursor(sessionInfo.id);
           firstMessageVariantGate.clear(sessionInfo.id);
           await skillMcpManager.disconnectSession(sessionInfo.id);
           await lspManager.cleanupTempDirectoryClients();
           await tmuxSessionManager.onSessionDeleted({
             sessionID: sessionInfo.id,
           });
         }
       }

      // message.updated事件：消息更新时的代理记录更新
      // 当用户消息的代理信息更新时，同步更新会话代理记录
      // 这确保我们始终知道每个会话当前使用的是哪个代理
      if (event.type === "message.updated") {
        const info = props?.info as Record<string, unknown> | undefined;
        const sessionID = info?.sessionID as string | undefined;
        const agent = info?.agent as string | undefined;
        const role = info?.role as string | undefined;
        if (sessionID && agent && role === "user") {
          updateSessionAgent(sessionID, agent);
        }
      }

      // session.error事件：会话错误时的自动恢复
      // 职责：
      // 1. 检测是否为可恢复的错误（如上下文窗口限制）
      // 2. 尝试自动恢复会话（压缩上下文、重试等）
      // 3. 恢复成功后自动继续执行
      // 
      // 这是一个强大的容错机制，可以从临时错误中自动恢复
      // 避免用户手动重试，提升用户体验
      if (event.type === "session.error") {
        const sessionID = props?.sessionID as string | undefined;
        const error = props?.error;

        if (sessionRecovery?.isRecoverableError(error)) {
          const messageInfo = {
            id: props?.messageID as string | undefined,
            role: "assistant" as const,
            sessionID,
            error,
          };
          const recovered =
            await sessionRecovery.handleSessionRecovery(messageInfo);

          // 恢复成功后，自动发送"continue"继续执行
          if (recovered && sessionID && sessionID === getMainSessionID()) {
            await ctx.client.session
              .prompt({
                path: { id: sessionID },
                body: { parts: [{ type: "text", text: "continue" }] },
                query: { directory: ctx.directory },
              })
              .catch(() => {});
          }
        }
      }
    },

    // ============================================================================
    // tool.execute.before 钩子：工具执行前的拦截和修改
    // ============================================================================
    // 职责：在工具执行前拦截并修改工具参数
    // 这是一个强大的钩子，可以：
    // 1. 修改工具参数（如禁用某些工具、注入额外参数）
    // 2. 阻止工具执行（如阻止子代理提问）
    // 3. 注入上下文信息（如AGENTS.md、README.md）
    // 4. 应用特殊规则（如Prometheus只输出Markdown）
    "tool.execute.before": async (input, output) => {
      // 触发所有工具执行前钩子
      await subagentQuestionBlocker["tool.execute.before"]?.(input, output);
      await questionLabelTruncator["tool.execute.before"]?.(input, output);
      await claudeCodeHooks["tool.execute.before"](input, output);
      await nonInteractiveEnv?.["tool.execute.before"](input, output);
      await commentChecker?.["tool.execute.before"](input, output);
      await directoryAgentsInjector?.["tool.execute.before"]?.(input, output);
      await directoryReadmeInjector?.["tool.execute.before"]?.(input, output);
      await rulesInjector?.["tool.execute.before"]?.(input, output);
      await prometheusMdOnly?.["tool.execute.before"]?.(input, output);
      await sisyphusJuniorNotepad?.["tool.execute.before"]?.(input, output);
      await atlasHook?.["tool.execute.before"]?.(input, output);

      // task工具特殊处理：禁用某些工具以防止递归调用
      // 职责：
      // 1. 禁用delegate_task：防止子代理再次委托任务（避免无限递归）
      // 2. 对explore/librarian禁用call_omo_agent：这些是探索型代理，不应再调用其他代理
      // 
      // 这是一个安全机制，确保代理调用层级不会失控
      if (input.tool === "task") {
        const args = output.args as Record<string, unknown>;
        const subagentType = args.subagent_type as string;
        const isExploreOrLibrarian = includesCaseInsensitive(
          ["explore", "librarian"],
          subagentType ?? ""
        );

        args.tools = {
          ...(args.tools as Record<string, boolean> | undefined),
          delegate_task: false,
          ...(isExploreOrLibrarian ? { call_omo_agent: false } : {}),
        };
      }

      // slashcommand工具特殊处理：处理Ralph Loop相关命令
      // 支持的命令：
      // - /ralph-loop "task" [--max-iterations=N] [--completion-promise="condition"]
      // - /cancel-ralph
      // - /ulw-loop "task" [--max-iterations=N] [--completion-promise="condition"]
      // 
      // ulw-loop是ultrawork模式的Ralph Loop，会启用更激进的优化和并行执行
      if (ralphLoop && input.tool === "slashcommand") {
        const args = output.args as { command?: string } | undefined;
        const command = args?.command?.replace(/^\//, "").toLowerCase();
        const sessionID = input.sessionID || getMainSessionID();

        if (command === "ralph-loop" && sessionID) {
          // 解析/ralph-loop命令参数
          const rawArgs =
            args?.command?.replace(/^\/?(ralph-loop)\s*/i, "") || "";
          const taskMatch = rawArgs.match(/^["'](.+?)["']/);
          const prompt =
            taskMatch?.[1] ||
            rawArgs.split(/\s+--/)[0]?.trim() ||
            "Complete the task as instructed";

          const maxIterMatch = rawArgs.match(/--max-iterations=(\d+)/i);
          const promiseMatch = rawArgs.match(
            /--completion-promise=["']?([^"'\s]+)["']?/i
          );

          ralphLoop.startLoop(sessionID, prompt, {
            maxIterations: maxIterMatch
              ? parseInt(maxIterMatch[1], 10)
              : undefined,
            completionPromise: promiseMatch?.[1],
          });
         } else if (command === "cancel-ralph" && sessionID) {
           // 取消当前活动的Ralph Loop
           ralphLoop.cancelLoop(sessionID);
         } else if (command === "ulw-loop" && sessionID) {
           // 解析/ulw-loop命令参数（ultrawork模式）
           const rawArgs =
             args?.command?.replace(/^\/?(ulw-loop)\s*/i, "") || "";
           const taskMatch = rawArgs.match(/^["'](.+?)["']/);
           const prompt =
             taskMatch?.[1] ||
             rawArgs.split(/\s+--/)[0]?.trim() ||
             "Complete the task as instructed";

           const maxIterMatch = rawArgs.match(/--max-iterations=(\d+)/i);
           const promiseMatch = rawArgs.match(
             /--completion-promise=["']?([^"'\s]+)["']?/i
           );

           ralphLoop.startLoop(sessionID, prompt, {
             ultrawork: true,
             maxIterations: maxIterMatch
               ? parseInt(maxIterMatch[1], 10)
               : undefined,
             completionPromise: promiseMatch?.[1],
           });
         }
      }
    },

    // ============================================================================
    // tool.execute.after 钩子：工具执行后的处理和验证
    // ============================================================================
    // 职责：在工具执行后处理输出、验证结果、触发后续动作
    // 这是一个关键的钩子，可以：
    // 1. 修改工具输出（如截断过长的输出）
    // 2. 验证工具执行结果（如检查注释、检测空响应）
    // 3. 触发错误恢复（如编辑错误恢复、委托任务重试）
    // 4. 记录统计信息（如上下文窗口使用情况）
    "tool.execute.after": async (input, output) => {
      // 防御性检查：某些命令（如/review）可能返回undefined输出
      // 参见issue #1035
      if (!output) {
        return;
      }
      // 触发所有工具执行后钩子
      await claudeCodeHooks["tool.execute.after"](input, output);
      await toolOutputTruncator?.["tool.execute.after"](input, output);
      await contextWindowMonitor?.["tool.execute.after"](input, output);
      await commentChecker?.["tool.execute.after"](input, output);
      await directoryAgentsInjector?.["tool.execute.after"](input, output);
      await directoryReadmeInjector?.["tool.execute.after"](input, output);
      await rulesInjector?.["tool.execute.after"](input, output);
      await emptyTaskResponseDetector?.["tool.execute.after"](input, output);
      await agentUsageReminder?.["tool.execute.after"](input, output);
      await categorySkillReminder?.["tool.execute.after"](input, output);
      await interactiveBashSession?.["tool.execute.after"](input, output);
      await editErrorRecovery?.["tool.execute.after"](input, output);
      await delegateTaskRetry?.["tool.execute.after"](input, output);
      await atlasHook?.["tool.execute.after"]?.(input, output);
      await taskResumeInfo["tool.execute.after"](input, output);
    },
  };
};

export default OhMyOpenCodePlugin;

export type {
  OhMyOpenCodeConfig,
  AgentName,
  AgentOverrideConfig,
  AgentOverrides,
  McpName,
  HookName,
  BuiltinCommandName,
} from "./config";

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Config error utilities are available via "./shared/config-errors" for internal use only.
export type { ConfigLoadError } from "./shared/config-errors";
