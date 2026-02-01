/**
 * JSONC（JSON with Comments）解析工具
 * 
 * 核心功能：
 * - 支持 JSON 注释（单行和多行）
 * - 支持尾随逗号（trailing commas）
 * - 提供安全解析和错误处理
 * 
 * 设计理念：
 * - 使用 jsonc-parser 库（VS Code 同款解析器）
 * - 配置文件应该对人类友好（允许注释和尾随逗号）
 * - 提供类型安全的泛型接口
 * 
 * 为什么支持 JSONC：
 * - 配置文件需要注释来解释复杂选项
 * - 尾随逗号减少 git diff 噪音
 * - 与 VS Code、OpenCode 生态保持一致
 */
import { existsSync, readFileSync } from "node:fs"
import { parse, ParseError, printParseErrorCode } from "jsonc-parser"

/** JSONC 解析结果（安全模式） */
export interface JsoncParseResult<T> {
  /** 解析后的数据，失败时为 null */
  data: T | null
  /** 解析错误列表 */
  errors: Array<{ message: string; offset: number; length: number }>
}

/**
 * 解析 JSONC 字符串（抛出异常模式）
 * 
 * 支持单行注释、多行注释和尾随逗号
 * 
 * @throws {SyntaxError} 解析失败时抛出异常
 */
export function parseJsonc<T = unknown>(content: string): T {
  const errors: ParseError[] = []
  const result = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as T

  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(", ")
    throw new SyntaxError(`JSONC parse error: ${errorMessages}`)
  }

  return result
}

/**
 * 解析 JSONC 字符串（安全模式）
 * 
 * 不抛出异常，返回解析结果和错误信息。
 * 适用于需要自定义错误处理的场景。
 */
export function parseJsoncSafe<T = unknown>(content: string): JsoncParseResult<T> {
  const errors: ParseError[] = []
  const data = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as T | null

  return {
    data: errors.length > 0 ? null : data,
    errors: errors.map((e) => ({
      message: printParseErrorCode(e.error),
      offset: e.offset,
      length: e.length,
    })),
  }
}

/**
 * 读取并解析 JSONC 文件
 * 
 * @returns 解析后的数据，失败时返回 null
 */
export function readJsoncFile<T = unknown>(filePath: string): T | null {
  try {
    const content = readFileSync(filePath, "utf-8")
    return parseJsonc<T>(content)
  } catch {
    return null
  }
}

/**
 * 检测配置文件格式
 * 
 * 优先级：.jsonc > .json
 * 
 * @returns 文件格式和路径，不存在时返回 "none"
 */
export function detectConfigFile(basePath: string): {
  format: "json" | "jsonc" | "none"
  path: string
} {
  const jsoncPath = `${basePath}.jsonc`
  const jsonPath = `${basePath}.json`

  if (existsSync(jsoncPath)) {
    return { format: "jsonc", path: jsoncPath }
  }
  if (existsSync(jsonPath)) {
    return { format: "json", path: jsonPath }
  }
  return { format: "none", path: jsonPath }
}
