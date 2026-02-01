/**
 * 配置加载错误管理工具
 * 
 * 用于收集和管理配置文件加载过程中的错误信息。
 * 采用全局状态管理，便于在插件初始化阶段收集所有错误。
 */

/** 配置加载错误信息 */
export type ConfigLoadError = {
  /** 配置文件路径 */
  path: string
  /** 错误描述 */
  error: string
}

let configLoadErrors: ConfigLoadError[] = []

/**
 * 获取所有配置加载错误
 */
export function getConfigLoadErrors(): ConfigLoadError[] {
  return configLoadErrors
}

/**
 * 清空配置加载错误列表
 */
export function clearConfigLoadErrors(): void {
  configLoadErrors = []
}

/**
 * 添加配置加载错误
 */
export function addConfigLoadError(error: ConfigLoadError): void {
  configLoadErrors.push(error)
}
