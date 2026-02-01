/**
 * 文件工具 - 文件类型检测和符号链接处理
 * File utilities - File type detection and symlink handling
 * 
 * 功能:
 * - Markdown文件检测
 * - 符号链接检测和解析
 * - 同步和异步符号链接解析
 * 
 * Features:
 * - Markdown file detection
 * - Symlink detection and resolution
 * - Sync and async symlink resolution
 * 
 * @module file-utils
 */

import { lstatSync, readlinkSync } from "fs"
import { promises as fs } from "fs"
import { resolve } from "path"

/**
 * 检查文件条目是否为Markdown文件
 * Check if file entry is a Markdown file
 * 
 * 规则:
 * - 不以 . 开头 (排除隐藏文件)
 * - 以 .md 结尾
 * - 是文件而非目录
 * 
 * Rules:
 * - Does not start with . (excludes hidden files)
 * - Ends with .md
 * - Is a file, not a directory
 */
export function isMarkdownFile(entry: { name: string; isFile: () => boolean }): boolean {
  return !entry.name.startsWith(".") && entry.name.endsWith(".md") && entry.isFile()
}

/**
 * 检查路径是否为符号链接
 * Check if path is a symbolic link
 */
export function isSymbolicLink(filePath: string): boolean {
  try {
    return lstatSync(filePath, { throwIfNoEntry: false })?.isSymbolicLink() ?? false
  } catch {
    return false
  }
}

/**
 * 解析符号链接到实际路径 (同步)
 * Resolve symbolic link to actual path (sync)
 * 
 * @param filePath - 可能是符号链接的路径
 * @returns 解析后的实际路径，如果不是符号链接则返回原路径
 */
export function resolveSymlink(filePath: string): string {
  try {
    const stats = lstatSync(filePath, { throwIfNoEntry: false })
    if (stats?.isSymbolicLink()) {
      return resolve(filePath, "..", readlinkSync(filePath))
    }
    return filePath
  } catch {
    return filePath
  }
}

/**
 * 解析符号链接到实际路径 (异步)
 * Resolve symbolic link to actual path (async)
 * 
 * @param filePath - 可能是符号链接的路径
 * @returns 解析后的实际路径，如果不是符号链接则返回原路径
 */
export async function resolveSymlinkAsync(filePath: string): Promise<string> {
  try {
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink()) {
      const linkTarget = await fs.readlink(filePath)
      return resolve(filePath, "..", linkTarget)
    }
    return filePath
  } catch {
    return filePath
  }
}
