/**
 * 回退链条目
 * Fallback chain entry
 * 
 * 定义单个模型的回退选项，支持多个provider提供相同模型
 * Defines fallback option for a single model, supports multiple providers for the same model
 * 
 * 示例 (Example):
 * { providers: ["anthropic", "github-copilot"], model: "claude-opus-4-5", variant: "max" }
 * 表示优先使用anthropic的claude-opus-4-5，如果不可用则尝试github-copilot
 */
export type FallbackEntry = {
  providers: string[]  // Provider列表，按优先级排序 (Provider list, ordered by priority)
  model: string        // 模型ID（不含provider前缀）(Model ID without provider prefix)
  variant?: string     // 条目特定的variant（如GPT→high, Opus→max）(Entry-specific variant)
}

/**
 * 模型需求定义
 * Model requirement definition
 * 
 * 为agent或category定义完整的模型回退链
 * Defines complete model fallback chain for agent or category
 */
export type ModelRequirement = {
  fallbackChain: FallbackEntry[]  // 回退链，按优先级排序 (Fallback chain, ordered by priority)
  variant?: string                // 默认variant（当条目未指定时使用）(Default variant when entry doesn't specify)
}

/**
 * Agent模型需求配置
 * Agent model requirements configuration
 * 
 * 为每个agent定义模型回退链，确保在任何情况下都能找到可用模型
 * Defines model fallback chain for each agent to ensure available model in any situation
 * 
 * 回退链设计原则 (Fallback chain design principles):
 * 1. 首选模型：最适合该agent任务的模型（如sisyphus用Opus 4.5）
 * 2. 次选模型：性能相近的替代模型（如GPT 5.2）
 * 3. 兜底模型：确保可用性的基础模型（如Gemini 3 Pro）
 * 4. 多provider：同一模型支持多个provider（anthropic/github-copilot/opencode）
 */
export const AGENT_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  sisyphus: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["zai-coding-plan"], model: "glm-4.7" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2-codex", variant: "medium" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  oracle: {
    fallbackChain: [
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
   librarian: {
     fallbackChain: [
       { providers: ["zai-coding-plan"], model: "glm-4.7" },
       { providers: ["opencode"], model: "big-pickle" },
       { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-5" },
     ],
   },
  explore: {
    fallbackChain: [
      { providers: ["anthropic", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["github-copilot"], model: "gpt-5-mini" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  "multimodal-looker": {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
      { providers: ["zai-coding-plan"], model: "glm-4.6v" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  prometheus: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  metis: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "max" },
    ],
  },
  momus: {
    fallbackChain: [
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "medium" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "max" },
    ],
  },
  atlas: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-5" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
}

/**
 * Category模型需求配置
 * Category model requirements configuration
 * 
 * 为不同任务类别定义专门的模型回退链
 * Defines specialized model fallback chains for different task categories
 * 
 * Category说明 (Category descriptions):
 * - visual-engineering: 前端/UI任务，优先Gemini 3 Pro（视觉能力强）
 * - ultrabrain: 复杂逻辑任务，优先GPT 5.2 Codex（推理能力强）
 * - artistry: 创意任务，优先Gemini 3 Pro（创造力强）
 * - quick: 快速任务，优先Haiku 4.5（速度快）
 * - writing: 文档写作，优先Gemini 3 Flash（文本生成好）
 */
export const CATEGORY_MODEL_REQUIREMENTS: Record<string, ModelRequirement> = {
  "visual-engineering": {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
    ],
  },
  ultrabrain: {
    fallbackChain: [
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2-codex", variant: "xhigh" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  artistry: {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro", variant: "max" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
    ],
  },
  quick: {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-haiku-4-5" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["opencode"], model: "gpt-5-nano" },
    ],
  },
  "unspecified-low": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-5" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2-codex", variant: "medium" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
    ],
  },
  "unspecified-high": {
    fallbackChain: [
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-opus-4-5", variant: "max" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2", variant: "high" },
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-pro" },
    ],
  },
  writing: {
    fallbackChain: [
      { providers: ["google", "github-copilot", "opencode"], model: "gemini-3-flash" },
      { providers: ["anthropic", "github-copilot", "opencode"], model: "claude-sonnet-4-5" },
      { providers: ["zai-coding-plan"], model: "glm-4.7" },
      { providers: ["openai", "github-copilot", "opencode"], model: "gpt-5.2" },
    ],
  },
}
