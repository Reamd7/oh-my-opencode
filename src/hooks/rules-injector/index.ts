/**
 * 规则注入钩子 (Rules Injector Hook)
 * 
 * 功能：根据文件路径和规则条件，动态注入自定义规则到代理上下文
 * 目的：实现条件化的代理行为控制，类似 .copilot-instructions.md 但更强大
 * 
 * 工作原理：
 * 1. 监听文件操作工具（read/write/edit/multiedit）
 * 2. 查找项目和用户目录下的规则文件（.copilot-instructions.md 或 .rules/*.md）
 * 3. 解析规则文件的 YAML frontmatter，检查匹配条件（glob、regex、exclude）
 * 4. 将匹配的规则内容注入到工具输出中
 * 5. 使用内容哈希和真实路径双重去重，避免重复注入
 * 
 * 规则文件格式：
 * ---
 * glob: "src/**\/*.ts"        # 匹配文件路径（可选）
 * regex: "test.*\\.ts$"       # 正则匹配（可选）
 * exclude: "**\/*.test.ts"    # 排除路径（可选）
 * ---
 * <规则内容>
 * 
 * 规则优先级：
 * 1. 距离文件最近的规则优先（按目录层级排序）
 * 2. 内容哈希去重：相同内容的规则只注入一次
 * 3. 真实路径去重：符号链接指向同一文件时只注入一次
 * 
 * 注入格式：
 * [Rule: path/to/rule.md]
 * [Match: glob pattern matched]
 * <规则内容>
 */
import type { PluginInput } from "@opencode-ai/plugin";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import { findProjectRoot, findRuleFiles } from "./finder";
import {
  createContentHash,
  isDuplicateByContentHash,
  isDuplicateByRealPath,
  shouldApplyRule,
} from "./matcher";
import { parseRuleFrontmatter } from "./parser";
import {
  clearInjectedRules,
  loadInjectedRules,
  saveInjectedRules,
} from "./storage";
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

interface RuleToInject {
  relativePath: string;
  matchReason: string;
  content: string;
  distance: number;
}

// 监控的工具：只在文件读写操作时注入规则
const TRACKED_TOOLS = ["read", "write", "edit", "multiedit"];

/**
 * 创建规则注入钩子
 * 
 * @param ctx - 插件上下文，提供项目根目录信息
 * @returns 钩子对象，包含 tool.execute.before、tool.execute.after 和 event 处理器
 */
export function createRulesInjectorHook(ctx: PluginInput) {
  // 会话级缓存：记录已注入的规则（通过内容哈希和真实路径双重去重）
  const sessionCaches = new Map<
    string,
    { contentHashes: Set<string>; realPaths: Set<string> }
  >();
  // Batch 工具待处理的文件路径队列
  const pendingBatchFiles = new Map<string, string[]>();
  // 动态内容截断器：根据上下文窗口自动截断长内容
  const truncator = createDynamicTruncator(ctx);

  /**
   * 获取会话缓存，首次访问时从持久化存储加载
   */
  function getSessionCache(sessionID: string): {
    contentHashes: Set<string>;
    realPaths: Set<string>;
  } {
    if (!sessionCaches.has(sessionID)) {
      sessionCaches.set(sessionID, loadInjectedRules(sessionID));
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
   * 处理文件路径并注入匹配的规则
   * 
   * 核心注入逻辑：
   * 1. 查找项目和用户目录下的所有规则文件
   * 2. 解析规则文件的 frontmatter，检查匹配条件
   * 3. 过滤已注入的规则（通过真实路径和内容哈希）
   * 4. 按距离排序（距离文件最近的规则优先）
   * 5. 追加到工具输出中，格式：[Rule: path]\n[Match: reason]\n<content>
   * 6. 更新缓存和持久化存储
   * 
   * 规则匹配逻辑：
   * - .copilot-instructions.md：总是应用（无条件）
   * - .rules/*.md：根据 frontmatter 的 glob/regex/exclude 条件匹配
   * 
   * 去重机制：
   * - 真实路径去重：避免符号链接重复注入
   * - 内容哈希去重：避免相同内容的规则重复注入
   */
  async function processFilePathForInjection(
    filePath: string,
    sessionID: string,
    output: ToolExecuteOutput
  ): Promise<void> {
    const resolved = resolveFilePath(filePath);
    if (!resolved) return;

    const projectRoot = findProjectRoot(resolved);
    const cache = getSessionCache(sessionID);
    const home = homedir();

    const ruleFileCandidates = findRuleFiles(projectRoot, home, resolved);
    const toInject: RuleToInject[] = [];

    for (const candidate of ruleFileCandidates) {
      if (isDuplicateByRealPath(candidate.realPath, cache.realPaths)) continue;

      try {
        const rawContent = readFileSync(candidate.path, "utf-8");
        const { metadata, body } = parseRuleFrontmatter(rawContent);

        let matchReason: string;
        if (candidate.isSingleFile) {
          matchReason = "copilot-instructions (always apply)";
        } else {
          const matchResult = shouldApplyRule(metadata, resolved, projectRoot);
          if (!matchResult.applies) continue;
          matchReason = matchResult.reason ?? "matched";
        }

        const contentHash = createContentHash(body);
        if (isDuplicateByContentHash(contentHash, cache.contentHashes)) continue;

        const relativePath = projectRoot
          ? relative(projectRoot, candidate.path)
          : candidate.path;

        toInject.push({
          relativePath,
          matchReason,
          content: body,
          distance: candidate.distance,
        });

        cache.realPaths.add(candidate.realPath);
        cache.contentHashes.add(contentHash);
      } catch {}
    }

    if (toInject.length === 0) return;

    // 按距离排序：距离文件最近的规则优先
    toInject.sort((a, b) => a.distance - b.distance);

    for (const rule of toInject) {
      const { result, truncated } = await truncator.truncate(sessionID, rule.content);
      const truncationNotice = truncated
        ? `\n\n[Note: Content was truncated to save context window space. For full context, please read the file directly: ${rule.relativePath}]`
        : "";
      output.output += `\n\n[Rule: ${rule.relativePath}]\n[Match: ${rule.matchReason}]\n${result}${truncationNotice}`;
    }

    saveInjectedRules(sessionID, cache);
  }

  /**
   * 从 Batch 工具调用中提取文件路径
   * 支持多种参数名称：filePath, file_path, path
   */
  function extractFilePathFromToolCall(call: BatchToolCall): string | null {
    const params = call.parameters;
    return (params?.filePath ?? params?.file_path ?? params?.path) as string | null;
  }

  /**
   * 工具执行前钩子：提取 Batch 工具中的文件操作调用
   * 
   * 从 Batch 工具中提取所有 read/write/edit/multiedit 调用的文件路径
   * 存储到 pendingBatchFiles 中，在 toolExecuteAfter 中统一处理
   */
  const toolExecuteBefore = async (
    input: ToolExecuteInput,
    output: ToolExecuteBeforeOutput
  ) => {
    if (input.tool.toLowerCase() !== "batch") return;

    const args = output.args as { tool_calls?: BatchToolCall[] } | undefined;
    if (!args?.tool_calls) return;

    const filePaths: string[] = [];
    for (const call of args.tool_calls) {
      if (TRACKED_TOOLS.includes(call.tool.toLowerCase())) {
        const filePath = extractFilePathFromToolCall(call);
        if (filePath) {
          filePaths.push(filePath);
        }
      }
    }

    if (filePaths.length > 0) {
      pendingBatchFiles.set(input.callID, filePaths);
    }
  };

  /**
   * 工具执行后钩子：注入匹配的规则
   * 
   * 处理两种情况：
   * 1. 文件操作工具（read/write/edit/multiedit）：直接处理单个文件
   * 2. Batch 工具：处理之前提取的所有文件操作调用
   */
  const toolExecuteAfter = async (
    input: ToolExecuteInput,
    output: ToolExecuteOutput
  ) => {
    const toolName = input.tool.toLowerCase();

    if (TRACKED_TOOLS.includes(toolName)) {
      await processFilePathForInjection(output.title, input.sessionID, output);
      return;
    }

    if (toolName === "batch") {
      const filePaths = pendingBatchFiles.get(input.callID);
      if (filePaths) {
        for (const filePath of filePaths) {
          await processFilePathForInjection(filePath, input.sessionID, output);
        }
        pendingBatchFiles.delete(input.callID);
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
        clearInjectedRules(sessionInfo.id);
      }
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ??
        (props?.info as { id?: string } | undefined)?.id) as string | undefined;
      if (sessionID) {
        sessionCaches.delete(sessionID);
        clearInjectedRules(sessionID);
      }
    }
  };

  return {
    "tool.execute.before": toolExecuteBefore,
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
