# Translation Glossary / 翻译术语表

> **Purpose**: Ensure consistent Chinese translations across all prompt files in oh-my-opencode.
> **用途**: 确保 oh-my-opencode 所有提示词文件的中文翻译一致性。

## Core Technical Terms / 核心技术术语

| English | 简体中文 | Context |
|---------|---------|---------|
| agent | 代理 | AI agents like Sisyphus, Oracle, Atlas |
| subagent | 子代理 | Spawned agents in delegation |
| hook | 钩子 | Lifecycle hooks (PreToolUse, PostToolUse, etc.) |
| tool | 工具 | Functions available to agents (read, write, bash, etc.) |
| prompt | 提示词 | Input text to LLM |
| system prompt | 系统提示词 | Core identity/behavior prompt |
| template string | 模板字符串 | Backtick strings in TypeScript |
| orchestrator | 编排器 | Master coordinator agent (Atlas) |
| planner | 规划器 | Planning agent (Prometheus) |
| consultant | 顾问/咨询师 | Advisory agents (Oracle, Metis, Momus) |

## Agent Names / 代理名称

| English | 简体中文 | Notes |
|---------|---------|-------|
| Sisyphus | Sisyphus (西西弗斯) | Keep mythological name + Chinese pronunciation |
| Atlas | Atlas (阿特拉斯) | Keep mythological name + Chinese pronunciation |
| Prometheus | Prometheus (普罗米修斯) | Keep mythological name + Chinese pronunciation |
| Oracle | Oracle (神谕者) | Translate meaning |
| Librarian | Librarian (图书管理员) | Translate meaning |
| Explore | Explore (探索者) | Translate meaning |
| Metis | Metis (墨提斯) | Keep mythological name + Chinese pronunciation |
| Momus | Momus (摩穆斯) | Keep mythological name + Chinese pronunciation |
| Sisyphus-Junior | Sisyphus-Junior (小西西弗斯) | Keep with diminutive |

## Workflow Terms / 工作流术语

| English | 简体中文 | Context |
|---------|---------|---------|
| delegation | 委托/委派 | Task delegation to subagents |
| background task | 后台任务 | Async agent execution |
| parallel execution | 并行执行 | Running multiple tasks simultaneously |
| session | 会话 | Conversation session with context |
| session_id | 会话ID | Session identifier for continuation |
| todo list | 待办列表 | Task tracking list |
| verification | 验证 | Quality checking |
| LSP (Language Server Protocol) | LSP (语言服务器协议) | Keep acronym, add Chinese in parentheses |
| AST-Grep | AST-Grep | Keep as technical term |
| TDD (Test-Driven Development) | TDD (测试驱动开发) | Keep acronym, add Chinese in parentheses |

## Action Terms / 动作术语

| English | 简体中文 | Context |
|---------|---------|---------|
| refactor | 重构 | Code restructuring |
| implement | 实现 | Write code |
| delegate | 委托 | Assign to subagent |
| spawn | 派生/生成 | Create subagent |
| fire | 启动/触发 | Launch agent/task |
| consult | 咨询 | Ask for advice |
| verify | 验证 | Check correctness |
| explore | 探索 | Search/discover |
| grep | grep | Keep as technical command |
| orchestrate | 编排 | Coordinate multiple tasks |

## Quality Terms / 质量术语

| English | 简体中文 | Context |
|---------|---------|---------|
| anti-pattern | 反模式 | Bad practice |
| best practice | 最佳实践 | Recommended approach |
| constraint | 约束 | Limitation/rule |
| requirement | 需求 | Must-have feature |
| deliverable | 交付物 | Output artifact |
| success criteria | 成功标准 | Completion definition |
| evidence | 证据 | Proof of completion |

## Technical Stack Terms / 技术栈术语

| English | 简体中文 | Notes |
|---------|---------|-------|
| TypeScript | TypeScript | Keep as-is |
| Bun | Bun | Keep as-is |
| OpenCode | OpenCode | Keep as-is (product name) |
| Claude Code | Claude Code | Keep as-is (product name) |
| MCP | MCP | Keep as-is (Model Context Protocol) |
| GitHub | GitHub | Keep as-is |
| context window | 上下文窗口 | LLM context limit |
| token | token/令牌 | LLM token count |

## Translation Guidelines / 翻译指南

1. **Keep Code Unchanged**: Variable names, function names, imports, exports stay in English
   **保持代码不变**: 变量名、函数名、导入、导出保持英文

2. **Preserve Markdown**: Headings, lists, tables, code blocks remain structured
   **保留Markdown格式**: 标题、列表、表格、代码块保持结构

3. **Technical Tone**: Use professional, concise Chinese (not overly formal or casual)
   **技术语气**: 使用专业、简洁的中文（不过于正式或随意）

4. **Consistency**: Use this glossary for ALL translations
   **一致性**: 所有翻译都使用本术语表

5. **Code Examples**: Keep code examples in English (they're code, not prose)
   **代码示例**: 代码示例保持英文（它们是代码，不是文字）

6. **Proper Nouns**: Keep product names, technology names as-is
   **专有名词**: 产品名称、技术名称保持原样

---

## Usage in Translation Tasks / 翻译任务中的使用

When translating `*.ts` files to `*.translate.ts`:

1. Load this glossary first
2. Apply term mappings consistently
3. Preserve all TypeScript syntax
4. Keep English variable/function names
5. Translate only prompt strings (template literals, string constants)

在将 `*.ts` 文件翻译为 `*.translate.ts` 时：

1. 首先加载本术语表
2. 一致性地应用术语映射
3. 保留所有 TypeScript 语法
4. 保持英文变量/函数名
5. 仅翻译提示词字符串（模板字符串、字符串常量）
