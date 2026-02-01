# Oh My OpenCode 概述

了解 Oh My OpenCode，一个将 OpenCode 转变为最佳代理工具的插件。

---

## TL;DR

> **Sisyphus 代理强烈推荐 Opus 4.5 模型。使用其他模型可能会导致体验显著下降。**

**感觉懒？** 只需在提示中包含 `ultrawork`（或 `ulw`）。就这样。代理会自行处理其余部分。

**需要精确？** 按 **Tab** 进入 Prometheus（Planner）模式，通过访谈过程创建工作计划，然后运行 `/start-work` 以完全编排执行它。

---

## Oh My OpenCode 为您做什么

- **从描述构建功能**：只需告诉代理您想要什么。它制定计划、编写代码并确保其工作。自动完成。您无需关心细节。
- **调试和修复问题**：描述错误或粘贴错误信息。代理分析您的代码库，识别问题并实现修复。
- **导航任何代码库**：询问有关代码库的任何问题。代理保持对整个项目结构的意识。
- **自动化繁琐任务**：修复 lint 问题、解决合并冲突、编写发布说明 - 全部通过单个命令完成。

---

## 两种工作方式

### 选项 1：Ultrawork 模式（用于快速工作）

如果您感觉懒惰，只需在提示中包含 **`ultrawork`**（或 **`ulw`**）：

```
ulw 向我的 Next.js 应用添加身份验证
```

代理将自动：
1. 探索您的代码库以理解现有模式
2. 通过专业代理研究最佳实践
3. 遵循您的约定实现功能
4. 通过诊断和测试验证
5. 继续工作直到完成

这是"只管做"模式。完全自动模式。
代理已经足够聪明，所以它会探索代码库并自己制定计划。
**您不必想得那么深入。代理会想得那么深入。**

### 选项 2：Prometheus 模式（用于精确工作）

对于复杂或关键任务，按 **Tab** 切换到 Prometheus（Planner）模式。

**工作原理：**

1. **Prometheus 访谈您** - 充当您的个人顾问，在研究您的代码库以准确了解您需要什么的同时提出澄清性问题。

2. **计划生成** - 基于访谈，Prometheus 生成包含任务、验收标准和护栏的详细工作计划。可选地由 Momus（计划审查员）审查以进行高精度验证。

3. **运行 `/start-work`** - Atlas 接管：
   - 将任务分配给专业子代理
   - 独立验证每项任务完成
   - 跨任务积累学习
   - 跨会话跟踪进度（随时恢复）

**何时使用 Prometheus：**
- 多日或多会话项目
- 关键生产更改
- 涉及许多文件的复杂重构
- 当您想要记录的决策轨迹时

---

## 关键使用指南

### 始终一起使用 Prometheus + 编排器

**不要在没有 `/start-work` 的情况下使用 `atlas`。**

编排器旨在执行 Prometheus 创建的工作计划。在没有计划的情况下直接使用它会导致不可预测的行为。

**正确的工作流程：**
```
1. 按 Tab → 进入 Prometheus 模式
2. 描述工作 → Prometheus 访谈您
3. 确认计划 → 审查 .sisyphus/plans/*.md
4. 运行 /start-work → 编排器执行
```

**Prometheus 和 Atlas 是一对。始终一起使用它们。**

---

## 模型配置

Oh My OpenCode 根据您可用的提供商自动配置模型。您无需手动指定每个模型。

### 如何确定模型

**1. 安装时（交互式安装程序）**

当您运行 `bunx oh-my-opencode install` 时，安装程序会询问您拥有哪些提供商：
- Claude Pro/Max 订阅？
- OpenAI/ChatGPT Plus？
- Google Gemini？
- GitHub Copilot？
- OpenCode Zen？
- Z.ai Coding Plan？

根据您的答案，它会生成 `~/.config/opencode/oh-my-opencode.json`，为每个代理和类别提供最佳模型分配。

**2. 运行时（后备链）**

每个代理都有一个定义的**提供商优先级链**。系统按顺序尝试提供商，直到找到可用的模型：

```
示例：multimodal-looker
google → openai → zai-coding-plan → anthropic → opencode
   ↓        ↓           ↓              ↓           ↓
gemini   gpt-5.2     glm-4.6v       haiku     gpt-5-nano
```

如果您有 Gemini，它使用 `google/gemini-3-flash`。没有 Gemini 但有 Claude？使用 `anthropic/claude-haiku-4-5`。依此类推。

### 示例配置

这是一个拥有 **Claude、OpenAI、Gemini 和 Z.ai** 全部可用的用户的真实配置：

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  "agents": {
    // 仅覆盖特定代理 - 其余使用后备链
    "atlas": { "model": "anthropic/claude-sonnet-4-5", "variant": "max" },
    "librarian": { "model": "zai-coding-plan/glm-4.7" },
    "explore": { "model": "opencode/gpt-5-nano" },
    "multimodal-looker": { "model": "zai-coding-plan/glm-4.6v" }
  },
  "categories": {
    // 覆盖类别以优化成本
    "quick": { "model": "opencode/gpt-5-nano" },
    "unspecified-low": { "model": "zai-coding-plan/glm-4.7" }
  },
  "experimental": {
    "aggressive_truncation": true
  }
}
```

**要点：**
- 您只需覆盖想要更改的内容
- 未指定的代理/类别使用自动后备链
- 自由混合提供商（Claude 用于主要工作，Z.ai 用于廉价任务等）

### 查找可用模型

运行 `opencode models` 查看您环境中所有可用的模型。模型名称遵循 `provider/model-name` 格式。

### 了解更多

有关详细配置选项，包括每个代理设置、类别自定义等，请参阅[配置指南](../configurations.zh-CN.md)。

---

## 下一步

- [理解编排系统](./understanding-orchestration-system.zh-CN.md) - 深入了解 Prometheus → 编排器 → Junior 工作流
- [Ultrawork 宣言](../ultrawork-manifesto.zh-CN.md) - Oh My OpenCode 背后的理念和原则
- [安装指南](./installation.zh-CN.md) - 详细安装说明
- [配置指南](../configurations.zh-CN.md) - 自定义代理、模型和行为
- [功能参考](../features.zh-CN.md) - 完整功能文档
