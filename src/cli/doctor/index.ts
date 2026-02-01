/**
 * CLI诊断工具入口
 * 
 * ## 功能
 * 运行14+项健康检查，诊断OpenCode和oh-my-opencode的安装状态
 * 
 * ## 检查类别
 * - installation: OpenCode和插件安装检查
 * - configuration: 配置文件有效性和Zod验证
 * - authentication: Anthropic、OpenAI、Google认证
 * - dependencies: AST-Grep、Comment Checker、GitHub CLI
 * - tools: LSP和MCP工具可用性
 * - updates: 版本更新检查
 * 
 * ## 使用
 * ```bash
 * bunx oh-my-opencode doctor
 * bunx oh-my-opencode doctor --category=authentication
 * bunx oh-my-opencode doctor --json
 * ```
 * 
 * @param options - 诊断选项（类别过滤、JSON输出、详细模式）
 * @returns 退出码（0=成功，1=失败）
 */
import type { DoctorOptions } from "./types"
import { runDoctor } from "./runner"

export async function doctor(options: DoctorOptions = {}): Promise<number> {
  const result = await runDoctor(options)
  return result.exitCode
}

export * from "./types"
export { runDoctor } from "./runner"
export { formatJsonOutput } from "./formatter"
