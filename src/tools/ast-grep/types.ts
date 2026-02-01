import type { CLI_LANGUAGES, NAPI_LANGUAGES } from "./constants"

/** CLI支持的语言类型（25种） */
export type CliLanguage = (typeof CLI_LANGUAGES)[number]

/** NAPI支持的语言类型（5种：html, javascript, tsx, css, typescript） */
export type NapiLanguage = (typeof NAPI_LANGUAGES)[number]

/** 代码位置（行号和列号） */
export interface Position {
  line: number
  column: number
}

/** 代码范围（起始和结束位置） */
export interface Range {
  start: Position
  end: Position
}

/** CLI匹配结果 */
export interface CliMatch {
  text: string // 匹配的代码文本
  range: {
    byteOffset: { start: number; end: number } // 字节偏移量
    start: Position // 起始位置
    end: Position // 结束位置
  }
  file: string // 文件路径
  lines: string // 匹配的代码行
  charCount: { leading: number; trailing: number } // 前后空白字符数
  language: string // 语言类型
}

/** 搜索匹配结果 */
export interface SearchMatch {
  file: string // 文件路径
  text: string // 匹配的代码文本
  range: Range // 代码范围
  lines: string // 匹配的代码行
}

/** Meta变量（模式匹配中的变量，如$VAR） */
export interface MetaVariable {
  name: string // 变量名
  text: string // 匹配的文本
  kind: string // AST节点类型
}

/** 分析结果 */
export interface AnalyzeResult {
  text: string // 匹配的代码文本
  range: Range // 代码范围
  kind: string // AST节点类型
  metaVariables: MetaVariable[] // 提取的meta变量
}

/** 转换结果 */
export interface TransformResult {
  original: string // 原始代码
  transformed: string // 转换后的代码
  editCount: number // 编辑次数
}

/** AST-grep执行结果 */
export interface SgResult {
  matches: CliMatch[] // 匹配结果列表
  totalMatches: number // 总匹配数
  truncated: boolean // 是否被截断
  truncatedReason?: "max_matches" | "max_output_bytes" | "timeout" // 截断原因
  error?: string // 错误信息
}
