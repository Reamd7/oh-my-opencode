/**
 * 交互式Bash会话管理钩子
 * 
 * 功能：
 * - 跟踪和管理Tmux会话
 * - 自动清理会话（在OpenCode会话结束时）
 * - 提供会话状态提醒
 * - 支持交互式TUI应用（vim、htop等）
 * 
 * Tmux集成：
 * - 监听new-session、kill-session、kill-server命令
 * - 跟踪以"omo-"前缀开头的会话
 * - 会话状态持久化到磁盘
 * - 自动清理孤立会话
 */
import type { PluginInput } from "@opencode-ai/plugin";
import {
  loadInteractiveBashSessionState,
  saveInteractiveBashSessionState,
  clearInteractiveBashSessionState,
} from "./storage";
import { OMO_SESSION_PREFIX, buildSessionReminderMessage } from "./constants";
import type { InteractiveBashSessionState } from "./types";
import { subagentSessions } from "../../features/claude-code-session-state";

interface ToolExecuteInput {
  tool: string;
  sessionID: string;
  callID: string;
  args?: Record<string, unknown>;
}

interface ToolExecuteOutput {
  title: string;
  output: string;
  metadata: unknown;
}

interface EventInput {
  event: {
    type: string;
    properties?: unknown;
  };
}

/**
 * 引号感知的命令分词器，支持转义处理
 * 
 * 处理单引号、双引号和反斜杠转义
 * 
 * @example
 * tokenizeCommand('tmux new-session -s "my session"')
 * // ["tmux", "new-session", "-s", "my session"]
 */
function tokenizeCommand(cmd: string): string[] {
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
 * 规范化会话名称，移除:window和.pane后缀
 * 
 * @example
 * normalizeSessionName("omo-x:1") // "omo-x"
 * normalizeSessionName("omo-x:1.2") // "omo-x"
 */
function normalizeSessionName(name: string): string {
  return name.split(":")[0].split(".")[0]
}

function findFlagValue(tokens: string[], flag: string): string | null {
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === flag) return tokens[i + 1]
  }
  return null
}

/**
 * 从token中提取会话名称，考虑子命令类型
 * 
 * - new-session: 优先使用-s，其次-t
 * - 其他命令: 使用-t
 */
function extractSessionNameFromTokens(tokens: string[], subCommand: string): string | null {
  if (subCommand === "new-session") {
    const sFlag = findFlagValue(tokens, "-s")
    if (sFlag) return normalizeSessionName(sFlag)
    const tFlag = findFlagValue(tokens, "-t")
    if (tFlag) return normalizeSessionName(tFlag)
  } else {
    const tFlag = findFlagValue(tokens, "-t")
    if (tFlag) return normalizeSessionName(tFlag)
  }
  return null
}

/**
 * 从token中查找tmux子命令，跳过全局选项
 * 
 * tmux允许在子命令前使用全局选项：
 * 例如：`tmux -L socket-name new-session -s omo-x`
 * 
 * 全局选项：
 * - 带参数：-L, -S, -f, -c, -T
 * - 独立标志：-C, -v, -V等
 * - 特殊：--（选项结束标记）
 */
function findSubcommand(tokens: string[]): string {
  // 需要参数的选项：-L, -S, -f, -c, -T
  const globalOptionsWithArgs = new Set(["-L", "-S", "-f", "-c", "-T"])

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    // Handle end of options marker
    if (token === "--") {
      // Next token is the subcommand
      return tokens[i + 1] ?? ""
    }

    if (globalOptionsWithArgs.has(token)) {
      // Skip the option and its argument
      i += 2
      continue
    }

    if (token.startsWith("-")) {
      // Skip standalone flags like -C, -v, -V
      i++
      continue
    }

    // Found the subcommand
    return token
  }

  return ""
}

/**
 * 创建交互式Bash会话钩子
 * 
 * 生命周期：
 * 1. tool.execute.after: 跟踪tmux会话创建/销毁
 * 2. event (session.deleted): 清理所有跟踪的tmux会话
 */
export function createInteractiveBashSessionHook(ctx: PluginInput) {
  const sessionStates = new Map<string, InteractiveBashSessionState>();

  /**
   * 获取或创建会话状态，从磁盘加载持久化数据
   */
  function getOrCreateState(sessionID: string): InteractiveBashSessionState {
    if (!sessionStates.has(sessionID)) {
      const persisted = loadInteractiveBashSessionState(sessionID);
      const state: InteractiveBashSessionState = persisted ?? {
        sessionID,
        tmuxSessions: new Set<string>(),
        updatedAt: Date.now(),
      };
      sessionStates.set(sessionID, state);
    }
    return sessionStates.get(sessionID)!;
  }

  /**
   * 判断是否为OhMyOpenCode管理的会话（以"omo-"开头）
   */
  function isOmoSession(sessionName: string | null): boolean {
    return sessionName !== null && sessionName.startsWith(OMO_SESSION_PREFIX);
  }

  /**
   * 清理所有跟踪的tmux会话
   */
  async function killAllTrackedSessions(
    state: InteractiveBashSessionState,
  ): Promise<void> {
    for (const sessionName of state.tmuxSessions) {
      try {
        const proc = Bun.spawn(["tmux", "kill-session", "-t", sessionName], {
          stdout: "ignore",
          stderr: "ignore",
        });
        await proc.exited;
      } catch {}
    }

    for (const sessionId of subagentSessions) {
      ctx.client.session.abort({ path: { id: sessionId } }).catch(() => {})
    }
  }

  /**
   * 工具执行后钩子：跟踪tmux会话操作
   * 
   * 处理的命令：
   * - new-session: 添加到跟踪列表
   * - kill-session: 从跟踪列表移除
   * - kill-server: 清空跟踪列表
   */
  const toolExecuteAfter = async (
    input: ToolExecuteInput,
    output: ToolExecuteOutput,
  ) => {
    const { tool, sessionID, args } = input;
    const toolLower = tool.toLowerCase();

    // 仅处理interactive_bash工具
    if (toolLower !== "interactive_bash") {
      return;
    }

    if (typeof args?.tmux_command !== "string") {
      return;
    }

    const tmuxCommand = args.tmux_command;
    const tokens = tokenizeCommand(tmuxCommand);
    const subCommand = findSubcommand(tokens);
    const state = getOrCreateState(sessionID);
    let stateChanged = false;

    // 跳过错误输出
    const toolOutput = output?.output ?? ""
    if (toolOutput.startsWith("Error:")) {
      return
    }

    const isNewSession = subCommand === "new-session";
    const isKillSession = subCommand === "kill-session";
    const isKillServer = subCommand === "kill-server";

    const sessionName = extractSessionNameFromTokens(tokens, subCommand);

    // 跟踪会话创建/销毁
    if (isNewSession && isOmoSession(sessionName)) {
      state.tmuxSessions.add(sessionName!);
      stateChanged = true;
    } else if (isKillSession && isOmoSession(sessionName)) {
      state.tmuxSessions.delete(sessionName!);
      stateChanged = true;
    } else if (isKillServer) {
      state.tmuxSessions.clear();
      stateChanged = true;
    }

    // 持久化状态变更
    if (stateChanged) {
      state.updatedAt = Date.now();
      saveInteractiveBashSessionState(state);
    }

    // 添加会话状态提醒
    const isSessionOperation = isNewSession || isKillSession || isKillServer;
    if (isSessionOperation) {
      const reminder = buildSessionReminderMessage(
        Array.from(state.tmuxSessions),
      );
      if (reminder) {
        output.output += reminder;
      }
    }
  };

  /**
   * 事件处理器：清理会话
   * 
   * 当OpenCode会话被删除时，自动清理所有关联的tmux会话
   */
  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      const sessionID = sessionInfo?.id;

      if (sessionID) {
        const state = getOrCreateState(sessionID);
        // 清理所有跟踪的tmux会话
        await killAllTrackedSessions(state);
        sessionStates.delete(sessionID);
        clearInteractiveBashSessionState(sessionID);
      }
    }
  };

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
