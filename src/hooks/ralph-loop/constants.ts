/**
 * Ralph Loop 常量配置
 * 
 * HOOK_NAME: 钩子名称（用于日志）
 * DEFAULT_STATE_FILE: 状态文件默认路径（相对于项目根目录）
 * COMPLETION_TAG_PATTERN: 完成标记正则（匹配 <promise>...</promise>）
 * DEFAULT_MAX_ITERATIONS: 默认最大迭代次数（防止无限循环）
 * DEFAULT_COMPLETION_PROMISE: 默认完成标记字符串
 */

export const HOOK_NAME = "ralph-loop"
export const DEFAULT_STATE_FILE = ".sisyphus/ralph-loop.local.md"
export const COMPLETION_TAG_PATTERN = /<promise>(.*?)<\/promise>/is
export const DEFAULT_MAX_ITERATIONS = 100
export const DEFAULT_COMPLETION_PROMISE = "DONE"
