/**
 * @fileoverview OpenCode 技能加载器
 * 
 * 技能聚合系统，支持从多个目录加载技能并按优先级合并：
 * 1. 项目技能: .opencode/skills/ (最高优先级)
 * 2. 用户技能: ~/.config/opencode/skills/
 * 3. Claude技能: ~/.claude/skills/
 * 4. 内置技能: builtin-skills (最低优先级)
 * 
 * @module features/opencode-skill-loader
 */

export * from "./types"
export * from "./loader"
export * from "./merger"
export * from "./skill-content"
