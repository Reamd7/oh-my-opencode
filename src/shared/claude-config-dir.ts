/**
 * Claude 配置目录解析工具
 * 
 * 用于获取 Claude Code 的配置目录路径，支持环境变量覆盖。
 * 
 * 优先级：
 * 1. CLAUDE_CONFIG_DIR 环境变量
 * 2. 默认路径：~/.claude
 */
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * 获取 Claude 配置目录
 * 
 * @returns Claude 配置目录的绝对路径
 */
export function getClaudeConfigDir(): string {
  const envConfigDir = process.env.CLAUDE_CONFIG_DIR
  if (envConfigDir) {
    return envConfigDir
  }
  
  return join(homedir(), ".claude")
}
