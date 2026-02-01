import { existsSync, mkdirSync, chmodSync, unlinkSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { createRequire } from "module"
import { extractZip } from "../../shared"

/** AST-grep GitHub仓库 */
const REPO = "ast-grep/ast-grep"

/**
 * 默认版本号
 * 
 * 重要：更新package.json中的@ast-grep/cli版本时，需同步更新此值
 * 仅在无法读取@ast-grep/cli的package.json时作为后备
 */
const DEFAULT_VERSION = "0.40.0"

/**
 * 获取AST-grep版本号
 * 优先从@ast-grep/cli的package.json读取，失败则使用默认版本
 */
function getAstGrepVersion(): string {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require("@ast-grep/cli/package.json")
    return pkg.version
  } catch {
    return DEFAULT_VERSION
  }
}

/** 平台信息（架构和操作系统） */
interface PlatformInfo {
  arch: string // CPU架构（如aarch64, x86_64）
  os: string // 操作系统（如apple-darwin, unknown-linux-gnu）
}

/** 平台到AST-grep二进制文件命名的映射 */
const PLATFORM_MAP: Record<string, PlatformInfo> = {
  "darwin-arm64": { arch: "aarch64", os: "apple-darwin" },
  "darwin-x64": { arch: "x86_64", os: "apple-darwin" },
  "linux-arm64": { arch: "aarch64", os: "unknown-linux-gnu" },
  "linux-x64": { arch: "x86_64", os: "unknown-linux-gnu" },
  "win32-x64": { arch: "x86_64", os: "pc-windows-msvc" },
  "win32-arm64": { arch: "aarch64", os: "pc-windows-msvc" },
  "win32-ia32": { arch: "i686", os: "pc-windows-msvc" },
}

/**
 * 获取缓存目录
 * 
 * 路径规则：
 * - Windows: %LOCALAPPDATA%\oh-my-opencode\bin
 * - Unix: $XDG_CACHE_HOME/oh-my-opencode/bin 或 ~/.cache/oh-my-opencode/bin
 */
export function getCacheDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA
    const base = localAppData || join(homedir(), "AppData", "Local")
    return join(base, "oh-my-opencode", "bin")
  }

  const xdgCache = process.env.XDG_CACHE_HOME
  const base = xdgCache || join(homedir(), ".cache")
  return join(base, "oh-my-opencode", "bin")
}

/** 获取二进制文件名（Windows为sg.exe，其他为sg） */
export function getBinaryName(): string {
  return process.platform === "win32" ? "sg.exe" : "sg"
}

/** 获取缓存的二进制文件路径（如果存在） */
export function getCachedBinaryPath(): string | null {
  const binaryPath = join(getCacheDir(), getBinaryName())
  return existsSync(binaryPath) ? binaryPath : null
}



/**
 * 下载AST-grep二进制文件
 * 
 * ## 下载流程
 * 1. 检查缓存是否已存在
 * 2. 根据平台构建下载URL
 * 3. 从GitHub Releases下载zip文件
 * 4. 解压到缓存目录
 * 5. 设置可执行权限（Unix系统）
 * 
 * @param version - 版本号（默认使用DEFAULT_VERSION）
 * @returns 二进制文件路径，失败返回null
 */
export async function downloadAstGrep(version: string = DEFAULT_VERSION): Promise<string | null> {
  const platformKey = `${process.platform}-${process.arch}`
  const platformInfo = PLATFORM_MAP[platformKey]

  if (!platformInfo) {
    console.error(`[oh-my-opencode] Unsupported platform for ast-grep: ${platformKey}`)
    return null
  }

  const cacheDir = getCacheDir()
  const binaryName = getBinaryName()
  const binaryPath = join(cacheDir, binaryName)

  if (existsSync(binaryPath)) {
    return binaryPath
  }

  const { arch, os } = platformInfo
  const assetName = `app-${arch}-${os}.zip`
  const downloadUrl = `https://github.com/${REPO}/releases/download/${version}/${assetName}`

  console.log(`[oh-my-opencode] Downloading ast-grep binary...`)

  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
    }

    const response = await fetch(downloadUrl, { redirect: "follow" })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const archivePath = join(cacheDir, assetName)
    const arrayBuffer = await response.arrayBuffer()
    await Bun.write(archivePath, arrayBuffer)

    await extractZip(archivePath, cacheDir)

    if (existsSync(archivePath)) {
      unlinkSync(archivePath)
    }

    if (process.platform !== "win32" && existsSync(binaryPath)) {
      chmodSync(binaryPath, 0o755)
    }

    console.log(`[oh-my-opencode] ast-grep binary ready.`)

    return binaryPath
  } catch (err) {
    console.error(
      `[oh-my-opencode] Failed to download ast-grep: ${err instanceof Error ? err.message : err}`
    )
    return null
  }
}

/**
 * 确保AST-grep二进制文件可用
 * 如果缓存中不存在，则自动下载
 */
export async function ensureAstGrepBinary(): Promise<string | null> {
  const cachedPath = getCachedBinaryPath()
  if (cachedPath) {
    return cachedPath
  }

  const version = getAstGrepVersion()
  return downloadAstGrep(version)
}
