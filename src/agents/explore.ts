/**
 * Explore - 快速代码库上下文搜索专家
 * 
 * ## 角色定位
 * Explore是专门的代码库搜索代理，提供"上下文感知的grep"能力。
 * 它不仅查找代码，还理解用户的真实意图，提供可操作的结果。
 * 
 * ## 核心能力
 * - 上下文感知的代码搜索（理解"实际需求"而非"字面请求"）
 * - 多角度并行搜索（同时使用3+工具）
 * - 结构化结果输出（文件列表 + 答案 + 后续步骤）
 * - 多工具策略：LSP（语义）、AST-grep（结构）、grep（文本）、glob（文件名）
 * - 绝对路径保证（所有路径必须以/开头）
 * 
 * ## 与普通搜索的区别
 * - **普通grep**："找到包含X的文件" → 返回文件列表
 * - **Explore**："找到X的实现" → 分析意图 → 并行搜索 → 解释为什么这些文件相关 → 建议下一步
 * 
 * ## 使用场景
 * - "X在哪里实现？"
 * - "哪些文件包含Y？"
 * - "找到执行Z的代码"
 * - 需要多角度搜索时
 * - 不熟悉模块结构时
 * - 跨层模式发现时
 * 
 * ## 避免使用
 * - 确切知道要搜索什么时
 * - 单个关键词/模式就足够时
 * - 已知文件位置时
 * 
 * ## 并行执行策略
 * Explore设计为后台并行运行：
 * ```typescript
 * // 同时启动多个Explore代理
 * delegate_task(agent="explore", prompt="Find auth implementation")
 * delegate_task(agent="explore", prompt="Find database patterns")
 * delegate_task(agent="explore", prompt="Find API routes")
 * ```
 * 
 * ## 成本分类
 * FREE - 使用快速模型（Grok Code），适合频繁的代码库探索
 * 
 * ## 工具限制
 * 只读代理，禁用：write, edit, task, delegate_task, call_omo_agent
 * 专注于搜索和分析，不执行修改或委派
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentPromptMetadata } from "./types"
import { createAgentToolRestrictions } from "../shared/permission-compat"

/**
 * Explore代理的元数据配置
 * 
 * 定义Explore在Sisyphus提示词中的展示方式和触发条件。
 * 
 * **分类**: exploration（探索类代理）
 * **成本**: FREE（使用快速模型，零成本）
 * **关键触发器**: 涉及2+模块时后台启动explore
 * 
 * **使用场景**:
 * - 需要多角度搜索时
 * - 不熟悉模块结构时
 * - 跨层模式发现时
 * 
 * **避免场景**:
 * - 确切知道要搜索什么时
 * - 单个关键词/模式就足够时
 * - 已知文件位置时
 */
export const EXPLORE_PROMPT_METADATA: AgentPromptMetadata = {
  category: "exploration",
  cost: "FREE",
  promptAlias: "Explore",
  keyTrigger: "2+ modules involved → fire `explore` background",
  triggers: [
    { domain: "Explore", trigger: "Find existing codebase structure, patterns and styles" },
  ],
  useWhen: [
    "Multiple search angles needed",
    "Unfamiliar module structure",
    "Cross-layer pattern discovery",
  ],
  avoidWhen: [
    "You know exactly what to search",
    "Single keyword/pattern suffices",
    "Known file location",
  ],
}

/**
 * 创建Explore代理配置
 * 
 * Explore是快速代码库上下文搜索专家，提供"上下文感知的grep"能力。
 * 
 * **配置特点:**
 * - 模型: 使用快速模型（推荐Grok Code或类似）
 * - 温度: 0.1（确保搜索结果的一致性）
 * - 工具限制: 只读代理，禁用write/edit/task/delegate_task/call_omo_agent
 * - 并行优先: 设计为同时运行多个实例
 * - 结构化输出: <analysis> + <results> + <next_steps>
 * 
 * **工作流程:**
 * 1. 意图分析: 理解"字面请求"和"实际需求"
 * 2. 并行执行: 同时启动3+工具（LSP, AST-grep, grep, glob）
 * 3. 结构化结果: 文件列表 + 答案 + 后续步骤
 * 4. 绝对路径: 所有路径必须以/开头
 * 
 * @param model - 模型标识符（推荐使用快速模型如Grok Code）
 * @returns 配置好的Explore代理，包含上下文搜索能力和只读限制
 * 
 * @example
 * ```typescript
 * const explore = createExploreAgent("opencode/grok-code")
 * // 并行启动多个Explore实例
 * delegate_task(agent="explore", prompt="Find auth implementation")
 * delegate_task(agent="explore", prompt="Find database patterns")
 * ```
 */
export function createExploreAgent(model: string): AgentConfig {
  const restrictions = createAgentToolRestrictions([
    "write",
    "edit",
    "task",
    "delegate_task",
    "call_omo_agent",
  ])

  return {
    description:
      'Contextual grep for codebases. Answers "Where is X?", "Which file has Y?", "Find the code that does Z". Fire multiple in parallel for broad searches. Specify thoroughness: "quick" for basic, "medium" for moderate, "very thorough" for comprehensive analysis.',
    mode: "subagent" as const,
    model,
    temperature: 0.1,
    ...restrictions,
    prompt: `You are a codebase search specialist. Your job: find files and code, return actionable results.

## Your Mission

Answer questions like:
- "Where is X implemented?"
- "Which files contain Y?"
- "Find the code that does Z"

## CRITICAL: What You Must Deliver

Every response MUST include:

### 1. Intent Analysis (Required)
Before ANY search, wrap your analysis in <analysis> tags:

<analysis>
**Literal Request**: [What they literally asked]
**Actual Need**: [What they're really trying to accomplish]
**Success Looks Like**: [What result would let them proceed immediately]
</analysis>

### 2. Parallel Execution (Required)
Launch **3+ tools simultaneously** in your first action. Never sequential unless output depends on prior result.

### 3. Structured Results (Required)
Always end with this exact format:

<results>
<files>
- /absolute/path/to/file1.ts — [why this file is relevant]
- /absolute/path/to/file2.ts — [why this file is relevant]
</files>

<answer>
[Direct answer to their actual need, not just file list]
[If they asked "where is auth?", explain the auth flow you found]
</answer>

<next_steps>
[What they should do with this information]
[Or: "Ready to proceed - no follow-up needed"]
</next_steps>
</results>

## Success Criteria

| Criterion | Requirement |
|-----------|-------------|
| **Paths** | ALL paths must be **absolute** (start with /) |
| **Completeness** | Find ALL relevant matches, not just the first one |
| **Actionability** | Caller can proceed **without asking follow-up questions** |
| **Intent** | Address their **actual need**, not just literal request |

## Failure Conditions

Your response has **FAILED** if:
- Any path is relative (not absolute)
- You missed obvious matches in the codebase
- Caller needs to ask "but where exactly?" or "what about X?"
- You only answered the literal question, not the underlying need
- No <results> block with structured output

## Constraints

- **Read-only**: You cannot create, modify, or delete files
- **No emojis**: Keep output clean and parseable
- **No file creation**: Report findings as message text, never write files

## Tool Strategy

Use the right tool for the job:
- **Semantic search** (definitions, references): LSP tools
- **Structural patterns** (function shapes, class structures): ast_grep_search  
- **Text patterns** (strings, comments, logs): grep
- **File patterns** (find by name/extension): glob
- **History/evolution** (when added, who changed): git commands

Flood with parallel calls. Cross-validate findings across multiple tools.`,
  }
}

/**
 * 创建Explore代理配置
 * 
 * @param model - 模型标识符（推荐使用快速模型如Grok Code）
 * @returns 配置好的Explore代理，包含上下文搜索能力和只读限制
 * 
 * 配置特点：
 * - 温度0.1：确保搜索结果的一致性
 * - 只读限制：禁用write/edit/task/delegate_task/call_omo_agent
 * - 并行优先：设计为同时运行多个实例
 * - 结构化输出：<analysis> + <results> + <next_steps>
 * - 意图理解：区分"字面请求"和"实际需求"
 */
