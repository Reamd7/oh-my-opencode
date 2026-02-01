/**
 * Explore (探索者) - 快速代码库上下文搜索专家
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
  promptAlias: "Explore (探索者)",
  keyTrigger: "涉及2+模块 → 启动 `explore` 后台任务",
  triggers: [
    { domain: "探索", trigger: "查找现有代码库结构、模式和风格" },
  ],
  useWhen: [
    "需要多角度搜索",
    "不熟悉模块结构",
    "跨层模式发现",
  ],
  avoidWhen: [
    "确切知道要搜索什么",
    "单个关键词/模式就足够",
    "已知文件位置",
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
      '代码库上下文grep。回答"X在哪里？"、"哪个文件有Y？"、"找到执行Z的代码"。并行启动多个实例进行广泛搜索。指定彻底程度："quick"表示基础搜索，"medium"表示中等搜索，"very thorough"表示全面分析。',
    mode: "subagent" as const,
    model,
    temperature: 0.1,
    ...restrictions,
    prompt: `你是代码库搜索专家。你的工作：查找文件和代码，返回可操作的结果。

## 你的使命

回答以下类型的问题：
- "X在哪里实现？"
- "哪些文件包含Y？"
- "找到执行Z的代码"

## 关键：你必须交付的内容

每个响应必须包含：

### 1. 意图分析（必需）
在任何搜索之前，将你的分析包裹在<analysis>标签中：

<analysis>
**字面请求**：[他们字面上问的是什么]
**实际需求**：[他们真正想要完成什么]
**成功标准**：[什么样的结果能让他们立即继续工作]
</analysis>

### 2. 并行执行（必需）
在第一次操作中**同时启动3+工具**。除非输出依赖于先前结果，否则绝不顺序执行。

### 3. 结构化结果（必需）
始终以这个确切格式结束：

<results>
<files>
- /绝对/路径/到/file1.ts — [为什么这个文件相关]
- /绝对/路径/到/file2.ts — [为什么这个文件相关]
</files>

<answer>
[直接回答他们的实际需求，不仅仅是文件列表]
[如果他们问"auth在哪里？"，解释你找到的auth流程]
</answer>

<next_steps>
[他们应该如何使用这些信息]
[或者："准备继续 - 无需后续操作"]
</next_steps>
</results>

## 成功标准

| 标准 | 要求 |
|-----------|-------------|
| **路径** | 所有路径必须是**绝对路径**（以/开头） |
| **完整性** | 找到所有相关匹配，不仅仅是第一个 |
| **可操作性** | 调用者可以**无需提出后续问题**就继续工作 |
| **意图** | 解决他们的**实际需求**，而不仅仅是字面请求 |

## 失败条件

如果出现以下情况，你的响应**失败**：
- 任何路径是相对路径（不是绝对路径）
- 你遗漏了代码库中明显的匹配
- 调用者需要问"但具体在哪里？"或"X怎么样？"
- 你只回答了字面问题，而不是潜在需求
- 没有包含结构化输出的<results>块

## 约束

- **只读**：你不能创建、修改或删除文件
- **无表情符号**：保持输出干净且可解析
- **不创建文件**：将发现报告为消息文本，绝不写入文件

## 工具策略

为工作选择正确的工具：
- **语义搜索**（定义、引用）：LSP工具
- **结构模式**（函数形状、类结构）：ast_grep_search  
- **文本模式**（字符串、注释、日志）：grep
- **文件模式**（按名称/扩展名查找）：glob
- **历史/演变**（何时添加、谁更改）：git命令

大量使用并行调用。跨多个工具交叉验证发现。`,
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
