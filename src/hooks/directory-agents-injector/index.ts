/**
 * 目录代理注入钩子 (Directory Agents Injector Hook)
 * 
 * 功能：自动注入目录层级的 AGENTS.md 文件，为代理提供上下文知识
 * 目的：让代理在读取文件时自动获取该目录及父目录的架构说明和约定
 * 
 * 工作原理：
 * 1. 监听 Read 工具调用，获取目标文件路径
 * 2. 从文件所在目录向上遍历，查找所有 AGENTS.md 文件
 * 3. 将找到的 AGENTS.md 内容追加到工具输出中
 * 4. 使用会话级缓存避免重复注入同一目录的 AGENTS.md
 * 
 * 注入时机：
 * - Read 工具执行后（tool.execute.after）
 * - Batch 工具中的 Read 调用执行后
 * 
 * 注入格式：
 * [Directory Context: /path/to/AGENTS.md]
 * <AGENTS.md 内容>
 * [Note: Content was truncated...] (如果内容被截断)
 */
import type { PluginInput } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  loadInjectedPaths,
  saveInjectedPaths,
  clearInjectedPaths,
} from "./storage";
import { AGENTS_FILENAME } from "./constants";
import { createDynamicTruncator } from "../../shared/dynamic-truncator";

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

interface ToolExecuteBeforeOutput {
  args: unknown;
}

interface BatchToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

interface EventInput {
  event: {
    type: string;
    properties?: unknown;
  };
}

/**
 * 创建目录代理注入钩子
 * 
 * @param ctx - 插件上下文，提供项目根目录信息
 * @returns 钩子对象，包含 tool.execute.before、tool.execute.after 和 event 处理器
 */
export function createDirectoryAgentsInjectorHook(ctx: PluginInput) {
  // 会话级缓存：记录每个会话已注入的目录，避免重复注入
  const sessionCaches = new Map<string, Set<string>>();
  // Batch 工具待处理的文件路径队列
  const pendingBatchReads = new Map<string, string[]>();
  // 动态内容截断器：根据上下文窗口自动截断长内容
  const truncator = createDynamicTruncator(ctx);

  /**
   * 获取会话缓存，首次访问时从持久化存储加载
   */
  function getSessionCache(sessionID: string): Set<string> {
    if (!sessionCaches.has(sessionID)) {
      sessionCaches.set(sessionID, loadInjectedPaths(sessionID));
    }
    return sessionCaches.get(sessionID)!;
  }

  /**
   * 解析文件路径为绝对路径
   */
  function resolveFilePath(path: string): string | null {
    if (!path) return null;
    if (path.startsWith("/")) return path;
    return resolve(ctx.directory, path);
  }

  /**
   * 向上查找所有 AGENTS.md 文件
   * 
   * 从指定目录开始，向上遍历到项目根目录，收集所有 AGENTS.md 文件
   * 注意：跳过项目根目录的 AGENTS.md，因为 OpenCode 已通过 custom() 加载
   * 
   * @param startDir - 起始目录
   * @returns AGENTS.md 文件路径数组（从根到叶的顺序）
   */
  function findAgentsMdUp(startDir: string): string[] {
    const found: string[] = [];
    let current = startDir;

    while (true) {
      // Skip root AGENTS.md - OpenCode's system.ts already loads it via custom()
      // See: https://github.com/code-yeongyu/oh-my-opencode/issues/379
      const isRootDir = current === ctx.directory;
      if (!isRootDir) {
        const agentsPath = join(current, AGENTS_FILENAME);
        if (existsSync(agentsPath)) {
          found.push(agentsPath);
        }
      }

      if (isRootDir) break;
      const parent = dirname(current);
      if (parent === current) break;
      if (!parent.startsWith(ctx.directory)) break;
      current = parent;
    }

    return found.reverse();
  }

  /**
   * 处理文件路径并注入 AGENTS.md 内容
   * 
   * 核心注入逻辑：
   * 1. 查找文件所在目录及父目录的所有 AGENTS.md
   * 2. 过滤已注入的目录（通过缓存）
   * 3. 读取 AGENTS.md 内容并截断（如果过长）
   * 4. 追加到工具输出中，格式：[Directory Context: path]\n<content>
   * 5. 更新缓存和持久化存储
   */
  async function processFilePathForInjection(
    filePath: string,
    sessionID: string,
    output: ToolExecuteOutput,
  ): Promise<void> {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return;

    const dir = dirname(resolved);
    const cache = getSessionCache(sessionID);
    const agentsPaths = findAgentsMdUp(dir);

    for (const agentsPath of agentsPaths) {
      const agentsDir = dirname(agentsPath);
      if (cache.has(agentsDir)) continue;

      try {
        const content = readFileSync(agentsPath, "utf-8");
        const { result, truncated } = await truncator.truncate(sessionID, content);
        const truncationNotice = truncated
          ? `\n\n[Note: Content was truncated to save context window space. For full context, please read the file directly: ${agentsPath}]`
          : "";
        output.output += `\n\n[Directory Context: ${agentsPath}]\n${result}${truncationNotice}`;
        cache.add(agentsDir);
      } catch {}
    }

    saveInjectedPaths(sessionID, cache);
  }

  /**
   * 工具执行前钩子：提取 Batch 工具中的 Read 调用
   * 
   * Batch 工具允许并行执行多个工具调用，需要提前提取所有 Read 调用的文件路径
   * 存储到 pendingBatchReads 中，在 toolExecuteAfter 中统一处理
   */
  const toolExecuteBefore = async (
    input: ToolExecuteInput,
    output: ToolExecuteBeforeOutput,
  ) => {
    if (input.tool.toLowerCase() !== "batch") return;

    const args = output.args as { tool_calls?: BatchToolCall[] } | undefined;
    if (!args?.tool_calls) return;

    const readFilePaths: string[] = [];
    for (const call of args.tool_calls) {
      if (call.tool.toLowerCase() === "read" && call.parameters?.filePath) {
        readFilePaths.push(call.parameters.filePath as string);
      }
    }

    if (readFilePaths.length > 0) {
      pendingBatchReads.set(input.callID, readFilePaths);
    }
  };

  /**
   * 工具执行后钩子：注入 AGENTS.md 内容
   * 
   * 处理两种情况：
   * 1. Read 工具：直接处理单个文件
   * 2. Batch 工具：处理之前提取的所有 Read 调用
   */
  const toolExecuteAfter = async (
    input: ToolExecuteInput,
    output: ToolExecuteOutput,
  ) => {
    const toolName = input.tool.toLowerCase();

    if (toolName === "read") {
      await processFilePathForInjection(output.title, input.sessionID, output);
      return;
    }

    if (toolName === "batch") {
      const filePaths = pendingBatchReads.get(input.callID);
      if (filePaths) {
        for (const filePath of filePaths) {
          await processFilePathForInjection(filePath, input.sessionID, output);
        }
        pendingBatchReads.delete(input.callID);
      }
    }
  };

  /**
   * 事件处理器：清理会话状态
   * 
   * 监听事件：
   * - session.deleted：会话删除时清理内存和持久化缓存
   * - session.compacted：会话压缩时重置缓存（压缩后上下文变化，需重新注入）
   */
  const eventHandler = async ({ event }: EventInput) => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        sessionCaches.delete(sessionInfo.id);
        clearInjectedPaths(sessionInfo.id);
      }
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ??
        (props?.info as { id?: string } | undefined)?.id) as string | undefined;
      if (sessionID) {
        sessionCaches.delete(sessionID);
        clearInjectedPaths(sessionID);
      }
    }
  };

  return {
    "tool.execute.before": toolExecuteBefore,
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
