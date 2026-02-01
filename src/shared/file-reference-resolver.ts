/**
 * 文件引用解析工具
 * 
 * 核心功能：
 * - 解析文本中的文件引用（@path/to/file 语法）
 * - 递归展开文件内容（支持嵌套引用）
 * - 自动处理相对路径和绝对路径
 * 
 * 使用场景：
 * - 配置文件中引用其他文件内容
 * - 模板系统中的文件包含
 * - 文档生成中的内容组合
 * 
 * 安全机制：
 * - 最大递归深度限制（默认 3 层）
 * - 文件不存在时返回错误提示而非抛出异常
 * - 目录引用检测和错误处理
 */
import { existsSync, readFileSync, statSync } from "fs"
import { join, isAbsolute } from "path"

interface FileMatch {
  fullMatch: string
  filePath: string
  start: number
  end: number
}

/** 文件引用模式：@path/to/file */
const FILE_REFERENCE_PATTERN = /@([^\s@]+)/g

/**
 * 查找文本中的所有文件引用
 */
function findFileReferences(text: string): FileMatch[] {
  const matches: FileMatch[] = []
  let match: RegExpExecArray | null

  FILE_REFERENCE_PATTERN.lastIndex = 0

  while ((match = FILE_REFERENCE_PATTERN.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      filePath: match[1],
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return matches
}

/**
 * 解析文件路径（相对路径转绝对路径）
 */
function resolveFilePath(filePath: string, cwd: string): string {
  if (isAbsolute(filePath)) {
    return filePath
  }
  return join(cwd, filePath)
}

/**
 * 读取文件内容（带错误处理）
 * 
 * @returns 文件内容，或错误提示信息
 */
function readFileContent(resolvedPath: string): string {
  if (!existsSync(resolvedPath)) {
    return `[file not found: ${resolvedPath}]`
  }

  const stat = statSync(resolvedPath)
  if (stat.isDirectory()) {
    return `[cannot read directory: ${resolvedPath}]`
  }

  const content = readFileSync(resolvedPath, "utf-8")
  return content
}

/**
 * 递归解析文本中的文件引用
 * 
 * 将文本中的 @path/to/file 替换为文件实际内容。
 * 支持嵌套引用（文件内容中可以再包含文件引用）。
 * 
 * @param text 待解析的文本
 * @param cwd 工作目录（用于解析相对路径）
 * @param depth 当前递归深度
 * @param maxDepth 最大递归深度（防止无限递归）
 * @returns 解析后的文本
 */
export async function resolveFileReferencesInText(
  text: string,
  cwd: string = process.cwd(),
  depth: number = 0,
  maxDepth: number = 3
): Promise<string> {
  if (depth >= maxDepth) {
    return text
  }

  const matches = findFileReferences(text)
  if (matches.length === 0) {
    return text
  }

  const replacements = new Map<string, string>()

  for (const match of matches) {
    const resolvedPath = resolveFilePath(match.filePath, cwd)
    const content = readFileContent(resolvedPath)
    replacements.set(match.fullMatch, content)
  }

  let resolved = text
  for (const [pattern, replacement] of replacements.entries()) {
    resolved = resolved.split(pattern).join(replacement)
  }

  if (findFileReferences(resolved).length > 0 && depth + 1 < maxDepth) {
    return resolveFileReferencesInText(resolved, cwd, depth + 1, maxDepth)
  }

  return resolved
}
