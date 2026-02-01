/**
 * CLI配置管理器
 * 
 * ## 功能概述
 * 管理OpenCode CLI的配置文件，支持JSONC格式和多层级加载。
 * 
 * ## 配置位置
 * - Project: .opencode/config.json
 * - User: ~/.config/opencode/config.json
 * - Global: /etc/opencode/config.json
 * 
 * ## 配置合并策略
 * Project > User > Global > Defaults
 * 使用deepMerge算法递归合并对象，数组直接覆盖
 * 
 * ## JSONC支持
 * - 注释（// 和 /* *\/）
 * - 尾随逗号
 * - 更友好的配置体验
 * 
 * ## 验证
 * 使用Zod schema验证配置有效性
 * 
 * ## 核心流程
 * 1. 检测配置格式 (detectConfigFormat)
 * 2. 解析JSONC (parseConfigWithError)
 * 3. 合并配置 (deepMerge)
 * 4. 写入配置 (writeFileSync)
 * 5. 验证配置 (Zod schema)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import {
  parseJsonc,
  getOpenCodeConfigPaths,
  type OpenCodeBinaryType,
  type OpenCodeConfigPaths,
} from "../shared"
import type { ConfigMergeResult, DetectedConfig, InstallConfig } from "./types"
import { generateModelConfig } from "./model-fallback"

/**
 * OpenCode支持的二进制文件名
 * - opencode: CLI版本
 * - opencode-desktop: 桌面应用版本
 */
const OPENCODE_BINARIES = ["opencode", "opencode-desktop"] as const

/**
 * 配置上下文
 * 存储当前使用的OpenCode二进制类型、版本和配置路径
 */
interface ConfigContext {
  binary: OpenCodeBinaryType
  version: string | null
  paths: OpenCodeConfigPaths
}

/**
 * 全局配置上下文单例
 * 避免重复检测OpenCode版本和路径
 */
let configContext: ConfigContext | null = null

/**
 * 初始化配置上下文
 * 
 * 设置当前使用的OpenCode二进制类型和版本，并计算对应的配置路径。
 * 通常在CLI启动时调用，避免后续重复检测。
 * 
 * @param binary - OpenCode二进制类型 (opencode 或 opencode-desktop)
 * @param version - OpenCode版本号，null表示未知版本
 */
export function initConfigContext(binary: OpenCodeBinaryType, version: string | null): void {
  const paths = getOpenCodeConfigPaths({ binary, version })
  configContext = { binary, version, paths }
}

/**
 * 获取配置上下文
 * 
 * 返回当前配置上下文，如果未初始化则使用默认值(opencode, null)。
 * 这是一个懒加载单例模式，确保配置路径只计算一次。
 * 
 * @returns 当前配置上下文
 */
export function getConfigContext(): ConfigContext {
  if (!configContext) {
    const paths = getOpenCodeConfigPaths({ binary: "opencode", version: null })
    configContext = { binary: "opencode", version: null, paths }
  }
  return configContext
}

/**
 * 重置配置上下文
 * 
 * 清空配置上下文缓存，主要用于测试场景。
 * 下次调用getConfigContext时会重新初始化。
 */
export function resetConfigContext(): void {
  configContext = null
}

/**
 * 获取配置目录路径
 * @returns ~/.config/opencode 或 ~/.config/opencode-desktop
 */
function getConfigDir(): string {
  return getConfigContext().paths.configDir
}

/**
 * 获取JSON配置文件路径
 * @returns ~/.config/opencode/opencode.json
 */
function getConfigJson(): string {
  return getConfigContext().paths.configJson
}

/**
 * 获取JSONC配置文件路径
 * @returns ~/.config/opencode/opencode.jsonc
 */
function getConfigJsonc(): string {
  return getConfigContext().paths.configJsonc
}

/**
 * 获取package.json路径
 * @returns ~/.config/opencode/package.json
 */
function getPackageJson(): string {
  return getConfigContext().paths.packageJson
}

/**
 * 获取oh-my-opencode配置文件路径
 * @returns ~/.config/opencode/oh-my-opencode.json
 */
function getOmoConfig(): string {
  return getConfigContext().paths.omoConfig
}

/**
 * Bun安装超时配置
 * 60秒超时，避免网络问题导致CLI挂起
 */
const BUN_INSTALL_TIMEOUT_SECONDS = 60
const BUN_INSTALL_TIMEOUT_MS = BUN_INSTALL_TIMEOUT_SECONDS * 1000

/**
 * Node.js错误接口
 * 扩展标准Error，添加错误代码字段
 */
interface NodeError extends Error {
  code?: string
}

/**
 * 检查是否为权限错误
 * @param err - 错误对象
 * @returns true表示权限不足 (EACCES/EPERM)
 */
function isPermissionError(err: unknown): boolean {
  const nodeErr = err as NodeError
  return nodeErr?.code === "EACCES" || nodeErr?.code === "EPERM"
}

/**
 * 检查是否为文件不存在错误
 * @param err - 错误对象
 * @returns true表示文件不存在 (ENOENT)
 */
function isFileNotFoundError(err: unknown): boolean {
  const nodeErr = err as NodeError
  return nodeErr?.code === "ENOENT"
}

/**
 * 格式化错误消息并提供解决建议
 * 
 * 根据错误类型提供具体的解决方案：
 * - 权限错误: 提示使用sudo或检查文件所有权
 * - 文件不存在: 提示文件可能被删除或移动
 * - JSON语法错误: 提示检查逗号、括号等
 * - 磁盘已满: 提示释放磁盘空间
 * - 只读文件系统: 提示检查挂载选项
 * 
 * @param err - 错误对象
 * @param context - 操作上下文描述
 * @returns 格式化的错误消息
 */
function formatErrorWithSuggestion(err: unknown, context: string): string {
  if (isPermissionError(err)) {
    return `Permission denied: Cannot ${context}. Try running with elevated permissions or check file ownership.`
  }

  if (isFileNotFoundError(err)) {
    return `File not found while trying to ${context}. The file may have been deleted or moved.`
  }

  if (err instanceof SyntaxError) {
    return `JSON syntax error while trying to ${context}: ${err.message}. Check for missing commas, brackets, or invalid characters.`
  }

  const message = err instanceof Error ? err.message : String(err)

  if (message.includes("ENOSPC")) {
    return `Disk full: Cannot ${context}. Free up disk space and try again.`
  }

  if (message.includes("EROFS")) {
    return `Read-only filesystem: Cannot ${context}. Check if the filesystem is mounted read-only.`
  }

  return `Failed to ${context}: ${message}`
}

/**
 * 获取NPM包的最新版本号
 * 
 * @param packageName - NPM包名
 * @returns 最新版本号，失败返回null
 */
export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`)
    if (!res.ok) return null
    const data = await res.json() as { version: string }
    return data.version
  } catch {
    return null
  }
}

/**
 * NPM发布标签接口
 * 包含latest、beta、next等标签及其对应的版本号
 */
interface NpmDistTags {
  latest?: string
  beta?: string
  next?: string
  [tag: string]: string | undefined
}

/**
 * NPM请求超时时间
 * 5秒超时，避免网络慢导致CLI挂起
 */
const NPM_FETCH_TIMEOUT_MS = 5000

/**
 * 获取NPM包的所有发布标签
 * 
 * @param packageName - NPM包名
 * @returns 标签映射对象，失败返回null
 */
export async function fetchNpmDistTags(packageName: string): Promise<NpmDistTags | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/-/package/${packageName}/dist-tags`, {
      signal: AbortSignal.timeout(NPM_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json() as NpmDistTags
    return data
  } catch {
    return null
  }
}

/**
 * 插件包名
 */
const PACKAGE_NAME = "oh-my-opencode"

/**
 * 优先级标签列表
 * 按优先级顺序检查：latest > beta > next
 */
const PRIORITIZED_TAGS = ["latest", "beta", "next"] as const

/**
 * 获取插件名称和版本标签
 * 
 * 尝试将版本号映射到对应的标签（latest/beta/next），
 * 如果找不到匹配的标签，则直接使用版本号。
 * 
 * 例如：
 * - 3.0.0 -> oh-my-opencode@latest
 * - 3.1.0-beta.1 -> oh-my-opencode@beta
 * - 1.2.3 -> oh-my-opencode@1.2.3
 * 
 * @param currentVersion - 当前版本号
 * @returns 插件名称@标签 或 插件名称@版本号
 */
export async function getPluginNameWithVersion(currentVersion: string): Promise<string> {
  const distTags = await fetchNpmDistTags(PACKAGE_NAME)

  if (distTags) {
    const allTags = new Set([...PRIORITIZED_TAGS, ...Object.keys(distTags)])
    for (const tag of allTags) {
      if (distTags[tag] === currentVersion) {
        return `${PACKAGE_NAME}@${tag}`
      }
    }
  }

  return `${PACKAGE_NAME}@${currentVersion}`
}

/**
 * 配置文件格式类型
 * - json: 标准JSON格式
 * - jsonc: 支持注释和尾随逗号的JSON格式
 * - none: 配置文件不存在
 */
type ConfigFormat = "json" | "jsonc" | "none"

/**
 * OpenCode配置文件接口
 * 包含插件列表和其他配置项
 */
interface OpenCodeConfig {
  plugin?: string[]
  [key: string]: unknown
}

/**
 * 检测配置文件格式
 * 
 * 按优先级检查：
 * 1. opencode.jsonc (支持注释，推荐)
 * 2. opencode.json (标准JSON)
 * 3. none (不存在，返回json路径用于创建)
 * 
 * @returns 配置格式和文件路径
 */
export function detectConfigFormat(): { format: ConfigFormat; path: string } {
  const configJsonc = getConfigJsonc()
  const configJson = getConfigJson()

  if (existsSync(configJsonc)) {
    return { format: "jsonc", path: configJsonc }
  }
  if (existsSync(configJson)) {
    return { format: "json", path: configJson }
  }
  return { format: "none", path: configJson }
}

/**
 * 配置解析结果
 * 包含解析后的配置对象或错误消息
 */
interface ParseConfigResult {
  config: OpenCodeConfig | null
  error?: string
}

/**
 * 检查字符串是否为空或仅包含空白字符
 */
function isEmptyOrWhitespace(content: string): boolean {
  return content.trim().length === 0
}

/**
 * 解析配置文件（简化版）
 * 
 * @param path - 配置文件路径
 * @param _isJsonc - 是否为JSONC格式（已废弃，保留用于兼容）
 * @returns 配置对象，失败返回null
 */
function parseConfig(path: string, _isJsonc: boolean): OpenCodeConfig | null {
  const result = parseConfigWithError(path)
  return result.config
}

/**
 * 解析配置文件并返回详细错误
 * 
 * 验证步骤：
 * 1. 检查文件大小（空文件）
 * 2. 检查文件内容（仅空白字符）
 * 3. 解析JSONC（支持注释和尾随逗号）
 * 4. 验证类型（必须是对象，不能是数组或基本类型）
 * 
 * @param path - 配置文件路径
 * @returns 解析结果，包含配置对象或错误消息
 */
function parseConfigWithError(path: string): ParseConfigResult {
  try {
    const stat = statSync(path)
    if (stat.size === 0) {
      return { config: null, error: `Config file is empty: ${path}. Delete it or add valid JSON content.` }
    }

    const content = readFileSync(path, "utf-8")

    if (isEmptyOrWhitespace(content)) {
      return { config: null, error: `Config file contains only whitespace: ${path}. Delete it or add valid JSON content.` }
    }

    const config = parseJsonc<OpenCodeConfig>(content)

    if (config === null || config === undefined) {
      return { config: null, error: `Config file parsed to null/undefined: ${path}. Ensure it contains valid JSON.` }
    }

    if (typeof config !== "object" || Array.isArray(config)) {
      return { config: null, error: `Config file must contain a JSON object, not ${Array.isArray(config) ? "an array" : typeof config}: ${path}` }
    }

    return { config }
  } catch (err) {
    return { config: null, error: formatErrorWithSuggestion(err, `parse config file ${path}`) }
  }
}

/**
 * 确保配置目录存在
 * 如果目录不存在，递归创建所有父目录
 */
function ensureConfigDir(): void {
  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
}

/**
 * 将oh-my-opencode插件添加到OpenCode配置
 * 
 * 流程：
 * 1. 确保配置目录存在
 * 2. 检测配置格式（jsonc/json/none）
 * 3. 获取插件名称和版本标签（如oh-my-opencode@latest）
 * 4. 根据配置格式处理：
 *    - none: 创建新配置文件
 *    - json/jsonc: 解析现有配置，更新plugin数组
 * 5. 对于jsonc格式，保留原有格式和注释
 * 
 * 插件更新策略：
 * - 如果插件已存在且版本相同：跳过
 * - 如果插件已存在但版本不同：更新版本
 * - 如果插件不存在：添加到数组末尾
 * 
 * @param currentVersion - 当前插件版本号
 * @returns 操作结果，包含成功状态和配置路径
 */
export async function addPluginToOpenCodeConfig(currentVersion: string): Promise<ConfigMergeResult> {
  try {
    ensureConfigDir()
  } catch (err) {
    return { success: false, configPath: getConfigDir(), error: formatErrorWithSuggestion(err, "create config directory") }
  }

  const { format, path } = detectConfigFormat()
  const pluginEntry = await getPluginNameWithVersion(currentVersion)

  try {
    if (format === "none") {
      const config: OpenCodeConfig = { plugin: [pluginEntry] }
      writeFileSync(path, JSON.stringify(config, null, 2) + "\n")
      return { success: true, configPath: path }
    }

    const parseResult = parseConfigWithError(path)
    if (!parseResult.config) {
      return { success: false, configPath: path, error: parseResult.error ?? "Failed to parse config file" }
    }

    const config = parseResult.config
    const plugins = config.plugin ?? []
    const existingIndex = plugins.findIndex((p) => p === PACKAGE_NAME || p.startsWith(`${PACKAGE_NAME}@`))

    if (existingIndex !== -1) {
      if (plugins[existingIndex] === pluginEntry) {
        return { success: true, configPath: path }
      }
      plugins[existingIndex] = pluginEntry
    } else {
      plugins.push(pluginEntry)
    }

    config.plugin = plugins

    if (format === "jsonc") {
      const content = readFileSync(path, "utf-8")
      const pluginArrayRegex = /"plugin"\s*:\s*\[([\s\S]*?)\]/
      const match = content.match(pluginArrayRegex)

      if (match) {
        const formattedPlugins = plugins.map((p) => `"${p}"`).join(",\n    ")
        const newContent = content.replace(pluginArrayRegex, `"plugin": [\n    ${formattedPlugins}\n  ]`)
        writeFileSync(path, newContent)
      } else {
        const newContent = content.replace(/^(\s*\{)/, `$1\n  "plugin": ["${pluginEntry}"],`)
        writeFileSync(path, newContent)
      }
    } else {
      writeFileSync(path, JSON.stringify(config, null, 2) + "\n")
    }

    return { success: true, configPath: path }
  } catch (err) {
    return { success: false, configPath: path, error: formatErrorWithSuggestion(err, "update opencode config") }
  }
}

/**
 * 深度合并配置对象
 * 
 * 合并规则：
 * - 对象：递归合并
 * - 数组：直接覆盖（不合并元素）
 * - 基本类型：直接覆盖
 * - undefined：保留target的值
 * - null：覆盖为null
 * 
 * 示例：
 * ```typescript
 * deepMerge(
 *   { a: { b: 1, c: 2 }, d: [1, 2] },
 *   { a: { b: 3 }, d: [3] }
 * )
 * // => { a: { b: 3, c: 2 }, d: [3] }
 * ```
 * 
 * @param target - 目标对象（基础配置）
 * @param source - 源对象（覆盖配置）
 * @returns 合并后的新对象
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key]
    const targetValue = result[key]

    if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T]
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T]
    }
  }

  return result
}

/**
 * 生成oh-my-opencode配置
 * 
 * 根据安装配置生成模型回退配置。
 * 配置包含各个agent的模型选择和回退策略。
 * 
 * @param installConfig - 安装配置（包含订阅信息）
 * @returns 生成的配置对象
 */
export function generateOmoConfig(installConfig: InstallConfig): Record<string, unknown> {
  return generateModelConfig(installConfig)
}

/**
 * 写入oh-my-opencode配置文件
 * 
 * 流程：
 * 1. 确保配置目录存在
 * 2. 生成新配置
 * 3. 如果配置文件已存在，与现有配置深度合并
 * 4. 写入合并后的配置
 * 
 * 合并策略：
 * - 空文件或无效JSON：直接覆盖
 * - 有效配置：深度合并（保留用户自定义配置）
 * 
 * @param installConfig - 安装配置
 * @returns 操作结果，包含成功状态和配置路径
 */
export function writeOmoConfig(installConfig: InstallConfig): ConfigMergeResult {
  try {
    ensureConfigDir()
  } catch (err) {
    return { success: false, configPath: getConfigDir(), error: formatErrorWithSuggestion(err, "create config directory") }
  }

  const omoConfigPath = getOmoConfig()

  try {
    const newConfig = generateOmoConfig(installConfig)

    if (existsSync(omoConfigPath)) {
      try {
        const stat = statSync(omoConfigPath)
        const content = readFileSync(omoConfigPath, "utf-8")

        if (stat.size === 0 || isEmptyOrWhitespace(content)) {
          writeFileSync(omoConfigPath, JSON.stringify(newConfig, null, 2) + "\n")
          return { success: true, configPath: omoConfigPath }
        }

        const existing = parseJsonc<Record<string, unknown>>(content)
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
          writeFileSync(omoConfigPath, JSON.stringify(newConfig, null, 2) + "\n")
          return { success: true, configPath: omoConfigPath }
        }

        const merged = deepMerge(existing, newConfig)
        writeFileSync(omoConfigPath, JSON.stringify(merged, null, 2) + "\n")
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) {
          writeFileSync(omoConfigPath, JSON.stringify(newConfig, null, 2) + "\n")
          return { success: true, configPath: omoConfigPath }
        }
        throw parseErr
      }
    } else {
      writeFileSync(omoConfigPath, JSON.stringify(newConfig, null, 2) + "\n")
    }

    return { success: true, configPath: omoConfigPath }
  } catch (err) {
    return { success: false, configPath: omoConfigPath, error: formatErrorWithSuggestion(err, "write oh-my-opencode config") }
  }
}

/**
 * OpenCode二进制检测结果
 */
interface OpenCodeBinaryResult {
  binary: OpenCodeBinaryType
  version: string
}

/**
 * 查找OpenCode二进制文件并获取版本
 * 
 * 按优先级检查：
 * 1. opencode (CLI版本)
 * 2. opencode-desktop (桌面应用版本)
 * 
 * 找到第一个可用的二进制后，初始化配置上下文。
 * 
 * @returns 二进制类型和版本号，未找到返回null
 */
async function findOpenCodeBinaryWithVersion(): Promise<OpenCodeBinaryResult | null> {
  for (const binary of OPENCODE_BINARIES) {
    try {
      const proc = Bun.spawn([binary, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const output = await new Response(proc.stdout).text()
      await proc.exited
      if (proc.exitCode === 0) {
        const version = output.trim()
        initConfigContext(binary, version)
        return { binary, version }
      }
    } catch {
      continue
    }
  }
  return null
}

/**
 * 检查OpenCode是否已安装
 * @returns true表示已安装
 */
export async function isOpenCodeInstalled(): Promise<boolean> {
  const result = await findOpenCodeBinaryWithVersion()
  return result !== null
}

/**
 * 获取OpenCode版本号
 * @returns 版本号，未安装返回null
 */
export async function getOpenCodeVersion(): Promise<string | null> {
  const result = await findOpenCodeBinaryWithVersion()
  return result?.version ?? null
}

/**
 * 添加认证插件到OpenCode配置
 * 
 * 根据安装配置添加对应的认证插件：
 * - hasGemini: 添加opencode-antigravity-auth（Gemini认证）
 * 
 * 流程：
 * 1. 确保配置目录存在
 * 2. 检测并解析现有配置
 * 3. 获取认证插件的最新版本
 * 4. 添加到plugin数组（如果尚未存在）
 * 5. 写入配置文件
 * 
 * @param config - 安装配置
 * @returns 操作结果，包含成功状态和配置路径
 */
export async function addAuthPlugins(config: InstallConfig): Promise<ConfigMergeResult> {
  try {
    ensureConfigDir()
  } catch (err) {
    return { success: false, configPath: getConfigDir(), error: formatErrorWithSuggestion(err, "create config directory") }
  }

  const { format, path } = detectConfigFormat()

  try {
    let existingConfig: OpenCodeConfig | null = null
    if (format !== "none") {
      const parseResult = parseConfigWithError(path)
      if (parseResult.error && !parseResult.config) {
        existingConfig = {}
      } else {
        existingConfig = parseResult.config
      }
    }

    const plugins: string[] = existingConfig?.plugin ?? []

    if (config.hasGemini) {
      const version = await fetchLatestVersion("opencode-antigravity-auth")
      const pluginEntry = version ? `opencode-antigravity-auth@${version}` : "opencode-antigravity-auth"
      if (!plugins.some((p) => p.startsWith("opencode-antigravity-auth"))) {
        plugins.push(pluginEntry)
      }
    }



    const newConfig = { ...(existingConfig ?? {}), plugin: plugins }
    writeFileSync(path, JSON.stringify(newConfig, null, 2) + "\n")
    return { success: true, configPath: path }
  } catch (err) {
    return { success: false, configPath: path, error: formatErrorWithSuggestion(err, "add auth plugins to config") }
  }
}

/**
 * Bun安装结果
 */
export interface BunInstallResult {
  success: boolean
  timedOut?: boolean
  error?: string
}

/**
 * 运行bun install（简化版）
 * @returns true表示安装成功
 */
export async function runBunInstall(): Promise<boolean> {
  const result = await runBunInstallWithDetails()
  return result.success
}

/**
 * 运行bun install并返回详细结果
 * 
 * 流程：
 * 1. 在配置目录执行`bun install`
 * 2. 设置60秒超时，避免网络问题导致挂起
 * 3. 超时后尝试终止进程
 * 4. 返回详细的成功/失败信息
 * 
 * 错误处理：
 * - 超时：返回timedOut=true和手动安装提示
 * - 非零退出码：返回stderr内容
 * - 异常：返回错误消息和bun安装提示
 * 
 * @returns 安装结果，包含成功状态、超时标志和错误消息
 */
export async function runBunInstallWithDetails(): Promise<BunInstallResult> {
  try {
    const proc = Bun.spawn(["bun", "install"], {
      cwd: getConfigDir(),
      stdout: "pipe",
      stderr: "pipe",
    })

    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), BUN_INSTALL_TIMEOUT_MS)
    )

    const exitPromise = proc.exited.then(() => "completed" as const)

    const result = await Promise.race([exitPromise, timeoutPromise])

    if (result === "timeout") {
      try {
        proc.kill()
      } catch {
        /* intentionally empty - process may have already exited */
      }
      return {
        success: false,
        timedOut: true,
        error: `bun install timed out after ${BUN_INSTALL_TIMEOUT_SECONDS} seconds. Try running manually: cd ~/.config/opencode && bun i`,
      }
    }

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      return {
        success: false,
        error: stderr.trim() || `bun install failed with exit code ${proc.exitCode}`,
      }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `bun install failed: ${message}. Is bun installed? Try: curl -fsSL https://bun.sh/install | bash`,
    }
  }
}

/**
 * Antigravity Provider配置
 * 
 * ## 重要说明
 * 模型名称必须使用`antigravity-`前缀以确保稳定性。
 * 
 * ## 版本变化
 * 自opencode-antigravity-auth v1.3.0起，模型使用变体系统：
 * - `antigravity-gemini-3-pro` 变体: low, high
 * - `antigravity-gemini-3-flash` 变体: minimal, low, medium, high
 * 
 * 旧的层级后缀命名（如`antigravity-gemini-3-pro-high`）仍然有效，
 * 但推荐使用变体方式。
 * 
 * ## 变体系统
 * 变体允许在同一模型下配置不同的思考级别或预算：
 * - thinkingLevel: 控制模型的思考深度
 * - thinkingConfig: 配置思考预算（token数量）
 * 
 * @see https://github.com/NoeFabris/opencode-antigravity-auth#models
 */
export const ANTIGRAVITY_PROVIDER_CONFIG = {
  google: {
    name: "Google",
    models: {
      "antigravity-gemini-3-pro": {
        name: "Gemini 3 Pro (Antigravity)",
        limit: { context: 1048576, output: 65535 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        variants: {
          low: { thinkingLevel: "low" },
          high: { thinkingLevel: "high" },
        },
      },
      "antigravity-gemini-3-flash": {
        name: "Gemini 3 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        variants: {
          minimal: { thinkingLevel: "minimal" },
          low: { thinkingLevel: "low" },
          medium: { thinkingLevel: "medium" },
          high: { thinkingLevel: "high" },
        },
      },
      "antigravity-claude-sonnet-4-5": {
        name: "Claude Sonnet 4.5 (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
      },
      "antigravity-claude-sonnet-4-5-thinking": {
        name: "Claude Sonnet 4.5 Thinking (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        variants: {
          low: { thinkingConfig: { thinkingBudget: 8192 } },
          max: { thinkingConfig: { thinkingBudget: 32768 } },
        },
      },
      "antigravity-claude-opus-4-5-thinking": {
        name: "Claude Opus 4.5 Thinking (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        variants: {
          low: { thinkingConfig: { thinkingBudget: 8192 } },
          max: { thinkingConfig: { thinkingBudget: 32768 } },
        },
      },
    },
  },
}



/**
 * 添加Provider配置到OpenCode配置
 * 
 * 根据安装配置添加对应的Provider：
 * - hasGemini: 添加Google Provider配置（Antigravity）
 * 
 * Provider配置包含：
 * - 模型列表和限制
 * - 模态支持（文本、图片、PDF）
 * - 变体配置（思考级别、预算）
 * 
 * @param config - 安装配置
 * @returns 操作结果，包含成功状态和配置路径
 */
export function addProviderConfig(config: InstallConfig): ConfigMergeResult {
  try {
    ensureConfigDir()
  } catch (err) {
    return { success: false, configPath: getConfigDir(), error: formatErrorWithSuggestion(err, "create config directory") }
  }

  const { format, path } = detectConfigFormat()

  try {
    let existingConfig: OpenCodeConfig | null = null
    if (format !== "none") {
      const parseResult = parseConfigWithError(path)
      if (parseResult.error && !parseResult.config) {
        existingConfig = {}
      } else {
        existingConfig = parseResult.config
      }
    }

    const newConfig = { ...(existingConfig ?? {}) }

    const providers = (newConfig.provider ?? {}) as Record<string, unknown>

    if (config.hasGemini) {
      providers.google = ANTIGRAVITY_PROVIDER_CONFIG.google
    }

    if (Object.keys(providers).length > 0) {
      newConfig.provider = providers
    }

    writeFileSync(path, JSON.stringify(newConfig, null, 2) + "\n")
    return { success: true, configPath: path }
  } catch (err) {
    return { success: false, configPath: path, error: formatErrorWithSuggestion(err, "add provider config") }
  }
}

/**
 * 从oh-my-opencode配置检测Provider使用情况
 * 
 * 通过搜索配置中的模型前缀来检测：
 * - "openai/": OpenAI模型
 * - "opencode/": OpenCode Zen模型
 * - "zai-coding-plan/": Z.ai模型
 * 
 * 默认值（配置不存在或无效时）：
 * - hasOpenAI: true
 * - hasOpencodeZen: true
 * - hasZaiCodingPlan: false
 * 
 * @returns Provider使用情况
 */
function detectProvidersFromOmoConfig(): { hasOpenAI: boolean; hasOpencodeZen: boolean; hasZaiCodingPlan: boolean } {
  const omoConfigPath = getOmoConfig()
  if (!existsSync(omoConfigPath)) {
    return { hasOpenAI: true, hasOpencodeZen: true, hasZaiCodingPlan: false }
  }

  try {
    const content = readFileSync(omoConfigPath, "utf-8")
    const omoConfig = parseJsonc<Record<string, unknown>>(content)
    if (!omoConfig || typeof omoConfig !== "object") {
      return { hasOpenAI: true, hasOpencodeZen: true, hasZaiCodingPlan: false }
    }

    const configStr = JSON.stringify(omoConfig)
    const hasOpenAI = configStr.includes('"openai/')
    const hasOpencodeZen = configStr.includes('"opencode/')
    const hasZaiCodingPlan = configStr.includes('"zai-coding-plan/')

    return { hasOpenAI, hasOpencodeZen, hasZaiCodingPlan }
  } catch {
    return { hasOpenAI: true, hasOpencodeZen: true, hasZaiCodingPlan: false }
  }
}

/**
 * 检测当前配置状态
 * 
 * 检测内容：
 * 1. oh-my-opencode是否已安装（检查plugin数组）
 * 2. Gemini认证插件是否已安装
 * 3. 从oh-my-opencode配置检测Provider使用情况
 * 
 * 默认值（未安装时）：
 * - isInstalled: false
 * - hasClaude: true
 * - isMax20: true
 * - hasOpenAI: true
 * - hasGemini: false
 * - hasCopilot: false
 * - hasOpencodeZen: true
 * - hasZaiCodingPlan: false
 * 
 * @returns 当前配置状态
 */
export function detectCurrentConfig(): DetectedConfig {
  const result: DetectedConfig = {
    isInstalled: false,
    hasClaude: true,
    isMax20: true,
    hasOpenAI: true,
    hasGemini: false,
    hasCopilot: false,
    hasOpencodeZen: true,
    hasZaiCodingPlan: false,
  }

  const { format, path } = detectConfigFormat()
  if (format === "none") {
    return result
  }

  const parseResult = parseConfigWithError(path)
  if (!parseResult.config) {
    return result
  }

  const openCodeConfig = parseResult.config
  const plugins = openCodeConfig.plugin ?? []
  result.isInstalled = plugins.some((p) => p.startsWith("oh-my-opencode"))

  if (!result.isInstalled) {
    return result
  }

  // Gemini auth plugin detection still works via plugin presence
  result.hasGemini = plugins.some((p) => p.startsWith("opencode-antigravity-auth"))

  const { hasOpenAI, hasOpencodeZen, hasZaiCodingPlan } = detectProvidersFromOmoConfig()
  result.hasOpenAI = hasOpenAI
  result.hasOpencodeZen = hasOpencodeZen
  result.hasZaiCodingPlan = hasZaiCodingPlan

  return result
}
