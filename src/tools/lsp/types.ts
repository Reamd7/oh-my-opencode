/**
 * LSP协议类型定义
 * 
 * 基于Language Server Protocol规范的TypeScript类型。
 * 参考: https://microsoft.github.io/language-server-protocol/
 */

/**
 * LSP服务器配置
 */
export interface LSPServerConfig {
  id: string // 服务器唯一标识
  command: string[] // 启动命令（如["typescript-language-server", "--stdio"]）
  extensions: string[] // 支持的文件扩展名（如[".ts", ".tsx"]）
  disabled?: boolean // 是否禁用
  env?: Record<string, string> // 环境变量
  initialization?: Record<string, unknown> // 初始化参数
}

/**
 * 位置 - 文件中的光标位置
 */
export interface Position {
  line: number // 行号（0-based）
  character: number // 列号（0-based）
}

/**
 * 范围 - 文件中的文本区域
 */
export interface Range {
  start: Position // 起始位置
  end: Position // 结束位置
}

/**
 * 位置 - 文件URI + 范围
 */
export interface Location {
  uri: string // 文件URI（如"file:///path/to/file.ts"）
  range: Range // 文本范围
}

/**
 * 位置链接 - 带有选择范围的位置（用于goto definition）
 */
export interface LocationLink {
  targetUri: string // 目标文件URI
  targetRange: Range // 目标完整范围
  targetSelectionRange: Range // 目标选择范围（通常是符号名称）
  originSelectionRange?: Range // 源选择范围
}

/**
 * 符号信息 - 工作区符号搜索结果
 */
export interface SymbolInfo {
  name: string // 符号名称
  kind: number // 符号类型（1=File, 6=Method, 12=Function等）
  location: Location // 符号位置
  containerName?: string // 容器名称（如类名）
}

/**
 * 文档符号 - 文件大纲中的符号（支持层级结构）
 */
export interface DocumentSymbol {
  name: string // 符号名称
  kind: number // 符号类型
  range: Range // 完整范围（包括注释和body）
  selectionRange: Range // 选择范围（通常是符号名称）
  children?: DocumentSymbol[] // 子符号（如类的方法）
}

/**
 * 诊断信息 - 错误、警告、提示
 */
export interface Diagnostic {
  range: Range // 问题位置
  severity?: number // 严重级别（1=Error, 2=Warning, 3=Info, 4=Hint）
  code?: string | number // 错误码（如"TS2304"）
  source?: string // 来源（如"typescript"）
  message: string // 错误消息
}

export interface TextDocumentIdentifier {
  uri: string
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number | null
}

export interface TextEdit {
  range: Range
  newText: string
}

export interface TextDocumentEdit {
  textDocument: VersionedTextDocumentIdentifier
  edits: TextEdit[]
}

export interface CreateFile {
  kind: "create"
  uri: string
  options?: { overwrite?: boolean; ignoreIfExists?: boolean }
}

export interface RenameFile {
  kind: "rename"
  oldUri: string
  newUri: string
  options?: { overwrite?: boolean; ignoreIfExists?: boolean }
}

export interface DeleteFile {
  kind: "delete"
  uri: string
  options?: { recursive?: boolean; ignoreIfNotExists?: boolean }
}

/**
 * 工作区编辑 - 跨文件的批量修改
 */
export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] } // 简单模式：uri -> 编辑列表
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[] // 高级模式：支持文件操作
}

/**
 * 重命名准备结果 - 包含可重命名的范围和占位符
 */
export interface PrepareRenameResult {
  range: Range // 可重命名的范围
  placeholder?: string // 当前符号名称
}

/**
 * 重命名默认行为 - 服务器是否支持重命名
 */
export interface PrepareRenameDefaultBehavior {
  defaultBehavior: boolean // true表示支持重命名
}

export interface ServerLookupInfo {
  id: string
  command: string[]
  extensions: string[]
}

export type ServerLookupResult =
  | { status: "found"; server: ResolvedServer }
  | { status: "not_configured"; extension: string; availableServers: string[] }
  | { status: "not_installed"; server: ServerLookupInfo; installHint: string }

export interface ResolvedServer {
  id: string
  command: string[]
  extensions: string[]
  priority: number
  env?: Record<string, string>
  initialization?: Record<string, unknown>
}
