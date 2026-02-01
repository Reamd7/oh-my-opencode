/**
 * Shell 环境工具模块
 * 
 * 用途：
 * - 跨平台 shell 命令执行（Unix/PowerShell/cmd.exe）
 * - 环境变量安全转义和注入
 * - 支持 Bash 工具在不同 shell 环境中正确执行命令
 * 
 * 使用场景：
 * - 在 Windows 上使用 PowerShell 或 cmd.exe 执行命令
 * - 在 Unix/Linux/macOS 上使用 bash/zsh 等执行命令
 * - 需要设置临时环境变量时安全地转义特殊字符
 */

/**
 * Shell 类型枚举
 * - unix: bash, zsh, sh 等 Unix shell
 * - powershell: Windows PowerShell
 * - cmd: Windows cmd.exe
 */
export type ShellType = "unix" | "powershell" | "cmd"

/**
 * 检测当前 shell 类型
 * 
 * 检测优先级：
 * 1. PSModulePath 环境变量存在 → PowerShell
 * 2. SHELL 环境变量存在 → Unix shell
 * 3. 平台回退 → win32: cmd, 其他: unix
 * 
 * 为什么需要检测：
 * - 不同 shell 的命令语法和转义规则完全不同
 * - 环境变量设置方式不同（export vs $env: vs set）
 * - 引号和特殊字符转义规则不同
 */
export function detectShellType(): ShellType {
  if (process.env.PSModulePath) {
    return "powershell"
  }

  if (process.env.SHELL) {
    return "unix"
  }

  return process.platform === "win32" ? "cmd" : "unix"
}

/**
 * 对值进行 shell 转义，用于环境变量赋值
 * 
 * 转义规则：
 * - Unix: 包含特殊字符时用单引号包裹，单引号本身转义为 '\''
 * - PowerShell: 用单引号包裹，单引号转义为 ''
 * - cmd.exe: 用双引号包裹，% 转义为 %%，" 转义为 ""
 * 
 * 安全性：
 * - 防止命令注入攻击
 * - 确保包含空格、引号等特殊字符的值正确传递
 */
export function shellEscape(value: string, shellType: ShellType): string {
  if (value === "") {
    return shellType === "cmd" ? '""' : "''"
  }

  switch (shellType) {
    case "unix":
      if (/[^a-zA-Z0-9_\-.:\/]/.test(value)) {
        return `'${value.replace(/'/g, "'\\''")}'`
      }
      return value

    case "powershell":
      return `'${value.replace(/'/g, "''")}'`

    case "cmd":
      return `"${value.replace(/%/g, '%%').replace(/"/g, '""')}"`

    default:
      return value
  }
}

/**
 * 构建环境变量前缀命令
 * 
 * 生成的命令格式：
 * - Unix: "export VAR1=val1 VAR2=val2; actual_command"
 * - PowerShell: "$env:VAR1='val1'; $env:VAR2='val2'; actual_command"
 * - cmd.exe: "set VAR1=\"val1\" && set VAR2=\"val2\" && actual_command"
 * 
 * 使用场景：
 * - Bash 工具需要临时设置环境变量
 * - 为子进程注入配置（API keys、路径等）
 * - 跨平台命令执行时保持一致的环境变量设置方式
 * 
 * @example
 * ```ts
 * // Unix
 * buildEnvPrefix({ API_KEY: "secret" }, "unix")
 * // => "export API_KEY='secret';"
 * 
 * // PowerShell
 * buildEnvPrefix({ API_KEY: "secret" }, "powershell")
 * // => "$env:API_KEY='secret';"
 * 
 * // cmd.exe
 * buildEnvPrefix({ API_KEY: "secret" }, "cmd")
 * // => "set API_KEY=\"secret\" &&"
 * ```
 */
export function buildEnvPrefix(
  env: Record<string, string>,
  shellType: ShellType
): string {
  const entries = Object.entries(env)
  
  if (entries.length === 0) {
    return ""
  }

  switch (shellType) {
    case "unix": {
      const assignments = entries
        .map(([key, value]) => `${key}=${shellEscape(value, shellType)}`)
        .join(" ")
      return `export ${assignments};`
    }

    case "powershell": {
      const assignments = entries
        .map(([key, value]) => `$env:${key}=${shellEscape(value, shellType)}`)
        .join("; ")
      return `${assignments};`
    }

    case "cmd": {
      const assignments = entries
        .map(([key, value]) => `set ${key}=${shellEscape(value, shellType)}`)
        .join(" && ")
      return `${assignments} &&`
    }

    default:
      return ""
  }
}
