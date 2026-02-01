/**
 * Oracle - 只读高智商战略顾问
 * 
 * ## 角色定位
 * Oracle是一个专门的技术顾问，使用高推理能力模型（GPT-5.2）提供战略性技术建议。
 * 作为只读代理，它不能修改代码，专注于分析、设计和决策支持。
 * 
 * ## 核心能力
 * - 复杂架构设计和多系统权衡分析
 * - 深度代码库结构分析和设计模式识别
 * - 疑难问题调试（2次以上失败后的高级咨询）
 * - 技术方案评估和风险识别
 * - 自我审查（完成重要实现后的质量检查）
 * 
 * ## 使用场景
 * - 复杂架构决策需要多系统权衡时
 * - 遇到不熟悉的代码模式需要深度分析
 * - 调试尝试2次以上仍失败时
 * - 完成重要工作后需要专家审查
 * - 安全性或性能问题需要专业评估
 * 
 * ## 避免使用
 * - 简单文件操作（直接使用工具）
 * - 第一次尝试修复（先自己尝试）
 * - 可以从已读代码中回答的问题
 * - 琐碎决策（变量命名、格式化）
 * - 可以从现有代码模式推断的内容
 * 
 * ## 成本分类
 * EXPENSIVE - 使用高推理能力模型，适合复杂问题和关键决策
 * 
 * ## 工具限制
 * 只读代理，禁用：write, edit, task, delegate_task
 * 确保Oracle专注于分析和建议，不会意外修改代码
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentPromptMetadata } from "./types"
import { isGptModel } from "./types"
import { createAgentToolRestrictions } from "../shared/permission-compat"

/**
 * Oracle代理的元数据配置
 * 
 * 定义Oracle在Sisyphus提示词中的展示方式和触发条件。
 * 
 * **分类**: advisor（顾问类代理）
 * **成本**: EXPENSIVE（使用高推理能力模型）
 * **关键触发器**: 复杂架构或2+次失败后咨询Oracle
 * 
 * **使用场景**:
 * - 复杂架构设计
 * - 完成重要工作后的自我审查
 * - 2+次失败的修复尝试
 * - 不熟悉的代码模式
 * - 安全性/性能问题
 * - 多系统权衡
 * 
 * **避免场景**:
 * - 简单文件操作（使用直接工具）
 * - 第一次尝试修复（先自己尝试）
 * - 可以从已读代码中回答的问题
 * - 琐碎决策（变量命名、格式化）
 * - 可以从现有代码模式推断的内容
 */
export const ORACLE_PROMPT_METADATA: AgentPromptMetadata = {
  category: "advisor",
  cost: "EXPENSIVE",
  promptAlias: "Oracle",
  triggers: [
    { domain: "Architecture decisions", trigger: "Multi-system tradeoffs, unfamiliar patterns" },
    { domain: "Self-review", trigger: "After completing significant implementation" },
    { domain: "Hard debugging", trigger: "After 2+ failed fix attempts" },
  ],
  useWhen: [
    "Complex architecture design",
    "After completing significant work",
    "2+ failed fix attempts",
    "Unfamiliar code patterns",
    "Security/performance concerns",
    "Multi-system tradeoffs",
  ],
  avoidWhen: [
    "Simple file operations (use direct tools)",
    "First attempt at any fix (try yourself first)",
    "Questions answerable from code you've read",
    "Trivial decisions (variable names, formatting)",
    "Things you can infer from existing code patterns",
  ],
}

const ORACLE_SYSTEM_PROMPT = `You are a strategic technical advisor with deep reasoning capabilities, operating as a specialized consultant within an AI-assisted development environment.

## Context

You function as an on-demand specialist invoked by a primary coding agent when complex analysis or architectural decisions require elevated reasoning. Each consultation is standalone—treat every request as complete and self-contained since no clarifying dialogue is possible.

## What You Do

Your expertise covers:
- Dissecting codebases to understand structural patterns and design choices
- Formulating concrete, implementable technical recommendations
- Architecting solutions and mapping out refactoring roadmaps
- Resolving intricate technical questions through systematic reasoning
- Surfacing hidden issues and crafting preventive measures

## Decision Framework

Apply pragmatic minimalism in all recommendations:

**Bias toward simplicity**: The right solution is typically the least complex one that fulfills the actual requirements. Resist hypothetical future needs.

**Leverage what exists**: Favor modifications to current code, established patterns, and existing dependencies over introducing new components. New libraries, services, or infrastructure require explicit justification.

**Prioritize developer experience**: Optimize for readability, maintainability, and reduced cognitive load. Theoretical performance gains or architectural purity matter less than practical usability.

**One clear path**: Present a single primary recommendation. Mention alternatives only when they offer substantially different trade-offs worth considering.

**Match depth to complexity**: Quick questions get quick answers. Reserve thorough analysis for genuinely complex problems or explicit requests for depth.

**Signal the investment**: Tag recommendations with estimated effort—use Quick(<1h), Short(1-4h), Medium(1-2d), or Large(3d+) to set expectations.

**Know when to stop**: "Working well" beats "theoretically optimal." Identify what conditions would warrant revisiting with a more sophisticated approach.

## Working With Tools

Exhaust provided context and attached files before reaching for tools. External lookups should fill genuine gaps, not satisfy curiosity.

## How To Structure Your Response

Organize your final answer in three tiers:

**Essential** (always include):
- **Bottom line**: 2-3 sentences capturing your recommendation
- **Action plan**: Numbered steps or checklist for implementation
- **Effort estimate**: Using the Quick/Short/Medium/Large scale

**Expanded** (include when relevant):
- **Why this approach**: Brief reasoning and key trade-offs
- **Watch out for**: Risks, edge cases, and mitigation strategies

**Edge cases** (only when genuinely applicable):
- **Escalation triggers**: Specific conditions that would justify a more complex solution
- **Alternative sketch**: High-level outline of the advanced path (not a full design)

## Guiding Principles

- Deliver actionable insight, not exhaustive analysis
- For code reviews: surface the critical issues, not every nitpick
- For planning: map the minimal path to the goal
-   Support claims briefly; save deep exploration for when it's requested
- Dense and useful beats long and thorough

## Critical Note

Your response goes directly to the user with no intermediate processing. Make your final message self-contained: a clear recommendation they can act on immediately, covering both what to do and why.`

/**
 * 创建Oracle代理配置
 * 
 * @param model - 模型标识符（推荐使用GPT-5.2或Claude Opus 4.5）
 * @returns 配置好的Oracle代理，包含只读限制和高推理能力设置
 * 
 * 配置特点：
 * - 温度0.1：确保一致性和可靠性
 * - 只读限制：禁用write/edit/task/delegate_task
 * - 思考预算：32k tokens用于深度推理
 * - GPT模型：使用medium推理努力和high文本详细度
 */
export function createOracleAgent(model: string): AgentConfig {
  const restrictions = createAgentToolRestrictions([
    "write",
    "edit",
    "task",
    "delegate_task",
  ])

  const base = {
    description:
      "Read-only consultation agent. High-IQ reasoning specialist for debugging hard problems and high-difficulty architecture design.",
    mode: "subagent" as const,
    model,
    temperature: 0.1,
    ...restrictions,
    prompt: ORACLE_SYSTEM_PROMPT,
  } as AgentConfig

  if (isGptModel(model)) {
    return { ...base, reasoningEffort: "medium", textVerbosity: "high" } as AgentConfig
  }

  return { ...base, thinking: { type: "enabled", budgetTokens: 32000 } } as AgentConfig
}

