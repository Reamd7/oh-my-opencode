/**
 * Multimodal Looker - 多模态文件分析专家
 * 
 * ## 角色定位
 * Multimodal Looker专门处理需要视觉理解的媒体文件，提供超越纯文本的解释能力。
 * 使用Gemini 3 Flash模型，擅长OCR、图像理解和文档信息提取。
 * 
 * ## 核心能力
 * - PDF文档分析（提取文本、结构、表格、特定章节数据）
 * - 图像内容描述（布局、UI元素、文本、图表）
 * - 技术图表解释（关系图、流程图、架构图）
 * - OCR文本识别（从图片中提取文字）
 * - 上下文节省（提取关键信息，避免主代理处理原始文件）
 * 
 * ## 支持的文件类型
 * - PDF文档
 * - 图片文件（PNG, JPG, etc.）
 * - 技术图表和架构图
 * - UI设计稿和截图
 * 
 * ## 使用场景
 * - Read工具无法解释的媒体文件
 * - 需要从文档中提取特定信息或摘要
 * - 需要描述图像或图表的视觉内容
 * - 需要分析数据而非原始文件内容
 * 
 * ## 避免使用
 * - 源代码或纯文本文件（使用Read工具）
 * - 需要后续编辑的文件（需要Read工具的字面内容）
 * - 不需要解释的简单文件读取
 * 
 * ## 工作流程
 * 1. 接收文件路径和提取目标
 * 2. 深度读取和分析文件
 * 3. 仅返回相关的提取信息
 * 4. 主代理无需处理原始文件，节省上下文tokens
 * 
 * ## 成本分类
 * CHEAP - 使用Gemini 3 Flash，成本效益高的多模态分析
 * 
 * ## 工具限制
 * 白名单模式：仅允许read工具
 * 最严格的限制，确保专注于文件分析
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentPromptMetadata } from "./types"
import { createAgentToolAllowlist } from "../shared/permission-compat"

/**
 * Multimodal Looker代理的元数据配置
 * 
 * 定义Multimodal Looker在Sisyphus提示词中的展示方式。
 * 
 * **分类**: utility（工具类代理）
 * **成本**: CHEAP（使用Gemini 3 Flash，成本效益高）
 * **触发器**: 无自动触发器（按需调用）
 */
export const MULTIMODAL_LOOKER_PROMPT_METADATA: AgentPromptMetadata = {
  category: "utility",
  cost: "CHEAP",
  promptAlias: "Multimodal Looker",
  triggers: [],
}

/**
 * 创建Multimodal Looker代理配置
 * 
 * Multimodal Looker专门处理需要视觉理解的媒体文件，提供超越纯文本的解释能力。
 * 
 * **配置特点:**
 * - 模型: 使用多模态模型（推荐Gemini 3 Flash或类似）
 * - 温度: 0.1（确保分析结果的一致性）
 * - 白名单限制: 仅允许read工具（最严格限制）
 * - 多模态能力: 支持PDF、图片、图表分析
 * - 上下文优化: 提取关键信息，减少主代理负担
 * 
 * **支持的文件类型:**
 * - PDF文档
 * - 图片文件（PNG, JPG, etc.）
 * - 技术图表和架构图
 * - UI设计稿和截图
 * 
 * **工作流程:**
 * 1. 接收文件路径和提取目标
 * 2. 深度读取和分析文件
 * 3. 仅返回相关的提取信息
 * 4. 主代理无需处理原始文件，节省上下文tokens
 * 
 * @param model - 模型标识符（推荐使用Gemini 3 Flash或类似多模态模型）
 * @returns 配置好的Multimodal Looker代理，包含严格的只读限制
 * 
 * @example
 * ```typescript
 * const looker = createMultimodalLookerAgent("google/gemini-3-flash")
 * // 分析PDF文档
 * delegate_task(agent="multimodal-looker", 
 *   prompt="Extract the API endpoints table from docs/api.pdf")
 * ```
 */
export function createMultimodalLookerAgent(model: string): AgentConfig {
  const restrictions = createAgentToolAllowlist(["read"])

  return {
    description:
      "Analyze media files (PDFs, images, diagrams) that require interpretation beyond raw text. Extracts specific information or summaries from documents, describes visual content. Use when you need analyzed/extracted data rather than literal file contents.",
    mode: "subagent" as const,
    model,
    temperature: 0.1,
    ...restrictions,
    prompt: `You interpret media files that cannot be read as plain text.

Your job: examine the attached file and extract ONLY what was requested.

When to use you:
- Media files the Read tool cannot interpret
- Extracting specific information or summaries from documents
- Describing visual content in images or diagrams
- When analyzed/extracted data is needed, not raw file contents

When NOT to use you:
- Source code or plain text files needing exact contents (use Read)
- Files that need editing afterward (need literal content from Read)
- Simple file reading where no interpretation is needed

How you work:
1. Receive a file path and a goal describing what to extract
2. Read and analyze the file deeply
3. Return ONLY the relevant extracted information
4. The main agent never processes the raw file - you save context tokens

For PDFs: extract text, structure, tables, data from specific sections
For images: describe layouts, UI elements, text, diagrams, charts
For diagrams: explain relationships, flows, architecture depicted

Response rules:
- Return extracted information directly, no preamble
- If info not found, state clearly what's missing
- Match the language of the request
- Be thorough on the goal, concise on everything else

Your output goes straight to the main agent for continued work.`,
  }
}

/**
 * 创建Multimodal Looker代理配置
 * 
 * @param model - 模型标识符（推荐使用Gemini 3 Flash或类似多模态模型）
 * @returns 配置好的Multimodal Looker代理，包含严格的只读限制
 * 
 * 配置特点：
 * - 温度0.1：确保分析结果的一致性
 * - 白名单限制：仅允许read工具（最严格限制）
 * - 多模态能力：支持PDF、图片、图表分析
 * - 上下文优化：提取关键信息，减少主代理负担
 * - 目标导向：仅返回请求的信息，不做额外分析
 */
