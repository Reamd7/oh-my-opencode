/**
 * Agent 工具限制配置模块
 * 
 * 用途：
 * - 为不同类型的 agent 配置工具访问权限
 * - 实现 agent 角色隔离和安全控制
 * - 防止 agent 执行超出其职责范围的操作
 * 
 * 格式说明：
 * - 用于 OpenCode SDK 的 session.prompt `tools` 参数
 * - true = 允许使用该工具
 * - false = 拒绝使用该工具
 * 
 * 设计原则：
 * - 探索型 agent（explore、librarian）：只读，不能修改代码
 * - 咨询型 agent（oracle）：可以读写，但不能调用其他 agent
 * - 多模态 agent（multimodal-looker）：只能读取文件
 * - 执行型 agent（sisyphus-junior）：可以执行但不能委托
 */

import { findCaseInsensitive } from "./case-insensitive"

/**
 * 探索型 agent 的工具黑名单
 * 
 * 限制理由：
 * - write/edit: 探索型 agent 只负责查找信息，不应修改代码
 * - task/delegate_task: 避免探索过程中产生副作用
 * - call_omo_agent: 防止无限递归调用
 */
const EXPLORATION_AGENT_DENYLIST: Record<string, boolean> = {
  write: false,
  edit: false,
  task: false,
  delegate_task: false,
  call_omo_agent: false,
}

/**
 * Agent 工具限制配置表
 * 
 * 各 agent 的权限设计：
 * 
 * explore/librarian（探索型）：
 * - 职责：快速搜索代码库、查找文档
 * - 限制：不能修改文件、不能调用其他 agent
 * 
 * oracle（咨询型）：
 * - 职责：提供架构建议、调试帮助
 * - 限制：不能修改文件、不能委托任务
 * 
 * multimodal-looker（多模态）：
 * - 职责：分析图片、PDF 等多媒体文件
 * - 限制：只能读取文件（白名单模式）
 * 
 * sisyphus-junior（执行型）：
 * - 职责：执行具体的编码任务
 * - 限制：不能委托任务（避免无限递归）
 */
const AGENT_RESTRICTIONS: Record<string, Record<string, boolean>> = {
  explore: EXPLORATION_AGENT_DENYLIST,

  librarian: EXPLORATION_AGENT_DENYLIST,

  oracle: {
    write: false,
    edit: false,
    task: false,
    delegate_task: false,
  },

  "multimodal-looker": {
    read: true,
  },

  "sisyphus-junior": {
    task: false,
    delegate_task: false,
  },
}

/**
 * 获取指定 agent 的工具限制配置
 * 
 * @param agentName - Agent 名称（不区分大小写）
 * @returns 工具限制配置，如果没有限制则返回空对象
 */
export function getAgentToolRestrictions(agentName: string): Record<string, boolean> {
  return findCaseInsensitive(AGENT_RESTRICTIONS, agentName) ?? {}
}

/**
 * 检查指定 agent 是否有工具限制
 * 
 * @param agentName - Agent 名称（不区分大小写）
 * @returns 如果有限制返回 true，否则返回 false
 */
export function hasAgentToolRestrictions(agentName: string): boolean {
  const restrictions = findCaseInsensitive(AGENT_RESTRICTIONS, agentName)
  return restrictions !== undefined && Object.keys(restrictions).length > 0
}
