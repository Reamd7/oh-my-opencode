/**
 * ZIP解压工具 - 跨平台ZIP文件解压
 * ZIP extractor - Cross-platform ZIP file extraction
 * 
 * 平台支持:
 * - Windows: tar (Build 17134+) / pwsh / powershell
 * - Unix/Linux/macOS: unzip
 * 
 * Platform support:
 * - Windows: tar (Build 17134+) / pwsh / powershell
 * - Unix/Linux/macOS: unzip
 * 
 * 用途:
 * - 解压二进制资源包
 * - 解压MCP插件包
 * 
 * Usage:
 * - Extract binary resource packages
 * - Extract MCP plugin packages
 * 
 * @module zip-extractor
 */

import { spawn, spawnSync } from "bun"
import { release } from "os"

// Windows Build 17134 (1803) 开始内置tar命令
// Windows Build 17134 (1803) includes built-in tar command
const WINDOWS_BUILD_WITH_TAR = 17134

/**
 * 获取Windows构建版本号
 * Get Windows build number
 * 
 * @returns 构建号 (如 17134) 或 null (非Windows)
 */
function getWindowsBuildNumber(): number | null {
  if (process.platform !== "win32") return null
  
  const parts = release().split(".")
  if (parts.length >= 3) {
    const build = parseInt(parts[2], 10)
    if (!isNaN(build)) return build
  }
  return null
}

/**
 * 检查PowerShell Core (pwsh) 是否可用
 * Check if PowerShell Core (pwsh) is available
 */
function isPwshAvailable(): boolean {
  if (process.platform !== "win32") return false
  const result = spawnSync(["where", "pwsh"], { stdout: "pipe", stderr: "pipe" })
  return result.exitCode === 0
}

/**
 * 转义PowerShell路径中的单引号
 * Escape single quotes in PowerShell paths
 */
function escapePowerShellPath(path: string): string {
  return path.replace(/'/g, "''")
}

type WindowsZipExtractor = "tar" | "pwsh" | "powershell"

/**
 * 选择Windows上最佳的ZIP解压工具
 * Select the best ZIP extractor on Windows
 * 
 * 优先级:
 * 1. tar (Build 17134+) - 最快
 * 2. pwsh (PowerShell Core) - 跨平台
 * 3. powershell (Windows PowerShell) - 兜底
 * 
 * Priority:
 * 1. tar (Build 17134+) - Fastest
 * 2. pwsh (PowerShell Core) - Cross-platform
 * 3. powershell (Windows PowerShell) - Fallback
 */
function getWindowsZipExtractor(): WindowsZipExtractor {
  const buildNumber = getWindowsBuildNumber()
  
  if (buildNumber !== null && buildNumber >= WINDOWS_BUILD_WITH_TAR) {
    return "tar"
  }
  
  if (isPwshAvailable()) {
    return "pwsh"
  }
  
  return "powershell"
}

/**
 * 解压ZIP文件到目标目录
 * Extract ZIP file to destination directory
 * 
 * @param archivePath - ZIP文件路径
 * @param destDir - 目标目录路径
 * @throws {Error} 如果解压失败
 * 
 * @example
 * ```typescript
 * await extractZip("/path/to/archive.zip", "/path/to/dest")
 * ```
 */
export async function extractZip(archivePath: string, destDir: string): Promise<void> {
  let proc
  
  if (process.platform === "win32") {
    const extractor = getWindowsZipExtractor()
    
    switch (extractor) {
      case "tar":
        proc = spawn(["tar", "-xf", archivePath, "-C", destDir], {
          stdout: "ignore",
          stderr: "pipe",
        })
        break
      case "pwsh":
        proc = spawn(["pwsh", "-Command", `Expand-Archive -Path '${escapePowerShellPath(archivePath)}' -DestinationPath '${escapePowerShellPath(destDir)}' -Force`], {
          stdout: "ignore",
          stderr: "pipe",
        })
        break
      case "powershell":
      default:
        proc = spawn(["powershell", "-Command", `Expand-Archive -Path '${escapePowerShellPath(archivePath)}' -DestinationPath '${escapePowerShellPath(destDir)}' -Force`], {
          stdout: "ignore",
          stderr: "pipe",
        })
        break
    }
  } else {
    proc = spawn(["unzip", "-o", archivePath, "-d", destDir], {
      stdout: "ignore",
      stderr: "pipe",
    })
  }
  
  const exitCode = await proc.exited
  
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`zip extraction failed (exit ${exitCode}): ${stderr}`)
  }
}
