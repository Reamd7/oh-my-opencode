/**
 * Multimodal Looker - 多模态文件分析专家
 * 
 * ## 角色定位
 * Multimodal Looker专门处理需要视觉理解的媒体文件,提供超越纯文本的解释能力。
 * 使用Gemini 3 Flash模型,擅长OCR、图像理解和文档信息提取。
 * 
 * ## 核心能力
 * - PDF文档分析(提取文本、结构、表格、特定章节数据)
 * - 图像内容描述(布局、UI元素、文本、图表)
 * - 技术图表解释(关系图、流程图、架构图)
 * - OCR文本识别(从图片中提取文字)
 * - 上下文节省(提取关键信息,避免主代理处理原始文件)
 * 
 * ## 支持的文件类型
 * - PDF文档
 * - 图片文件(PNG, JPG, etc.)
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
 * - 源代码或纯文本文件(使用Read工具)
 * - 需要后续编辑的文件(需要Read工具的字面内容)
 * - 不需要解释的简单文件读取
 * 
 * ## 工作流程
 * 1. 接收文件路径和提取目标
 * 2. 深度读取和分析文件
 * 3. 仅返回相关的提取信息
 * 4. 主代理无需处理原始文件,节省上下文tokens
 * 
 * ## 成本分类
 * CHEAP - 使用Gemini 3 Flash,成本效益高的多模态分析
 * 
 * ## 工具限制
 * 白名单模式:仅允许read工具
 * 最严格的限制,确保专注于文件分析
 */

import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentPromptMetadata } from "./types"
import { createAgentToolAllowlist } from "../shared/permission-compat"

/**
 * Multimodal Looker代理的元数据配置
 * 
 * 定义Multimodal Looker在Sisyphus提示词中的展示方式。
 * 
 * **分类**: utility(工具类代理)
 * **成本**: CHEAP(使用Gemini 3 Flash,成本效益高)
 * **触发器**: 无自动触发器(按需调用)
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
 * Multimodal Looker专门处理需要视觉理解的媒体文件,提供超越纯文本的解释能力。
 * 
 * **配置特点:**
 * - 模型: 使用多模态模型(推荐Gemini 3 Flash或类似)
 * - 温度: 0.1(确保分析结果的一致性)
 * - 白名单限制: 仅允许read工具(最严格限制)
 * - 多模态能力: 支持PDF、图片、图表分析
 * - 上下文优化: 提取关键信息,减少主代理负担
 * 
 * **支持的文件类型:**
 * - PDF文档
 * - 图片文件(PNG, JPG, etc.)
 * - 技术图表和架构图
 * - UI设计稿和截图
 * 
 * **工作流程:**
 * 1. 接收文件路径和提取目标
 * 2. 深度读取和分析文件
 * 3. 仅返回相关的提取信息
 * 4. 主代理无需处理原始文件,节省上下文tokens
 * 
 * @param model - 模型标识符(推荐使用Gemini 3 Flash或类似多模态模型)
 * @returns 配置好的Multimodal Looker代理,包含严格的只读限制
 * 
 * @example
 * ```typescript
 * const looker = createMultimodalLookerAgent("google/gemini-3-flash")
 * // 分析PDF文档
 * delegate_task(agent="multimodal-looker", 
 *   prompt="从docs/api.pdf中提取API端点表格")
 * ```
 */
export function createMultimodalLookerAgent(model: string): AgentConfig {
  const restrictions = createAgentToolAllowlist(["read"])

  return {
    description:
      "分析需要超越原始文本解释的媒体文件(PDF、图片、图表)。从文档中提取特定信息或摘要,描述视觉内容。当您需要分析/提取的数据而非文件字面内容时使用。",
    mode: "subagent" as const,
    model,
    temperature: 0.1,
    ...restrictions,
    prompt: `你负责解释无法作为纯文本读取的媒体文件。

你的工作:检查附加的文件并仅提取请求的内容。

何时使用你:
- Read工具无法解释的媒体文件
- 从文档中提取特定信息或摘要
- 描述图像或图表中的视觉内容
- 需要分析/提取的数据,而非原始文件内容

何时不使用你:
- 需要精确内容的源代码或纯文本文件(使用Read工具)
- 之后需要编辑的文件(需要Read工具的字面内容)
- 不需要解释的简单文件读取

你的工作方式:
1. 接收文件路径和描述要提取内容的目标
2. 深度读取并分析文件
3. 仅返回相关的提取信息
4. 主代理永远不会处理原始文件 - 你节省了上下文token

对于PDF:提取文本、结构、表格、特定章节的数据
对于图像:描述布局、UI元素、文本、图表、图表
对于图表:解释所描绘的关系、流程、架构

响应规则:
- 直接返回提取的信息,无需开场白
- 如果未找到信息,明确说明缺少什么
- 匹配请求的语言
- 对目标要详尽,对其他内容要简洁

你的输出直接传递给主代理以继续工作。`,
  }
}

/**
 * 创建Multimodal Looker代理配置
 * 
 * @param model - 模型标识符(推荐使用Gemini 3 Flash或类似多模态模型)
 * @returns 配置好的Multimodal Looker代理,包含严格的只读限制
 * 
 * 配置特点:
 * - 温度0.1:确保分析结果的一致性
 * - 白名单限制:仅允许read工具(最严格限制)
 * - 多模态能力:支持PDF、图片、图表分析
 * - 上下文优化:提取关键信息,减少主代理负担
 * - 目标导向:仅返回请求的信息,不做额外分析
 */
