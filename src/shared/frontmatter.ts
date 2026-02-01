/**
 * YAML前置元数据解析器 - 安全的frontmatter提取
 * YAML frontmatter parser - Safe frontmatter extraction
 * 
 * 安全特性:
 * - 使用JSON_SCHEMA防止YAML代码注入攻击
 * - 不支持YAML标签 (如 !!python/object)
 * - 仅解析JSON兼容的YAML子集
 * 
 * Safety features:
 * - Uses JSON_SCHEMA to prevent YAML code injection attacks
 * - Does not support YAML tags (like !!python/object)
 * - Only parses JSON-compatible YAML subset
 * 
 * 用途:
 * - 解析skill文件中的MCP配置
 * - 提取markdown文件的元数据
 * 
 * Usage:
 * - Parse MCP config in skill files
 * - Extract metadata from markdown files
 * 
 * @module frontmatter
 */

import yaml from "js-yaml"

/**
 * Frontmatter解析结果
 * Frontmatter parse result
 */
export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T                    // 解析的YAML数据 / Parsed YAML data
  body: string               // 去除frontmatter后的内容 / Content after frontmatter
  hadFrontmatter: boolean    // 是否存在frontmatter / Whether frontmatter exists
  parseError: boolean        // 是否解析失败 / Whether parsing failed
}

/**
 * 解析YAML frontmatter
 * Parse YAML frontmatter
 * 
 * 格式:
 * ```
 * ---
 * key: value
 * ---
 * content here
 * ```
 * 
 * 安全说明:
 * 使用JSON_SCHEMA防止代码执行 - 不支持 !!python/object 等危险标签
 * 
 * Security note:
 * Uses JSON_SCHEMA to prevent code execution - does not support dangerous tags like !!python/object
 * 
 * @param content - 包含frontmatter的文本内容
 * @returns 解析结果，包含数据和正文
 * 
 * @example
 * ```typescript
 * const result = parseFrontmatter(`---
 * title: Hello
 * ---
 * Content here`)
 * // result.data = { title: "Hello" }
 * // result.body = "Content here"
 * ```
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): FrontmatterResult<T> {
  // 匹配 ---\n...\n--- 格式的frontmatter
  // Match frontmatter in ---\n...\n--- format
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { data: {} as T, body: content, hadFrontmatter: false, parseError: false }
  }

  const yamlContent = match[1]
  const body = match[2]

  try {
    // 使用JSON_SCHEMA确保安全 - 防止通过YAML标签执行代码
    // Use JSON_SCHEMA for security - prevents code execution via YAML tags
    const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA })
    const data = (parsed ?? {}) as T
    return { data, body, hadFrontmatter: true, parseError: false }
  } catch {
    return { data: {} as T, body, hadFrontmatter: true, parseError: true }
  }
}
