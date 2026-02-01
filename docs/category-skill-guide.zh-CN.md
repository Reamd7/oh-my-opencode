# 类别和技能系统指南

本文档提供**类别**和**技能**系统的全面指南，它们构成了 Oh-My-OpenCode 的扩展性核心。

## 1. 概述

与其将所有内容委托给单个 AI 代理，调用针对任务性质量身定制的**专家**要高效得多。

- **类别**："这是什么类型的工作？"（确定模型、温度、提示心态）
- **技能**："需要什么工具和知识？"（注入专业知识、MCP 工具、工作流程）

通过结合这两个概念，您可以通过 `delegate_task` 生成最佳代理。

---

## 2. 类别系统

类别是针对特定领域优化的代理配置预设。

### 可用的内置类别

| 类别 | 默认模型 | 用例 |
|----------|---------------|-----------|
| `visual-engineering` | `google/gemini-3-pro` | 前端、UI/UX、设计、样式、动画 |
| `ultrabrain` | `openai/gpt-5.2-codex`（xhigh） | 深度逻辑推理、需要广泛分析的复杂架构决策 |
| `artistry` | `google/gemini-3-pro`（max） | 高度创意/艺术任务、新颖想法 |
| `quick` | `anthropic/claude-haiku-4.5` | 琐碎任务 - 单文件更改、拼写错误修复、简单修改 |
| `unspecified-low` | `anthropic/claude-sonnet-4.5` | 不适合其他类别的任务，需要低工作量 |
| `unspecified-high` | `anthropic/claude-opus-4.5`（max） | 不适合其他类别的任务，需要高工作量 |
| `writing` | `google/gemini-3-flash` | 文档、散文、技术写作 |

### 用法

调用 `delegate_task` 工具时指定 `category` 参数。

```typescript
delegate_task(
  category="visual-engineering",
  prompt="向仪表板页面添加响应式图表组件"
)
```

### Sisyphus-Junior（委托执行者）

当您使用类别时，一个名为 **Sisyphus-Junior** 的特殊代理执行工作。
- **特征**：无法**重新委托**任务给其他代理。
- **目的**：防止无限委托循环并确保专注于分配的任务。

---

## 3. 技能系统

技能是一种为特定领域向代理注入**专业知识（上下文）**和**工具（MCP）**的机制。

### 内置技能

1. **`git-master`**
   - **能力**：Git 专家。检测提交样式、拆分原子提交、制定变基策略。
   - **MCP**：无（使用 Git 命令）
   - **用法**：对于提交、历史搜索、分支管理至关重要。

2. **`playwright`**
   - **能力**：浏览器自动化。网页测试、截图、抓取。
   - **MCP**：`@playwright/mcp`（自动执行）
   - **用法**：用于实现后的 UI 验证、E2E 测试编写。

3. **`frontend-ui-ux`**
   - **能力**：注入设计师心态。颜色、排版、动效指南。
   - **用法**：用于超越简单实现的美学 UI 工作。

### 用法

将所需的技能名称添加到 `load_skills` 数组。

```typescript
delegate_task(
  category="quick",
  load_skills=["git-master"],
  prompt="提交当前更改。遵循提交消息样式。"
)
```

### 技能自定义（SKILL.md）

您可以直接向项目根目录的 `.opencode/skills/` 或主目录的 `~/.claude/skills/` 添加自定义技能。

**示例：`.opencode/skills/my-skill/SKILL.md`**

```markdown
---
name: my-skill
description: 我的特殊自定义技能
mcp:
  my-mcp:
    command: npx
    args: ["-y", "my-mcp-server"]
---

# 我的技能提示

此内容将注入到代理的系统提示中。
...
```

---

## 4. 组合策略（组合）

您可以通过组合类别和技能创建强大的专业代理。

### 🎨 设计师（UI 实现）
- **类别**：`visual-engineering`
- **load_skills**：`["frontend-ui-ux", "playwright"]`
- **效果**：实现美学 UI 并直接在浏览器中验证渲染结果。

### 🏗️ 架构师（设计审查）
- **类别**：`ultrabrain`
- **load_skills**：`[]`（纯推理）
- **效果**：利用 GPT-5.2 的逻辑推理进行深入的系统架构分析。

### ⚡ 维护者（快速修复）
- **类别**：`quick`
- **load_skills**：`["git-master"]`
- **效果**：使用成本效益高的模型快速修复代码并生成干净的提交。

---

## 5. delegate_task 提示指南

委托时，**清晰和具体**的提示至关重要。包括这 7 个元素：

1. **任务**：需要做什么？（单一目标）
2. **预期结果**：交付物是什么？
3. **所需技能**：应通过 `load_skills` 加载哪些技能？
4. **所需工具**：必须使用哪些工具？（白名单）
5. **必须做**：必须做什么（约束）
6. **禁止做**：绝对不能做什么
7. **上下文**：文件路径、现有模式、参考材料

**错误示例**：
> "修复这个"

**良好示例**：
> **任务**：修复 `LoginButton.tsx` 中的移动布局破坏问题
> **上下文**：`src/components/LoginButton.tsx`，使用 Tailwind CSS
> **必须做**：在 `md:` 断点处更改 flex-direction
> **禁止做**：修改现有桌面布局
> **预期**：按钮在移动设备上垂直对齐

---

## 6. 配置指南（oh-my-opencode.json）

您可以在 `oh-my-opencode.json` 中微调类别。

### 类别配置模式（CategoryConfig）

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `description` | string | 类别目的的人类可读描述。在 delegate_task 提示中显示。 |
| `model` | string | 要使用的 AI 模型 ID（例如，`anthropic/claude-opus-4-5`） |
| `variant` | string | 模型变体（例如，`max`、`xhigh`） |
| `temperature` | number | 创造力级别（0.0 ~ 2.0）。较低更确定。 |
| `top_p` | number | 核采样参数（0.0 ~ 1.0） |
| `prompt_append` | string | 选择此类别时追加到系统提示的内容 |
| `thinking` | object | 思考模型配置（`{ type: "enabled", budgetTokens: 16000 }`） |
| `reasoningEffort` | string | 推理努力级别（`low`、`medium`、`high`） |
| `textVerbosity` | string | 文本详细程度级别（`low`、`medium`、`high`） |
| `tools` | object | 工具使用控制（使用 `{ "tool_name": false }` 禁用） |
| `maxTokens` | number | 最大响应 token 计数 |
| `is_unstable_agent` | boolean | 将代理标记为不稳定 - 强制后台模式以进行监控 |

### 示例配置

```jsonc
{
  "categories": {
    // 1. 定义新的自定义类别
    "korean-writer": {
      "model": "google/gemini-3-flash",
      "temperature": 0.5,
      "prompt_append": "您是韩语技术写作者。保持友好和清晰的语气。"
    },
    
    // 2. 覆盖现有类别（更改模型）
    "visual-engineering": {
      "model": "openai/gpt-5.2", // 可以更改模型
      "temperature": 0.8
    },

    // 3. 配置思考模型并限制工具
    "deep-reasoning": {
      "model": "anthropic/claude-opus-4-5",
      "thinking": {
        "type": "enabled",
        "budgetTokens": 32000
      },
      "tools": {
        "websearch_web_search_exa": false // 禁用网络搜索
      }
    }
  },
  
  // 禁用技能
  "disabled_skills": ["playwright"]
}
```
