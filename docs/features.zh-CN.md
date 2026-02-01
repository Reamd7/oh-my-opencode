# Oh-My-OpenCode 功能特性

---

## 代理：您的 AI 团队

Oh-My-OpenCode 提供 10 个专业 AI 代理。每个代理都有独特的专长、优化的模型和工具权限。

### 核心代理

| 代理 | 模型 | 用途 |
|-------|-------|---------|
| **Sisyphus** | `anthropic/claude-opus-4-5` | **默认编排器。**规划、委托和执行复杂任务，使用专业子代理进行积极的并行执行。基于待办事项的工作流程，具有扩展思考能力（32k 预算）。 |
| **oracle** | `openai/gpt-5.2` | 架构决策、代码审查、调试。只读咨询 - 出色的逻辑推理和深度分析。灵感来自 AmpCode。 |
| **librarian** | `opencode/big-pickle` | 多仓库分析、文档查询、开源实现示例。深度代码库理解，提供基于证据的答案。灵感来自 AmpCode。 |
| **explore** | `opencode/gpt-5-nano` | 快速代码库探索和上下文 grep。当配置 Antigravity 身份验证时使用 Gemini 3 Flash，当 Claude max20 可用时使用 Haiku，否则使用 Grok。灵感来自 Claude Code。 |
| **multimodal-looker** | `google/gemini-3-flash` | 视觉内容专家。分析 PDF、图像、图表以提取信息。通过让另一个代理处理媒体来节省 token。 |

### 规划代理

| 代理 | 模型 | 用途 |
|-------|-------|---------|
| **Prometheus** | `anthropic/claude-opus-4-5` | 战略规划器，具有访谈模式。通过迭代提问创建详细的工作计划。 |
| **Metis** | `anthropic/claude-sonnet-4-5` | 计划顾问 - 规划前分析。识别隐藏意图、歧义和 AI 失败点。 |
| **Momus** | `anthropic/claude-sonnet-4-5` | 计划审查员 - 根据清晰度、可验证性和完整性标准验证计划。 |

### 调用代理

主代理会自动调用这些代理，但您也可以显式调用它们：

```
请 @oracle 审查此设计并提出架构建议
请 @librarian 了解这是如何实现的 - 为什么行为会不断变化？
请 @explore 查找此功能的策略
```

### 工具限制

| 代理 | 限制 |
|-------|-------------|
| oracle | 只读：无法写入、编辑或委托 |
| librarian | 无法写入、编辑或委托 |
| explore | 无法写入、编辑或委托 |
| multimodal-looker | 仅允许列表：read、glob、grep |

### 后台代理

在后台运行代理并继续工作：

- 让 GPT 调试的同时，Claude 尝试不同的方法
- Gemini 编写前端的同时，Claude 处理后端
- 发起大规模并行搜索，继续实现，在需要时使用结果

```
# 在后台启动
delegate_task(agent="explore", background=true, prompt="查找身份验证实现")

# 继续工作...
# 系统在完成时通知

# 需要时检索结果
background_output(task_id="bg_abc123")
```

#### 使用 Tmux 的可视化多代理

启用 `tmux.enabled` 以在单独的 tmux 窗格中查看后台代理：

```json
{
  "tmux": {
    "enabled": true,
    "layout": "main-vertical"
  }
}
```

在 tmux 内运行时：
- 后台代理在新窗格中生成
- 实时观察多个代理工作
- 每个窗格实时显示代理输出
- 代理完成时自动清理

参见 [Tmux 集成](configurations.zh-CN.md#tmux-integration) 了解完整配置选项。

在 `oh-my-opencode.json` 中自定义代理模型、提示和权限。参见 [配置](configurations.zh-CN.md#agents)。

---

## 技能：专业知识

技能提供嵌入 MCP 服务器和详细说明的专业工作流程。

### 内置技能

| 技能 | 触发器 | 描述 |
|-------|---------|-------------|
| **playwright** | 浏览器任务、测试、截图 | 通过 Playwright MCP 进行浏览器自动化。必须用于任何浏览器相关任务 - 验证、浏览、网页抓取、测试、截图。 |
| **frontend-ui-ux** | UI/UX 任务、样式 | 设计师转开发者的角色。即使没有设计稿也能打造出色的 UI/UX。强调大胆的美学方向、独特的排版、协调的调色板。 |
| **git-master** | commit、rebase、squash、blame | 必须用于任何 git 操作。自动拆分的原子提交、rebase/squash 工作流、历史搜索（blame、bisect、log -S）。 |

### 技能：浏览器自动化（playwright / agent-browser）

**触发器**：任何浏览器相关请求

Oh-My-OpenCode 提供两个浏览器自动化提供商，可通过 `browser_automation_engine.provider` 配置：

#### 选项 1：Playwright MCP（默认）

默认提供商使用 Playwright MCP 服务器：

```yaml
mcp:
  playwright:
    command: npx
    args: ["@playwright/mcp@latest"]
```

**用法**：
```
/playwright 导航到 example.com 并截图
```

#### 选项 2：Agent Browser CLI（Vercel）

使用 [Vercel 的 agent-browser CLI](https://github.com/vercel-labs/agent-browser) 的替代提供商：

```json
{
  "browser_automation_engine": {
    "provider": "agent-browser"
  }
}
```

**需要安装**：
```bash
bun add -g agent-browser
```

**用法**：
```
使用 agent-browser 导航到 example.com 并提取主标题
```

#### 功能（两个提供商）

- 导航和与网页交互
- 截图和生成 PDF
- 填写表单和点击元素
- 等待网络请求
- 抓取内容

### 技能：frontend-ui-ux

**触发器**：UI 设计任务、视觉变更

一个设计师转开发者，打造出色的界面：

- **设计流程**：目的、基调、约束、差异化
- **美学方向**：选择极端 - 粗野主义、极繁主义、复古未来主义、奢华、趣味
- **排版**：独特字体，避免通用字体（Inter、Roboto、Arial）
- **颜色**：协调的调色板，带有鲜明的强调色，避免紫色白底的 AI 陈词滥调
- **动效**：高影响力的交错显示、滚动触发、令人惊讶的悬停状态
- **反模式**：通用字体、可预测的布局、千篇一律的设计

### 技能：git-master

**触发器**：commit、rebase、squash、"谁写的"、"X 何时添加"

三种专业功能合一：

1. **提交架构师**：原子提交、依赖排序、样式检测
2. **变基外科医生**：历史重写、冲突解决、分支清理
3. **历史考古学家**：查找特定更改的引入时间/位置

**核心原则 - 默认多次提交**：
```
3+ 文件 -> 必须 2+ 次提交
5+ 文件 -> 必须 3+ 次提交
10+ 文件 -> 必须 5+ 次提交
```

**自动样式检测**：
- 分析最近 30 次提交的语言（韩语/英语）和样式（语义/简明/简短）
- 自动匹配您仓库的提交约定

**用法**：
```
/git-master 提交这些更改
/git-master 变基到 main
/git-master 谁写了这个身份验证代码？
```

### 自定义技能

从以下位置加载自定义技能：
- `.opencode/skills/*/SKILL.md`（项目）
- `~/.config/opencode/skills/*/SKILL.md`（用户）
- `.claude/skills/*/SKILL.md`（Claude Code 兼容）
- `~/.claude/skills/*/SKILL.md`（Claude Code 用户）

通过配置中的 `disabled_skills: ["playwright"]` 禁用内置技能。

---

## 命令：斜杠工作流

命令是执行预定义模板的斜杠触发工作流。

### 内置命令

| 命令 | 描述 |
|---------|-------------|
| `/init-deep` | 初始化分层 AGENTS.md 知识库 |
| `/ralph-loop` | 启动自引用开发循环直至完成 |
| `/ulw-loop` | 启动 ultrawork 循环 - 以 ultrawork 模式继续 |
| `/cancel-ralph` | 取消活动的 Ralph 循环 |
| `/refactor` | 使用 LSP、AST-grep、架构分析和 TDD 验证的智能重构 |
| `/start-work` | 从 Prometheus 计划开始 Sisyphus 工作会话 |

### 命令：/init-deep

**目的**：在整个项目中生成分层 AGENTS.md 文件

**用法**：
```
/init-deep [--create-new] [--max-depth=N]
```

创建代理自动读取的目录特定上下文文件：
```
project/
├── AGENTS.md              # 项目范围上下文
├── src/
│   ├── AGENTS.md          # src 特定上下文
│   └── components/
│       └── AGENTS.md      # 组件特定上下文
```

### 命令：/ralph-loop

**目的**：自引用开发循环，运行直到任务完成

**命名来源**：Anthropic 的 Ralph Wiggum 插件

**用法**：
```
/ralph-loop "构建带身份验证的 REST API"
/ralph-loop "重构支付模块" --max-iterations=50
```

**行为**：
- 代理持续朝着目标工作
- 检测 `<promise>DONE</promise>` 以了解何时完成
- 如果代理停止而未完成则自动继续
- 结束条件：检测到完成、达到最大迭代次数（默认 100）或 `/cancel-ralph`

**配置**：`{ "ralph_loop": { "enabled": true, "default_max_iterations": 100 } }`

### 命令：/ulw-loop

**目的**：与 ralph-loop 相同，但激活 ultrawork 模式

一切都以最大强度运行 - 并行代理、后台任务、积极探索。

### 命令：/refactor

**目的**：使用完整工具链进行智能重构

**用法**：
```
/refactor <target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]
```

**功能**：
- LSP 驱动的重命名和导航
- AST-grep 用于模式匹配
- 更改前的架构分析
- 更改后的 TDD 验证
- Codemap 生成

### 命令：/start-work

**目的**：从 Prometheus 生成的计划开始执行

**用法**：
```
/start-work [计划名称]
```

使用 atlas 代理系统地执行计划的任务。

### 自定义命令

从以下位置加载自定义命令：
- `.opencode/command/*.md`（项目）
- `~/.config/opencode/command/*.md`（用户）
- `.claude/commands/*.md`（Claude Code 兼容）
- `~/.claude/commands/*.md`（Claude Code 用户）

---

## 钩子：生命周期自动化

钩子在代理生命周期的关键点拦截和修改行为。

### 钩子事件

| 事件 | 何时触发 | 可以做什么 |
|-------|------|-----|
| **PreToolUse** | 工具执行前 | 阻止、修改输入、注入上下文 |
| **PostToolUse** | 工具执行后 | 添加警告、修改输出、注入消息 |
| **UserPromptSubmit** | 用户提交提示时 | 阻止、注入消息、转换提示 |
| **Stop** | 会话空闲时 | 注入后续提示 |

### 内置钩子

#### 上下文和注入

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **directory-agents-injector** | PostToolUse | 读取文件时自动注入 AGENTS.md。从文件到项目根目录遍历，收集所有 AGENTS.md 文件。**对于 OpenCode 1.1.37+ 已弃用** - 当原生 AGENTS.md 注入可用时自动禁用。 |
| **directory-readme-injector** | PostToolUse | 自动注入 README.md 以获取目录上下文。 |
| **rules-injector** | PostToolUse | 当条件匹配时注入来自 `.claude/rules/` 的规则。支持 glob 和 alwaysApply。 |
| **compaction-context-injector** | Stop | 在会话压缩期间保留关键上下文。 |

#### 生产力和控制

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **keyword-detector** | UserPromptSubmit | 检测关键字并激活模式：`ultrawork`/`ulw`（最大性能）、`search`/`find`（并行探索）、`analyze`/`investigate`（深度分析）。 |
| **think-mode** | UserPromptSubmit | 自动检测扩展思考需求。捕获"深度思考"、"ultrathink"并调整模型设置。 |
| **ralph-loop** | Stop | 管理自引用循环继续。 |
| **start-work** | PostToolUse | 处理 /start-work 命令执行。 |
| **auto-slash-command** | UserPromptSubmit | 自动从提示执行斜杠命令。 |

#### 质量和安全

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **comment-checker** | PostToolUse | 提醒代理减少过多注释。智能忽略 BDD、指令、文档字符串。 |
| **thinking-block-validator** | PreToolUse | 验证思考块以防止 API 错误。 |
| **empty-message-sanitizer** | PreToolUse | 防止空聊天消息导致的 API 错误。 |
| **edit-error-recovery** | PostToolUse | 从编辑工具失败中恢复。 |

#### 恢复和稳定性

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **session-recovery** | Stop | 从会话错误中恢复 - 缺少工具结果、思考块问题、空消息。 |
| **anthropic-context-window-limit-recovery** | Stop | 优雅地处理 Claude 上下文窗口限制。 |
| **background-compaction** | Stop | 自动压缩达到 token 限制的会话。 |

#### 截断和上下文管理

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **grep-output-truncator** | PostToolUse | 基于上下文窗口动态截断 grep 输出。保持 50% 余量，最多 50k token。 |
| **tool-output-truncator** | PostToolUse | 截断 Grep、Glob、LSP、AST-grep 工具的输出。 |

#### 通知和用户体验

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **auto-update-checker** | UserPromptSubmit | 检查新版本，显示带有版本和 Sisyphus 状态的启动提示。 |
| **background-notification** | Stop | 后台代理任务完成时通知。 |
| **session-notification** | Stop | 代理空闲时的操作系统通知。适用于 macOS、Linux、Windows。 |
| **agent-usage-reminder** | PostToolUse | 提醒您利用专业代理以获得更好的结果。 |

#### 任务管理

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **task-resume-info** | PostToolUse | 提供任务恢复信息以实现连续性。 |
| **delegate-task-retry** | PostToolUse | 重试失败的 delegate_task 调用。 |

#### 集成

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **claude-code-hooks** | All | 从 Claude Code 的 settings.json 执行钩子。 |
| **atlas** | All | 主编排逻辑（771 行）。 |
| **interactive-bash-session** | PreToolUse | 管理交互式 CLI 的 tmux 会话。 |
| **non-interactive-env** | PreToolUse | 处理非交互式环境约束。 |

#### 专业化

| 钩子 | 事件 | 描述 |
|------|-------|-------------|
| **prometheus-md-only** | PostToolUse | 为 Prometheus 规划器强制仅 markdown 输出。 |

### Claude Code 钩子集成

通过 Claude Code 的 `settings.json` 运行自定义脚本：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "eslint --fix $FILE" }]
      }
    ]
  }
}
```

**钩子位置**：
- `~/.claude/settings.json`（用户）
- `./.claude/settings.json`（项目）
- `./.claude/settings.local.json`（本地，git 忽略）

### 禁用钩子

在配置中禁用特定钩子：

```json
{
  "disabled_hooks": [
    "comment-checker",
    "auto-update-checker",
    "startup-toast"
  ]
}
```

---

## 工具：代理能力

### LSP 工具（代理的 IDE 功能）

| 工具 | 描述 |
|------|-------------|
| **lsp_diagnostics** | 在构建前获取错误/警告 |
| **lsp_prepare_rename** | 验证重命名操作 |
| **lsp_rename** | 跨工作区重命名符号 |
| **lsp_goto_definition** | 跳转到符号定义 |
| **lsp_find_references** | 查找跨工作区的所有使用 |
| **lsp_symbols** | 获取文件大纲或工作区符号搜索 |

### AST-Grep 工具

| 工具 | 描述 |
|------|-------------|
| **ast_grep_search** | AST 感知的代码模式搜索（25 种语言） |
| **ast_grep_replace** | AST 感知的代码替换 |

### 委托工具

| 工具 | 描述 |
|------|-------------|
| **call_omo_agent** | 生成 explore/librarian 代理。支持 `run_in_background`。 |
| **delegate_task** | 基于类别的任务委托。支持类别（visual、business-logic）或直接代理定位。 |
| **background_output** | 检索后台任务结果 |
| **background_cancel** | 取消运行中的后台任务 |

### 会话工具

| 工具 | 描述 |
|------|-------------|
| **session_list** | 列出所有 OpenCode 会话 |
| **session_read** | 从会话中读取消息和历史 |
| **session_search** | 跨会话消息全文搜索 |
| **session_info** | 获取会话元数据和统计信息 |

### 交互式终端工具

| 工具 | 描述 |
|------|-------------|
| **interactive_bash** | 用于 TUI 应用（vim、htop、pudb）的基于 Tmux 的终端。直接传递 tmux 子命令，无需前缀。 |

**用法示例**：
```bash
# 创建新会话
interactive_bash(tmux_command="new-session -d -s dev-app")

# 向会话发送按键
interactive_bash(tmux_command="send-keys -t dev-app 'vim main.py' Enter")

# 捕获窗格输出
interactive_bash(tmux_command="capture-pane -p -t dev-app")
```

**要点**：
- 命令是 tmux 子命令（无 `tmux` 前缀）
- 用于需要持久会话的交互式应用
- 一次性命令应使用常规 `Bash` 工具加 `&`

---

## MCP：内置服务器

### websearch（Exa AI）

由 [Exa AI](https://exa.ai) 提供支持的实时网络搜索。

### context7

任何库/框架的官方文档查询。

### grep_app

跨公共 GitHub 仓库的超快代码搜索。非常适合查找实现示例。

### 技能嵌入的 MCP

技能可以自带 MCP 服务器：

```yaml
---
description: 浏览器自动化技能
mcp:
  playwright:
    command: npx
    args: ["-y", "@anthropic-ai/mcp-playwright"]
---
```

`skill_mcp` 工具通过完整的模式发现调用这些操作。

---

## 上下文注入

### 目录 AGENTS.md

读取文件时自动注入 AGENTS.md。从文件目录到项目根目录遍历：

```
project/
├── AGENTS.md              # 首先注入
├── src/
│   ├── AGENTS.md          # 其次注入
│   └── components/
│       ├── AGENTS.md      # 第三注入
│       └── Button.tsx     # 读取此文件会注入所有 3 个
```

### 条件规则

当条件匹配时从 `.claude/rules/` 注入规则：

```markdown
---
globs: ["*.ts", "src/**/*.js"]
description: "TypeScript/JavaScript 编码规则"
---
- 接口名称使用 PascalCase
- 函数名称使用 camelCase
```

支持：
- `.md` 和 `.mdc` 文件
- 用于模式匹配的 `globs` 字段
- 用于无条件规则的 `alwaysApply: true`
- 从文件到项目根目录向上遍历，加上 `~/.claude/rules/`

---

## Claude Code 兼容性

Claude Code 配置的完整兼容层。

### 配置加载器

| 类型 | 位置 |
|------|-----------|
| **命令** | `~/.claude/commands/`、`.claude/commands/` |
| **技能** | `~/.claude/skills/*/SKILL.md`、`.claude/skills/*/SKILL.md` |
| **代理** | `~/.claude/agents/*.md`、`.claude/agents/*.md` |
| **MCP** | `~/.claude/.mcp.json`、`.mcp.json`、`.claude/.mcp.json` |

MCP 配置支持环境变量扩展：`${VAR}`。

### 数据存储

| 数据 | 位置 | 格式 |
|------|----------|--------|
| 待办事项 | `~/.claude/todos/` | Claude Code 兼容 |
| 转录 | `~/.claude/transcripts/` | JSONL |

### 兼容性开关

禁用特定功能：

```json
{
  "claude_code": {
    "mcp": false,
    "commands": false,
    "skills": false,
    "agents": false,
    "hooks": false,
    "plugins": false
  }
}
```

| 开关 | 禁用 |
|--------|----------|
| `mcp` | `.mcp.json` 文件（保留内置 MCP） |
| `commands` | `~/.claude/commands/`、`.claude/commands/` |
| `skills` | `~/.claude/skills/`、`.claude/skills/` |
| `agents` | `~/.claude/agents/`（保留内置代理） |
| `hooks` | settings.json 钩子 |
| `plugins` | Claude Code 市场插件 |

禁用特定插件：

```json
{
  "claude_code": {
    "plugins_override": {
      "claude-mem@thedotmack": false
    }
  }
}
```
