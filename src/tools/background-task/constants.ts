/**
 * background_task 工具描述
 * 在后台运行代理任务，立即返回task_id，完成时通知
 */
export const BACKGROUND_TASK_DESCRIPTION = `Run agent task in background. Returns task_id immediately; notifies on completion.

Use \`background_output\` to get results. Prompts MUST be in English.`

/**
 * background_output 工具描述
 * 获取后台任务输出，系统会自动通知完成，很少需要block=true
 */
export const BACKGROUND_OUTPUT_DESCRIPTION = `Get output from background task. System notifies on completion, so block=true rarely needed.`

/**
 * background_cancel 工具描述
 * 取消运行中的后台任务，使用all=true可在最终回答前取消所有任务
 */
export const BACKGROUND_CANCEL_DESCRIPTION = `Cancel running background task(s). Use all=true to cancel ALL before final answer.`
