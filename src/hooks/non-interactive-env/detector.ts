/**
 * 检测当前运行环境是否为非交互环境
 * 
 * ## 功能说明
 * 判断代码是否运行在CI/CD、自动化脚本等无法接受用户输入的环境中。
 * 这对于防止git等工具弹出编辑器或分页器导致进程挂起至关重要。
 * 
 * ## 检测条件（满足任一即为非交互环境）
 * 1. **CI环境变量**: CI=true 或 CI=1
 * 2. **OpenCode标志**: OPENCODE_RUN=true 或 OPENCODE_NON_INTERACTIVE=true
 * 3. **GitHub Actions**: GITHUB_ACTIONS=true
 * 4. **无TTY**: process.stdout.isTTY !== true（标准输出未连接到终端）
 * 
 * ## 使用场景
 * - 在执行git命令前检测环境，决定是否需要设置GIT_EDITOR=true等环境变量
 * - 在CI/CD流水线中自动禁用交互式提示
 * - 防止自动化脚本因等待用户输入而挂起
 * 
 * ## 返回值
 * @returns {boolean} true表示非交互环境，false表示交互环境（有TTY且非CI）
 * 
 * @example
 * ```typescript
 * if (isNonInteractive()) {
 *   // 在非交互环境中，为git命令添加环境变量
 *   process.env.GIT_EDITOR = 'true'
 *   process.env.GIT_PAGER = 'cat'
 * }
 * ```
 */
export function isNonInteractive(): boolean {
  // CI环境
  if (process.env.CI === "true" || process.env.CI === "1") {
    return true
  }

  // OpenCode非交互模式
  if (process.env.OPENCODE_RUN === "true" || process.env.OPENCODE_NON_INTERACTIVE === "true") {
    return true
  }

  // GitHub Actions
  if (process.env.GITHUB_ACTIONS === "true") {
    return true
  }

  // 无TTY
  if (process.stdout.isTTY !== true) {
    return true
  }

  return false
}
