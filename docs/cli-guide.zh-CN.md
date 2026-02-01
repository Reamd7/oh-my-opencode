# Oh-My-OpenCode CLI 指南

本文档提供使用 Oh-My-OpenCode CLI 工具的全面指南。

## 1. 概述

Oh-My-OpenCode 通过 `bunx oh-my-opencode` 命令提供 CLI 工具。CLI 支持各种功能，包括插件安装、环境诊断和会话执行。

```bash
# 基本执行（显示帮助）
bunx oh-my-opencode

# 或使用 npx 运行
npx oh-my-opencode
```

---

## 2. 可用命令

| 命令 | 描述 |
|---------|-------------|
| `install` | 交互式设置向导 |
| `doctor` | 环境诊断和健康检查 |
| `run` | OpenCode 会话运行器 |
| `auth` | Google Antigravity 身份验证管理 |
| `version` | 显示版本信息 |

---

## 3. `install` - 交互式设置向导

Oh-My-OpenCode 初始设置的交互式安装工具。提供基于 `@clack/prompts` 的精美 TUI（文本用户界面）。

### 用法

```bash
bunx oh-my-opencode install
```

### 安装过程

1. **提供商选择**：从 Claude、ChatGPT 或 Gemini 中选择您的 AI 提供商。
2. **API 密钥输入**：为所选提供商输入 API 密钥。
3. **配置文件创建**：生成 `opencode.json` 或 `oh-my-opencode.json` 文件。
4. **插件注册**：在 OpenCode 设置中自动注册 oh-my-opencode 插件。

### 选项

| 选项 | 描述 |
|--------|-------------|
| `--no-tui` | 在没有 TUI 的非交互模式下运行（适用于 CI/CD 环境） |
| `--verbose` | 显示详细日志 |

---

## 4. `doctor` - 环境诊断

诊断您的环境以确保 Oh-My-OpenCode 正常运行。执行 17+ 项健康检查。

### 用法

```bash
bunx oh-my-opencode doctor
```

### 诊断类别

| 类别 | 检查项目 |
|----------|-------------|
| **安装** | OpenCode 版本（>= 1.0.150）、插件注册状态 |
| **配置** | 配置文件有效性、JSONC 解析 |
| **身份验证** | Anthropic、OpenAI、Google API 密钥有效性 |
| **依赖** | Bun、Node.js、Git 安装状态 |
| **工具** | LSP 服务器状态、MCP 服务器状态 |
| **更新** | 最新版本检查 |

### 选项

| 选项 | 描述 |
|--------|-------------|
| `--category <name>` | 仅检查特定类别（例如，`--category authentication`） |
| `--json` | 以 JSON 格式输出结果 |
| `--verbose` | 包含详细信息 |

### 示例输出

```
oh-my-opencode doctor

┌──────────────────────────────────────────────────┐
│  Oh-My-OpenCode Doctor                           │
└──────────────────────────────────────────────────┘

安装
  ✓ OpenCode 版本：1.0.155（>= 1.0.150）
  ✓ 插件已在 opencode.json 中注册

配置
  ✓ oh-my-opencode.json 有效
  ⚠ categories.visual-engineering：使用默认模型

身份验证
  ✓ Anthropic API 密钥已配置
  ✓ OpenAI API 密钥已配置
  ✗ 未找到 Google API 密钥

依赖
  ✓ Bun 1.2.5 已安装
  ✓ Node.js 22.0.0 已安装
  ✓ Git 2.45.0 已安装

摘要：10 通过，1 警告，1 失败
```

---

## 5. `run` - OpenCode 会话运行器

执行 OpenCode 会话并监控任务完成。

### 用法

```bash
bunx oh-my-opencode run [提示]
```

### 选项

| 选项 | 描述 |
|--------|-------------|
| `--enforce-completion` | 保持会话活动直到所有待办事项完成 |
| `--timeout <seconds>` | 设置最大执行时间 |

---

## 6. `auth` - 身份验证管理

管理 Google Antigravity OAuth 身份验证。使用 Gemini 模型所需。

### 用法

```bash
# 登录
bunx oh-my-opencode auth login

# 登出
bunx oh-my-opencode auth logout

# 检查当前状态
bunx oh-my-opencode auth status
```

---

## 7. 配置文件

CLI 在以下位置搜索配置文件（按优先级顺序）：

1. **项目级别**：`.opencode/oh-my-opencode.json`
2. **用户级别**：`~/.config/opencode/oh-my-opencode.json`

### JSONC 支持

配置文件支持 **JSONC（带注释的 JSON）**格式。您可以使用注释和尾随逗号。

```jsonc
{
  // 代理配置
  "sisyphus_agent": {
    "disabled": false,
    "planner_enabled": true,
  },
  
  /* 类别自定义 */
  "categories": {
    "visual-engineering": {
      "model": "google/gemini-3-pro",
    },
  },
}
```

---

## 8. 故障排除

### "OpenCode 版本太旧"错误

```bash
# 更新 OpenCode
npm install -g opencode@latest
# 或
bun install -g opencode@latest
```

### "插件未注册"错误

```bash
# 重新安装插件
bunx oh-my-opencode install
```

### Doctor 检查失败

```bash
# 使用详细信息诊断
bunx oh-my-opencode doctor --verbose

# 仅检查特定类别
bunx oh-my-opencode doctor --category authentication
```

---

## 9. 非交互模式

在 CI/CD 环境中使用 `--no-tui` 选项。

```bash
# 在 CI 环境中运行 doctor
bunx oh-my-opencode doctor --no-tui --json

# 将结果保存到文件
bunx oh-my-opencode doctor --json > doctor-report.json
```

---

## 10. 开发者信息

### CLI 结构

```
src/cli/
├── index.ts              # 基于 Commander.js 的主入口
├── install.ts            # 基于 @clack/prompts 的 TUI 安装程序
├── config-manager.ts     # JSONC 解析、多源配置管理
├── doctor/               # 健康检查系统
│   ├── index.ts          # Doctor 命令入口
│   └── checks/           # 17+ 个单独的检查模块
├── run/                  # 会话运行器
└── commands/auth.ts      # 身份验证管理
```

### 添加新的 Doctor 检查

1. 创建 `src/cli/doctor/checks/my-check.ts`：

```typescript
import type { DoctorCheck } from "../types"

export const myCheck: DoctorCheck = {
  name: "my-check",
  category: "environment",
  check: async () => {
    // 检查逻辑
    const isOk = await someValidation()
    
    return {
      status: isOk ? "pass" : "fail",
      message: isOk ? "一切正常" : "出了问题",
    }
  },
}
```

2. 在 `src/cli/doctor/checks/index.ts` 中注册：

```typescript
export { myCheck } from "./my-check"
```
