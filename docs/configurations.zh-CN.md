# Oh-My-OpenCode 配置

高度主观，但可根据喜好调整。

## 快速开始

**大多数用户无需手动配置任何内容。** 运行交互式安装程序：

```bash
bunx oh-my-opencode install
```

它会询问您的提供商（Claude、OpenAI、Gemini 等）并自动生成最佳配置。

**想要自定义？** 以下是常见模式：

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  
  // 覆盖特定代理模型
  "agents": {
    "oracle": { "model": "openai/gpt-5.2" },           // 使用 GPT 进行调试
    "librarian": { "model": "zai-coding-plan/glm-4.7" }, // 便宜的研究模型
    "explore": { "model": "opencode/gpt-5-nano" }        // 免费的 grep 模型
  },
  
  // 覆盖类别模型（由 delegate_task 使用）
  "categories": {
    "quick": { "model": "opencode/gpt-5-nano" },         // 快速/便宜用于琐碎任务
    "visual-engineering": { "model": "google/gemini-3-pro" } // Gemini 用于 UI
  }
}
```

**查找可用模型：** 运行 `opencode models` 查看环境中的所有模型。

## 配置文件位置

配置文件位置（优先级顺序）：
1. `.opencode/oh-my-opencode.json`（项目）
2. 用户配置（特定平台）：

| 平台        | 用户配置路径                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **Windows**     | `~/.config/opencode/oh-my-opencode.json`（首选）或 `%APPDATA%\opencode\oh-my-opencode.json`（后备） |
| **macOS/Linux** | `~/.config/opencode/oh-my-opencode.json`                                                                    |

支持模式自动完成：

```json
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json"
}
```

## JSONC 支持

`oh-my-opencode` 配置文件支持 JSONC（带注释的 JSON）：
- 行注释：`// 注释`
- 块注释：`/* 注释 */`
- 尾随逗号：`{ "key": "value", }`

当同时存在 `oh-my-opencode.jsonc` 和 `oh-my-opencode.json` 文件时，`.jsonc` 优先。

## Google 身份验证

**推荐**：对于 Google Gemini 身份验证，安装 [`opencode-antigravity-auth`](https://github.com/NoeFabris/opencode-antigravity-auth) 插件（`@latest`）。它提供多账户负载均衡、基于变体的思考级别、双配额系统（Antigravity + Gemini CLI）和积极维护。参见[安装 > Google Gemini](guide/installation.zh-CN.md#google-gemini-antigravity-oauth)。

## Ollama 提供商

**重要**：使用 Ollama 作为提供商时，**必须**禁用流式以避免 JSON 解析错误。

### 必需配置

```json
{
  "agents": {
    "explore": {
      "model": "ollama/qwen3-coder",
      "stream": false
    }
  }
}
```

参见 [故障排除文档](troubleshooting/ollama-streaming-issue.zh-CN.md) 了解详细故障排除。

## 代理

覆盖内置代理设置：

```json
{
  "agents": {
    "explore": {
      "model": "anthropic/claude-haiku-4-5",
      "temperature": 0.5
    },
    "multimodal-looker": {
      "disable": true
    }
  }
}
```

每个代理支持：`model`、`temperature`、`top_p`、`prompt`、`prompt_append`、`tools`、`disable`、`description`、`mode`、`color`、`permission`、`category`、`variant`、`maxTokens`、`thinking`、`reasoningEffort`、`textVerbosity`、`providerOptions`。

### 权限选项

对代理可以做什么进行细粒度控制：

```json
{
  "agents": {
    "explore": {
      "permission": {
        "edit": "deny",
        "bash": "ask",
        "webfetch": "allow"
      }
    }
  }
}
```

| 权限           | 描述                            | 值                                                                      |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `edit`               | 文件编辑权限                | `ask` / `allow` / `deny`                                                    |
| `bash`               | Bash 命令执行                 | `ask` / `allow` / `deny` 或按命令：`{ "git": "allow", "rm": "deny" }` |
| `webfetch`           | Web 请求权限                 | `ask` / `allow` / `deny`                                                    |
| `doom_loop`          | 允许无限循环检测覆盖 | `ask` / `allow` / `deny`                                                    |
| `external_directory` | 访问项目根目录外的文件      | `ask` / `allow` / `deny`                                                    |

或通过 `disabled_agents` 禁用：

```json
{
  "disabled_agents": ["oracle", "multimodal-looker"]
}
```

可用代理：`sisyphus`、`prometheus`、`oracle`、`librarian`、`explore`、`multimodal-looker`、`metis`、`momus`、`atlas`

## 内置技能

通过 `disabled_skills` 禁用内置技能：

```json
{
  "disabled_skills": ["playwright"]
}
```

可用内置技能：`playwright`、`agent-browser`、`git-master`

## 技能配置

配置高级技能设置，包括自定义技能源、启用/禁用特定技能和定义自定义技能。

```json
{
  "skills": {
    "sources": [
      { "path": "./custom-skills", "recursive": true },
      "https://example.com/skill.yaml"
    ],
    "enable": ["my-custom-skill"],
    "disable": ["other-skill"],
    "my-skill": {
      "description": "自定义技能描述",
      "template": "自定义提示模板",
      "model": "custom/model",
      "allowed-tools": ["tool1", "tool2"]
    }
  }
}
```

## 浏览器自动化

在两个浏览器自动化提供商之间选择：

| 提供商 | 接口 | 功能 | 安装 |
|----------|-----------|----------|--------------|
| **playwright**（默认） | MCP 工具 | 带结构化工具调用的 Playwright MCP 服务器 | 通过 npx 自动安装 |
| **agent-browser** | Bash CLI | Vercel 的 CLI，具有会话管理、并行浏览器 | 需要 `bun add -g agent-browser` |

通过 `oh-my-opencode.json` 中的 `browser_automation_engine` **切换提供商**：

```json
{
  "browser_automation_engine": {
    "provider": "agent-browser"
  }
}
```

## Tmux 集成

在单独的 tmux 窗格中运行后台子代理以实现**可视化多代理执行**。

通过 `oh-my-opencode.json` 中的 `tmux` **启用 tmux 集成**：

```json
{
  "tmux": {
    "enabled": true,
    "layout": "main-vertical",
    "main_pane_size": 60,
    "main_pane_min_width": 120,
    "agent_pane_min_width": 40
  }
}
```

### 布局选项

| 布局 | 描述 |
|--------|-------------|
| `main-vertical` | 主窗格左侧，代理窗格堆叠在右侧（默认） |
| `main-horizontal` | 主窗格顶部，代理窗格堆叠在底部 |
| `tiled` | 所有窗格在等大小网格中 |
| `even-horizontal` | 所有窗格在水平行中 |
| `even-vertical` | 所有窗格在垂直堆栈中 |

## Git Master

配置 git-master 技能行为：

```json
{
  "git_master": {
    "commit_footer": true,
    "include_co_authored_by": true
  }
}
```

## Sisyphus 代理

启用时（默认），Sisyphus 提供强大的编排器，并具有可选的专业代理：

```json
{
  "sisyphus_agent": {
    "disabled": false,
    "default_builder_enabled": false,
    "planner_enabled": true,
    "replace_plan": true
  }
}
```

## 后台任务

配置后台代理任务的并发限制：

```json
{
  "background_task": {
    "defaultConcurrency": 5,
    "staleTimeoutMs": 180000,
    "providerConcurrency": {
      "anthropic": 3,
      "openai": 5,
      "google": 10
    },
    "modelConcurrency": {
      "anthropic/claude-opus-4-5": 2,
      "google/gemini-3-flash": 10
    }
  }
}
```

## 类别

类别通过 `delegate_task` 工具启用领域特定的任务委托。

### 内置类别

所有 7 个类别都带有最佳模型默认值：

| 类别             | 内置默认模型             | 描述                                                          |
| -------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `visual-engineering` | `google/gemini-3-pro-preview`      | 前端、UI/UX、设计、样式、动画                          |
| `ultrabrain`         | `openai/gpt-5.2-codex`（xhigh）     | 深度逻辑推理、复杂架构决策               |
| `artistry`           | `google/gemini-3-pro-preview`（max）| 高度创意/艺术任务、新颖想法                          |
| `quick`              | `anthropic/claude-haiku-4-5`       | 琐碎任务 - 单文件更改、拼写错误修复、简单修改|
| `unspecified-low`    | `anthropic/claude-sonnet-4-5`      | 不适合其他类别的任务，需要低工作量           |
| `unspecified-high`   | `anthropic/claude-opus-4-5`（max）  | 不适合其他类别的任务，需要高工作量          |
| `writing`            | `google/gemini-3-flash-preview`    | 文档、散文、技术写作                              |

### 推荐配置

要为每个类别使用最佳模型，将它们添加到您的配置中：

```json
{
  "categories": {
    "visual-engineering": { 
      "model": "google/gemini-3-pro-preview"
    },
    "ultrabrain": { 
      "model": "openai/gpt-5.2-codex",
      "variant": "xhigh"
    },
    "quick": { 
      "model": "anthropic/claude-haiku-4-5"
    }
  }
}
```

## 模型解析系统

在运行时，Oh My OpenCode 使用 3 步解析过程来确定每个代理和类别使用哪个模型。

### 解析流程

```
步骤 1：用户覆盖 — 如果在 oh-my-opencode.json 中指定了模型，则准确使用该模型
步骤 2：提供商后备 — 按需求的优先级顺序尝试每个提供商，直到一个可用
步骤 3：系统默认 — 回退到 OpenCode 配置的默认模型
```

### 代理提供商链

每个代理都有一个定义的提供商优先级链：

| 代理 | 模型（无前缀） | 提供商优先级链 |
|-------|-------------------|-------------------------|
| **Sisyphus** | `claude-opus-4-5` | anthropic → github-copilot → opencode → antigravity → google |
| **oracle** | `gpt-5.2` | openai → anthropic → google → github-copilot → opencode |
| **librarian** | `big-pickle` | opencode → github-copilot → anthropic |
| **explore** | `gpt-5-nano` | anthropic → opencode |

## 钩子

通过 `disabled_hooks` 禁用特定的内置钩子：

```json
{
  "disabled_hooks": ["comment-checker", "agent-usage-reminder"]
}
```

可用钩子：`todo-continuation-enforcer`、`context-window-monitor`、`session-recovery`、`session-notification`、`comment-checker`、`grep-output-truncator`、`tool-output-truncator`、`directory-agents-injector`、`directory-readme-injector`、`empty-task-response-detector`、`think-mode`、`anthropic-context-window-limit-recovery`、`rules-injector`、`background-notification`、`auto-update-checker`、`startup-toast`、`keyword-detector`、`agent-usage-reminder`、`non-interactive-env`、`interactive-bash-session`、`compaction-context-injector`、`thinking-block-validator`、`claude-code-hooks`、`ralph-loop`、`preemptive-compaction`、`auto-slash-command`、`sisyphus-junior-notepad`、`start-work`

## 禁用命令

通过 `disabled_commands` 禁用特定的内置命令：

```json
{
  "disabled_commands": ["init-deep", "start-work"]
}
```

可用命令：`init-deep`、`start-work`

## Comment Checker

配置 comment-checker 钩子行为：

```json
{
  "comment_checker": {
    "custom_prompt": "您的自定义警告消息。使用 {{comments}} 占位符用于检测到的注释 XML。"
  }
}
```

## 通知

配置后台任务完成的通知行为：

```json
{
  "notification": {
    "force_enable": true
  }
}
```

## MCP

默认启用 Exa、Context7 和 grep.app MCP。

- **websearch**：由 [Exa AI](https://exa.ai) 提供支持的实时网络搜索
- **context7**：获取库的最新官方文档
- **grep_app**：通过 [grep.app](https://grep.app) 跨数百万公共 GitHub 仓库进行超快代码搜索

通过 `disabled_mcps` 禁用：

```json
{
  "disabled_mcps": ["websearch", "context7", "grep_app"]
}
```

## LSP

通过 `lsp` 选项添加 LSP 服务器：

```json
{
  "lsp": {
    "typescript-language-server": {
      "command": ["typescript-language-server", "--stdio"],
      "extensions": [".ts", ".tsx"],
      "priority": 10
    },
    "pylsp": {
      "disabled": true
    }
  }
}
```

## 实验性

选择加入可能在未来版本中更改或删除的实验性功能：

```json
{
  "experimental": {
    "truncate_all_tool_outputs": true,
    "aggressive_truncation": true,
    "auto_resume": true,
    "dynamic_context_pruning": {
      "enabled": false,
      "notification": "detailed"
    }
  }
}
```

| 选项                      | 默认 | 描述                                                                                                                                                                                                   |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `truncate_all_tool_outputs` | `false` | 截断所有工具输出，而不仅仅是白名单工具（Grep、Glob、LSP、AST-grep）。                         |
| `aggressive_truncation`     | `false` | 当超过 token 限制时，积极截断工具输出以适应限制。 |
| `auto_resume`               | `false` | 从思考块错误或思考禁用违规成功恢复后自动恢复会话。             |

## 环境变量

| 变量              | 描述                                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `OH_MY_OPENCODE_CONFIG_PATH` | 覆盖配置文件路径 |
| `OH_MY_OPENCODE_DISABLE` | 设置为 `true` 以完全禁用插件 |

---

**注意**：这是配置文档的简化版本。完整配置选项包括更多高级设置。请参考源文件或运行 `bunx oh-my-opencode doctor` 以验证您的配置。

有关完整文档，请参阅英文版配置指南。
