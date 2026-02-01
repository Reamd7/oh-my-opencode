/**
 * delegate_task 工具的参数接口
 * 
 * ## 参数说明
 * 
 * ### 必需参数
 * - **description**: 任务简短描述（3-5 个词）
 * - **prompt**: 完整的任务提示词（详细说明任务要求）
 * - **run_in_background**: 执行模式
 *   - `false`: 同步执行，等待结果
 *   - `true`: 异步执行，立即返回 task_id
 * - **load_skills**: 要加载的技能列表
 *   - 例如：`["playwright", "git-master"]`
 *   - 可以传空数组 `[]`，但强烈建议指定相关技能
 * 
 * ### 路由参数（二选一）
 * - **category**: Category 名称（如 "visual-engineering", "ultrabrain"）
 *   - 使用 category 时，系统自动选择 sisyphus-junior 代理并配置对应模型
 * - **subagent_type**: 直接指定代理名称（如 "oracle", "explore"）
 *   - 直接调用特定代理，不经过 category 路由
 * 
 * ### 可选参数
 * - **session_id**: 已有会话 ID，用于继续对话
 *   - 保持完整上下文，节省 token
 *   - 适用于任务失败后修复或追加问题
 * - **command**: 触发此任务的命令名称（用于追踪）
 */
export interface DelegateTaskArgs {
  description: string
  prompt: string
  category?: string
  subagent_type?: string
  run_in_background: boolean
  session_id?: string
  command?: string
  load_skills: string[]
}
