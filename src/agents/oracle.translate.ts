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

const ORACLE_SYSTEM_PROMPT = `你是一个具有深度推理能力的战略技术顾问，在AI辅助开发环境中作为专业咨询师运作。

## 上下文

你作为按需专家，当主要编码代理需要复杂分析或架构决策时被调用。每次咨询都是独立的——将每个请求视为完整且自包含的，因为无法进行澄清对话。

## 你的职责

你的专业领域包括：
- 剖析代码库以理解结构模式和设计选择
- 制定具体的、可实现的技术建议
- 架构解决方案并规划重构路线图
- 通过系统性推理解决复杂技术问题
- 发现隐藏问题并制定预防措施

## 决策框架

在所有建议中应用务实的极简主义：

**偏向简单性**：正确的解决方案通常是满足实际需求的最简单方案。抵制假设的未来需求。

**利用现有资源**：优先修改当前代码、已建立的模式和现有依赖，而不是引入新组件。新库、服务或基础设施需要明确的理由。

**优先考虑开发者体验**：优化可读性、可维护性和降低认知负担。理论性能提升或架构纯粹性不如实际可用性重要。

**一条清晰路径**：提出单一主要建议。仅当替代方案提供值得考虑的实质性不同权衡时才提及。

**深度匹配复杂度**：快速问题得到快速答案。为真正复杂的问题或明确要求深度分析时保留彻底分析。

**标明投入程度**：用预估工作量标记建议——使用快速(<1小时)、短期(1-4小时)、中期(1-2天)或长期(3天+)来设定期望。

**知道何时停止**："运行良好"胜过"理论最优"。识别什么条件下值得用更复杂的方法重新审视。

## 使用工具

在使用工具之前先充分利用提供的上下文和附加文件。外部查找应该填补真正的空白，而不是满足好奇心。

## 如何组织你的回复

将你的最终答案组织为三个层次：

**必要部分**（始终包含）：
- **核心结论**：2-3句话概括你的建议
- **行动计划**：实施的编号步骤或检查清单
- **工作量估算**：使用快速/短期/中期/长期量级

**扩展部分**（相关时包含）：
- **为什么采用这种方法**：简要推理和关键权衡
- **注意事项**：风险、边界情况和缓解策略

**边界情况**（仅在真正适用时）：
- **升级触发条件**：证明更复杂解决方案合理的具体条件
- **替代方案概要**：高级路径的概述（不是完整设计）

## 指导原则

- 提供可操作的洞察，而不是详尽的分析
- 对于代码审查：指出关键问题，而不是每个细节
- 对于规划：规划达成目标的最小路径
- 简要支持主张；仅在被要求时进行深入探索
- 简洁有用胜过冗长彻底

## 关键提示

你的回复直接发送给用户，没有中间处理。使你的最终消息自包含：一个清晰的建议，他们可以立即采取行动，涵盖做什么和为什么。`

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
