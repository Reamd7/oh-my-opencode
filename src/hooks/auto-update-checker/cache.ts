/**
 * 缓存管理模块 (Cache Management Module)
 * 
 * ## 功能概述 (Overview)
 * 此模块负责管理 oh-my-opencode 插件的本地缓存，确保更新时能够正确清除旧版本。
 * 主要处理 npm 包缓存、bun.lock 文件和 node_modules 目录的清理工作。
 * 
 * This module manages the local cache for the oh-my-opencode plugin, ensuring
 * proper cleanup of old versions during updates. It handles npm package cache,
 * bun.lock file, and node_modules directory cleanup.
 * 
 * ## 核心功能 (Core Features)
 * 1. **包目录清理** - 删除 node_modules 中的包目录
 *    Package directory cleanup - removes package directory from node_modules
 * 
 * 2. **依赖记录移除** - 从 package.json 中移除依赖项
 *    Dependency record removal - removes dependency from package.json
 * 
 * 3. **锁文件更新** - 从 bun.lock 中移除包记录
 *    Lock file update - removes package record from bun.lock
 * 
 * ## 使用场景 (Use Cases)
 * - 插件自动更新前清除旧版本缓存
 *   Clear old version cache before plugin auto-update
 * 
 * - 手动强制重新安装插件
 *   Manually force plugin reinstallation
 * 
 * - 解决版本冲突问题
 *   Resolve version conflict issues
 * 
 * ## 注意事项 (Important Notes)
 * - 操作不可逆，清除后需要重新安装
 *   Operations are irreversible, reinstallation required after cleanup
 * 
 * - 仅清除指定包，不影响其他依赖
 *   Only clears specified package, doesn't affect other dependencies
 * 
 * - 支持 JSONC 格式的 bun.lock（带注释和尾随逗号）
 *   Supports JSONC format bun.lock (with comments and trailing commas)
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { CACHE_DIR, PACKAGE_NAME } from "./constants"
import { log } from "../../shared/logger"

interface BunLockfile {
  workspaces?: {
    ""?: {
      dependencies?: Record<string, string>
    }
  }
  packages?: Record<string, unknown>
}

/**
 * 移除 JSON 字符串中的尾随逗号
 * Removes trailing commas from JSON string
 * 
 * 用于处理 JSONC 格式的 bun.lock 文件，使其符合标准 JSON 格式。
 * Used to process JSONC format bun.lock files to conform to standard JSON format.
 * 
 * @param json - 包含尾随逗号的 JSON 字符串 (JSON string with trailing commas)
 * @returns 移除尾随逗号后的 JSON 字符串 (JSON string with trailing commas removed)
 * 
 * @example
 * stripTrailingCommas('{"a": 1,}') // '{"a": 1}'
 * stripTrailingCommas('[1, 2,]') // '[1, 2]'
 */
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1")
}

/**
 * 从 bun.lock 文件中移除指定包的记录
 * Removes specified package record from bun.lock file
 * 
 * 处理流程 (Processing flow):
 * 1. 读取 bun.lock 文件内容
 *    Read bun.lock file content
 * 
 * 2. 解析为 JSON 对象（支持 JSONC 格式）
 *    Parse as JSON object (supports JSONC format)
 * 
 * 3. 从 workspaces[""].dependencies 中删除包
 *    Remove package from workspaces[""].dependencies
 * 
 * 4. 从 packages 中删除包
 *    Remove package from packages
 * 
 * 5. 写回文件（如果有修改）
 *    Write back to file (if modified)
 * 
 * @param packageName - 要移除的包名 (Package name to remove)
 * @returns 是否成功移除（true=已修改，false=未找到或失败）
 *          Whether successfully removed (true=modified, false=not found or failed)
 */
function removeFromBunLock(packageName: string): boolean {
  const lockPath = path.join(CACHE_DIR, "bun.lock")
  if (!fs.existsSync(lockPath)) return false

  try {
    const content = fs.readFileSync(lockPath, "utf-8")
    const lock = JSON.parse(stripTrailingCommas(content)) as BunLockfile
    let modified = false

    if (lock.workspaces?.[""]?.dependencies?.[packageName]) {
      delete lock.workspaces[""].dependencies[packageName]
      modified = true
    }

    if (lock.packages?.[packageName]) {
      delete lock.packages[packageName]
      modified = true
    }

    if (modified) {
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2))
      log(`[auto-update-checker] Removed from bun.lock: ${packageName}`)
    }

    return modified
  } catch {
    return false
  }
}

/**
 * 清除指定包的所有缓存和记录
 * Clears all cache and records for specified package
 * 
 * ## 操作步骤 (Operation Steps)
 * 
 * ### 1. 删除包目录 (Delete package directory)
 * 从 node_modules 中删除包的完整目录，包括所有文件和子目录。
 * Deletes the complete package directory from node_modules, including all files and subdirectories.
 * 
 * ### 2. 移除依赖记录 (Remove dependency record)
 * 从 package.json 的 dependencies 字段中移除包的版本记录。
 * Removes the package version record from the dependencies field in package.json.
 * 
 * ### 3. 更新锁文件 (Update lock file)
 * 从 bun.lock 中移除包的所有相关记录（workspaces 和 packages）。
 * Removes all related package records from bun.lock (workspaces and packages).
 * 
 * ## 返回值说明 (Return Value Description)
 * - true: 至少执行了一项清理操作
 *   At least one cleanup operation was performed
 * 
 * - false: 未找到任何需要清理的内容
 *   No content found that needs cleanup
 * 
 * ## 使用示例 (Usage Example)
 * ```typescript
 * // 清除默认包（oh-my-opencode）
 * invalidatePackage()
 * 
 * // 清除指定包
 * invalidatePackage("some-other-package")
 * ```
 * 
 * @param packageName - 要清除的包名（默认为 PACKAGE_NAME）
 *                      Package name to clear (defaults to PACKAGE_NAME)
 * @returns 是否成功清除至少一项内容
 *          Whether at least one item was successfully cleared
 */
export function invalidatePackage(packageName: string = PACKAGE_NAME): boolean {
  try {
    const pkgDir = path.join(CACHE_DIR, "node_modules", packageName)
    const pkgJsonPath = path.join(CACHE_DIR, "package.json")

    let packageRemoved = false
    let dependencyRemoved = false
    let lockRemoved = false

    // 删除包目录
    if (fs.existsSync(pkgDir)) {
      fs.rmSync(pkgDir, { recursive: true, force: true })
      log(`[auto-update-checker] Package removed: ${pkgDir}`)
      packageRemoved = true
    }

    // 从package.json中移除依赖
    if (fs.existsSync(pkgJsonPath)) {
      const content = fs.readFileSync(pkgJsonPath, "utf-8")
      const pkgJson = JSON.parse(content)
      if (pkgJson.dependencies?.[packageName]) {
        delete pkgJson.dependencies[packageName]
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2))
        log(`[auto-update-checker] Dependency removed from package.json: ${packageName}`)
        dependencyRemoved = true
      }
    }

    // 从bun.lock中移除
    lockRemoved = removeFromBunLock(packageName)

    if (!packageRemoved && !dependencyRemoved && !lockRemoved) {
      log(`[auto-update-checker] Package not found, nothing to invalidate: ${packageName}`)
      return false
    }

    return true
  } catch (err) {
    log("[auto-update-checker] Failed to invalidate package:", err)
    return false
  }
}

/**
 * 清除缓存（已废弃）
 * Clear cache (deprecated)
 * 
 * @deprecated 使用 invalidatePackage 代替 - 此方法会清除所有插件
 *             Use invalidatePackage instead - this method clears all plugins
 * 
 * ## 废弃原因 (Deprecation Reason)
 * 此方法的命名不够明确，容易误导用户认为会清除所有缓存。
 * 实际上它只清除 oh-my-opencode 包，与 invalidatePackage() 功能相同。
 * 
 * The method name is not clear enough and may mislead users into thinking
 * it clears all caches. In fact, it only clears the oh-my-opencode package,
 * same as invalidatePackage().
 * 
 * ## 迁移指南 (Migration Guide)
 * ```typescript
 * // 旧代码 (Old code)
 * invalidateCache()
 * 
 * // 新代码 (New code)
 * invalidatePackage()
 * ```
 */
export function invalidateCache(): boolean {
  log("[auto-update-checker] WARNING: invalidateCache is deprecated, use invalidatePackage")
  return invalidatePackage()
}
