/**
 * 权限系统工具模块（OpenCode 1.1.1+）
 * 
 * 用途：
 * - 控制 agent 可以使用哪些工具
 * - 实现工具级别的安全隔离
 * - 支持白名单和黑名单两种模式
 * 
 * 使用场景：
 * - 限制探索型 agent（explore、librarian）不能修改文件
 * - 限制咨询型 agent（oracle）不能执行代码
 * - 为不同 agent 配置不同的工具访问权限
 * 
 * 格式兼容性：
 * - 仅支持 OpenCode 1.1.1+ 的新权限格式
 * - 提供从旧版 tools 格式的迁移工具
 */

/**
 * 权限值类型
 * - ask: 每次使用前询问用户
 * - allow: 允许使用
 * - deny: 拒绝使用
 */
export type PermissionValue = "ask" | "allow" | "deny"

/**
 * 权限格式接口（OpenCode 1.1.1+）
 * 使用 permission 字段替代旧版的 tools 字段
 */
export interface PermissionFormat {
  permission: Record<string, PermissionValue>
}

/**
 * 创建工具黑名单限制
 * 
 * 工作原理：
 * - 指定的工具将被拒绝使用
 * - 未指定的工具默认允许
 * 
 * 使用场景：
 * - 禁止 agent 使用某些危险工具（如 write、edit）
 * - 限制 agent 不能调用其他 agent（delegate_task）
 */
export function createAgentToolRestrictions(
  denyTools: string[]
): PermissionFormat {
  return {
    permission: Object.fromEntries(
      denyTools.map((tool) => [tool, "deny" as const])
    ),
  }
}

/**
 * 创建工具白名单限制
 * 
 * 工作原理：
 * - 使用 "*": "deny" 默认拒绝所有工具
 * - 仅允许列表中的工具
 * 
 * 使用场景：
 * - 严格限制 agent 只能使用特定工具
 * - 例如：multimodal-looker 只能使用 read 工具
 * 
 * 安全性：
 * - 白名单模式比黑名单更安全
 * - 新增的工具默认被拒绝，不会意外获得权限
 */
export function createAgentToolAllowlist(
  allowTools: string[]
): PermissionFormat {
  return {
    permission: {
      "*": "deny" as const,
      ...Object.fromEntries(
        allowTools.map((tool) => [tool, "allow" as const])
      ),
    },
  }
}

/**
 * 将旧版 tools 格式转换为新版 permission 格式
 * 
 * 转换规则：
 * - true → "allow"
 * - false → "deny"
 * 
 * 用于迁移用户配置
 */
export function migrateToolsToPermission(
  tools: Record<string, boolean>
): Record<string, PermissionValue> {
  return Object.fromEntries(
    Object.entries(tools).map(([key, value]) => [
      key,
      value ? ("allow" as const) : ("deny" as const),
    ])
  )
}

/**
 * 迁移 agent 配置从旧版格式到新版格式
 * 
 * 迁移逻辑：
 * 1. 如果存在 tools 字段，转换为 permission 格式
 * 2. 保留现有的 permission 配置（优先级更高）
 * 3. 删除旧的 tools 字段
 * 
 * 向后兼容性：
 * - 允许用户从旧版 OpenCode 平滑升级
 * - 自动转换配置文件格式
 */
export function migrateAgentConfig(
  config: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...config }

  if (result.tools && typeof result.tools === "object") {
    const existingPermission =
      (result.permission as Record<string, PermissionValue>) || {}
    const migratedPermission = migrateToolsToPermission(
      result.tools as Record<string, boolean>
    )
    result.permission = { ...migratedPermission, ...existingPermission }
    delete result.tools
  }

  return result
}
