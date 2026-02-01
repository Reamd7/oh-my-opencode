/**
 * 代理使用提醒钩子 (Agent Usage Reminder Hook)
 * 
 * 功能：监控用户是否直接使用搜索/查询工具，而不是通过专业代理（explore/librarian）
 * 目的：引导用户使用更高效的代理委托模式，提升搜索质量和并行执行效率
 * 
 * 工作原理：
 * 1. 跟踪会话中是否使用过代理工具（task/call_omo_agent/delegate_task）
 * 2. 当用户直接调用搜索工具（grep/glob/websearch等）时，检查是否已使用代理
 * 3. 如果未使用代理，在工具输出中追加提醒消息，建议使用 delegate_task
 * 
 * 监控的工具：
 * - 搜索工具：grep, glob, webfetch, context7, websearch, grep_app
 * - 代理工具：task, call_omo_agent, delegate_task
 */
import type { PluginInput } from "@opencode-ai/plugin";
import {
  loadAgentUsageState,
  saveAgentUsageState,
  clearAgentUsageState,
} from "./storage";
import { TARGET_TOOLS, AGENT_TOOLS, REMINDER_MESSAGE } from "./constants";
import type { AgentUsageState } from "./types";

interface ToolExecuteInput {
  tool: string;
  sessionID: string;
  callID: string;
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
 * 创建代理使用提醒钩子
 * 
 * @param _ctx - 插件上下文（未使用）
 * @returns 钩子对象，包含 tool.execute.after 和 event 处理器
 */
export function createAgentUsageReminderHook(_ctx: PluginInput) {
  // 会话状态缓存：记录每个会话是否使用过代理工具
  const sessionStates = new Map<string, AgentUsageState>();

  /**
   * 获取或创建会话状态
   * 首次访问时从持久化存储加载，后续从内存缓存读取
   */
  function getOrCreateState(sessionID: string): AgentUsageState {
    if (!sessionStates.has(sessionID)) {
      const persisted = loadAgentUsageState(sessionID);
      const state: AgentUsageState = persisted ?? {
        sessionID,
        agentUsed: false,
        reminderCount: 0,
        updatedAt: Date.now(),
      };
      sessionStates.set(sessionID, state);
    }
    return sessionStates.get(sessionID)!;
  }

  /**
   * 标记会话已使用代理工具
   * 一旦标记，该会话后续不再显示提醒
   */
  function markAgentUsed(sessionID: string): void {
    const state = getOrCreateState(sessionID);
    state.agentUsed = true;
    state.updatedAt = Date.now();
    saveAgentUsageState(state);
  }

  /**
   * 重置会话状态（会话删除或压缩时调用）
   */
  function resetState(sessionID: string): void {
    sessionStates.delete(sessionID);
    clearAgentUsageState(sessionID);
  }

  /**
   * 工具执行后钩子：检测工具使用模式并注入提醒
   * 
   * 逻辑：
   * 1. 如果调用的是代理工具 → 标记已使用代理，不再提醒
   * 2. 如果调用的是搜索工具 + 未使用过代理 → 追加提醒消息
   * 3. 其他工具 → 忽略
   */
  const toolExecuteAfter = async (
    input: ToolExecuteInput,
    output: ToolExecuteOutput,
  ) => {
    const { tool, sessionID } = input;
    const toolLower = tool.toLowerCase();

    // 检测代理工具使用：task, call_omo_agent, delegate_task
    if (AGENT_TOOLS.has(toolLower)) {
      markAgentUsed(sessionID);
      return;
    }

    // 只监控目标搜索工具
    if (!TARGET_TOOLS.has(toolLower)) {
      return;
    }

    const state = getOrCreateState(sessionID);

    // 如果已使用过代理，不再提醒
    if (state.agentUsed) {
      return;
    }

    // 追加提醒消息：建议使用 delegate_task 代替直接工具调用
    output.output += REMINDER_MESSAGE;
    state.reminderCount++;
    state.updatedAt = Date.now();
    saveAgentUsageState(state);
  };

  /**
   * 事件处理器：清理会话状态
   * 
   * 监听事件：
   * - session.deleted：会话删除时清理状态
   * - session.compacted：会话压缩时重置状态（避免过时数据）
   */
  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        resetState(sessionInfo.id);
      }
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ??
        (props?.info as { id?: string } | undefined)?.id) as string | undefined;
      if (sessionID) {
        resetState(sessionID);
      }
    }
  };

  return {
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
