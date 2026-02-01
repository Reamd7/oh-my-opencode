/**
 * @fileoverview 内置技能系统
 * 
 * 提供核心技能定义，包括：
 * - playwright: 浏览器自动化（验证、测试、截图）
 * - git-master: Git操作专家（原子提交、rebase、历史搜索）
 * - frontend-ui-ux: 前端UI/UX设计和实现
 * - typescript-programmer: TypeScript编程专家
 * 
 * @module features/builtin-skills
 */

export * from "./types"
export { createBuiltinSkills, type CreateBuiltinSkillsOptions } from "./skills"
