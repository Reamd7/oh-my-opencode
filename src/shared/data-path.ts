/**
 * XDG 基础目录规范工具
 * 
 * 遵循 XDG Base Directory Specification，提供跨平台的数据和缓存目录解析。
 * 
 * 设计理念：
 * - 完全遵循 XDG 规范（包括 Windows 平台）
 * - 与 OpenCode 的 xdg-basedir 行为保持一致
 * - 所有平台统一使用 ~/.local/share 和 ~/.cache
 * 
 * 环境变量优先级：
 * - XDG_DATA_HOME > ~/.local/share
 * - XDG_CACHE_HOME > ~/.cache
 */
import * as path from "node:path"
import * as os from "node:os"

/**
 * 获取用户级数据目录
 * 
 * 遵循 XDG 规范，所有平台统一返回：
 * - 优先：$XDG_DATA_HOME
 * - 默认：~/.local/share
 * 
 * 注意：OpenCode 使用 xdg-basedir 库，在所有平台（包括 Windows）
 * 都返回 ~/.local/share，我们完全匹配这一行为。
 */
export function getDataDir(): string {
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share")
}

/**
 * 获取 OpenCode 存储目录
 * 
 * 所有平台：~/.local/share/opencode/storage
 */
export function getOpenCodeStorageDir(): string {
  return path.join(getDataDir(), "opencode", "storage")
}

/**
 * 获取用户级缓存目录
 * 
 * 遵循 XDG 规范，所有平台统一返回：
 * - 优先：$XDG_CACHE_HOME
 * - 默认：~/.cache
 */
export function getCacheDir(): string {
  return process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache")
}

/**
 * 获取 oh-my-opencode 缓存目录
 * 
 * 所有平台：~/.cache/oh-my-opencode
 */
export function getOmoOpenCodeCacheDir(): string {
  return path.join(getCacheDir(), "oh-my-opencode")
}

/**
 * 获取 OpenCode 缓存目录（用于读取 OpenCode 的缓存）
 * 
 * 所有平台：~/.cache/opencode
 */
export function getOpenCodeCacheDir(): string {
  return path.join(getCacheDir(), "opencode")
}
