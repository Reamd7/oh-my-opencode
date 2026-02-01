/**
 * @file 代理系统模块入口 - oh-my-opencode 的核心架构
 * 
 * 本模块导出了 10 个专门化的 AI 代理，组成一个多模型协作系统：
 * 
 * **编排器 (Orchestrators):**
 * - Sisyphus: 主编排器，SF Bay Area 工程师风格，负责任务分解和协调
 * - Atlas: 主控编排器，持有 todo list，负责高层次任务管理
 * 
 * **专家代理 (Specialists):**
 * - Oracle: 战略顾问（GPT-5.2），用于复杂调试和架构决策
 * - Librarian: 多仓库研究专家，用于搜索官方文档、GitHub 代码和外部资源
 * - Explore: 快速代码库探索（类似 contextual grep），快速定位代码模式
 * - Multimodal Looker: 多模态分析器（Gemini 3 Flash），用于 PDF/图片分析
 * 
 * **咨询顾问 (Advisors):**
 * - Prometheus: 规划专家，负责任务分析和计划制定（未在此导出）
 * - Metis: 前置规划分析，检测计划中的缺陷和盲点
 * - Momus: 计划审查者，以严格标准审查工作计划
 * 
 * **动态提示系统:**
 * 代理系统使用 `dynamic-agent-prompt-builder` 动态生成提示词，确保代理始终获得
 * 最新的工具列表、技能定义和其他代理的信息。这是一个元数据驱动的设计，
 * 新增代理时无需手动更新所有提示词。
 */

// 核心类型定义：AgentConfig, AgentFactory, AgentPromptMetadata 等
export * from "./types"

// 代理工厂函数：根据配置创建所有内置代理实例
export { createBuiltinAgents } from "./utils"

// 动态提示构建器的类型：用于在 Sisyphus/Atlas 提示词中展示可用资源
export type { AvailableAgent, AvailableCategory, AvailableSkill } from "./dynamic-agent-prompt-builder"

// === 编排器导出 ===
export { createSisyphusAgent } from "./sisyphus"
export { createAtlasAgent, atlasPromptMetadata } from "./atlas"

// === 专家代理导出 ===
// Oracle: 战略顾问，只读模式，用于高质量推理
export { createOracleAgent, ORACLE_PROMPT_METADATA } from "./oracle"

// Librarian: 外部资源搜索（官方文档、OSS 实现、GitHub 代码）
export { createLibrarianAgent, LIBRARIAN_PROMPT_METADATA } from "./librarian"

// Explore: 内部代码库快速搜索（contextual grep）
export { createExploreAgent, EXPLORE_PROMPT_METADATA } from "./explore"

// Multimodal Looker: 多模态文件分析（PDF、图片、视频）
export { createMultimodalLookerAgent, MULTIMODAL_LOOKER_PROMPT_METADATA } from "./multimodal-looker"

// === 咨询顾问导出 ===
// Metis: 前置规划分析，检测需求中的隐藏意图和潜在失败点
export { createMetisAgent, METIS_SYSTEM_PROMPT, metisPromptMetadata } from "./metis"

// Momus: 计划审查者，以严格标准评估工作计划的清晰度和完整性
export { createMomusAgent, MOMUS_SYSTEM_PROMPT, momusPromptMetadata } from "./momus"
