/**
 * @fileoverview Sisyphus任务存储系统
 * 
 * 任务持久化和状态管理，支持任务依赖关系：
 * - 任务状态: pending/in_progress/completed
 * - 依赖管理: blocks/blockedBy关系
 * - 原子操作: 确保任务数据一致性
 * 
 * ## 存储位置
 * - 默认: .sisyphus/tasks/{listId}/{taskId}.json
 * - Claude Code兼容: ~/.cache/claude-code/tasks/
 * 
 * ## 核心功能
 * - 任务CRUD: 创建、读取、更新、删除
 * - 依赖追踪: 自动维护任务依赖图
 * - 元数据支持: 自定义任务属性
 * 
 * @module features/sisyphus-tasks
 */

export * from "./types"
export * from "./storage"
