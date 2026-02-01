/**
 * /refactor 命令模板
 * 
 * ## 功能概述
 * 智能重构命令，使用LSP、AST-grep、架构分析和TDD验证。
 * 
 * ## 工作流程
 * 1. 意图理解 - 解析用户请求，明确重构目标
 * 2. 代码库分析 - 并行启动多个explore代理，全面扫描代码
 * 3. 构建代码地图 - 绘制依赖图和影响范围
 * 4. 测试评估 - 分析测试覆盖率，确定验证策略
 * 5. 生成计划 - 调用Plan代理生成详细的原子化步骤
 * 6. 执行重构 - 使用LSP/AST-grep逐步执行，每步验证
 * 7. 最终验证 - 完整测试套件和回归检查
 * 
 * ## 安全保证
 * - LSP验证引用完整性 - 确保所有引用都被正确更新
 * - 测试驱动（TDD）验证 - 每步执行后立即运行测试
 * - 原子性提交 - 逻辑分组提交，便于回滚
 * - 失败恢复协议 - 任何验证失败立即停止并回滚
 * 
 * ## 使用示例
 * /refactor rename function getUserData to fetchUserProfile
 * /refactor extract validation logic into separate module --scope=module
 * /refactor "all functions using deprecated API" --strategy=safe
 */
export const REFACTOR_TEMPLATE = `# 智能重构命令

## 使用方法
\`\`\`
/refactor <重构目标> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]

参数：
  重构目标：要重构的内容。可以是：
    - 文件路径：src/auth/handler.ts
    - 符号名称："AuthService class"
    - 模式："all functions using deprecated API"
    - 描述："extract validation logic into separate module"

选项：
  --scope：重构范围（默认：module）
    - file：仅单个文件
    - module：模块/目录范围
    - project：整个代码库

  --strategy：风险容忍度（默认：safe）
    - safe：保守策略，需要最大测试覆盖率
    - aggressive：允许更广泛的变更，需要足够的覆盖率
\`\`\`

## 此命令的功能

执行智能、确定性的重构，具备完整的代码库感知能力。与盲目的搜索替换不同，此命令：

1. **理解你的意图** - 分析你真正想要实现的目标
2. **映射代码库** - 在触碰任何代码之前构建确定性的代码地图
3. **评估风险** - 评估测试覆盖率并确定验证策略
4. **精心规划** - 使用Plan代理创建详细计划
5. **精确执行** - 使用LSP和AST-grep逐步重构
6. **持续验证** - 每次变更后运行测试以确保零回归

---

# 阶段0：意图门控（强制第一步）

**在任何操作之前，分类并验证请求。**

## 步骤0.1：解析请求类型

| 信号 | 分类 | 操作 |
|------|------|------|
| 特定文件/符号 | 明确 | 继续进行代码库分析 |
| "将X重构为Y" | 清晰的转换 | 继续进行代码库分析 |
| "改进"、"清理" | 开放式 | **必须询问**："具体改进什么？" |
| 模糊的范围 | 不确定 | **必须询问**："哪些模块/文件？" |
| 缺少上下文 | 不完整 | **必须询问**："期望的结果是什么？" |

## 步骤0.2：验证理解

在继续之前，确认：
- [ ] 目标已明确识别
- [ ] 期望结果已理解
- [ ] 范围已定义（文件/模块/项目）
- [ ] 成功标准可以明确表述

**如果以上任何一项不清楚，询问澄清问题：**

\`\`\`
我想确保正确理解重构目标。

**我的理解**：[解释]
**我不确定的地方**：[具体的模糊之处]

我看到的选项：
1. [选项A] - [影响]
2. [选项B] - [影响]

**我的建议**：[带理由的建议]

我应该按照[建议]进行，还是您有其他偏好？
\`\`\`

## 步骤0.3：创建初始待办事项

**理解请求后立即创建待办事项：**

\`\`\`
TodoWrite([
  {"id": "phase-1", "content": "阶段1：代码库分析 - 启动并行探索代理", "status": "pending", "priority": "high"},
  {"id": "phase-2", "content": "阶段2：构建代码地图 - 映射依赖关系和影响区域", "status": "pending", "priority": "high"},
  {"id": "phase-3", "content": "阶段3：测试评估 - 分析测试覆盖率和验证策略", "status": "pending", "priority": "high"},
  {"id": "phase-4", "content": "阶段4：计划生成 - 调用Plan代理生成详细重构计划", "status": "pending", "priority": "high"},
  {"id": "phase-5", "content": "阶段5：执行重构 - 逐步执行并持续验证", "status": "pending", "priority": "high"},
  {"id": "phase-6", "content": "阶段6：最终验证 - 完整测试套件和回归检查", "status": "pending", "priority": "high"}
])
\`\`\`

---

# 阶段1：代码库分析（并行探索）

**标记阶段1为进行中。**

## 1.1：启动并行探索代理（后台）

使用 \`call_omo_agent\` 同时启动所有这些代理：

\`\`\`
// 代理1：查找重构目标
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="查找[目标]的所有出现和定义。
  报告：文件路径、行号、使用模式。"
)

// 代理2：查找相关代码
call_omo_agent(
  subagent_type="explore", 
  run_in_background=true,
  prompt="查找所有导入、使用或依赖[目标]的代码。
  报告：依赖链、导入图。"
)

// 代理3：查找相似模式
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="在代码库中查找与[目标]相似的代码模式。
  报告：类似的实现、已建立的约定。"
)

// 代理4：查找测试
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="查找与[目标]相关的所有测试文件。
  报告：测试文件路径、测试用例名称、覆盖率指标。"
)

// 代理5：架构上下文
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="查找[目标]周围的架构模式和模块组织。
  报告：模块边界、层结构、使用的设计模式。"
)
\`\`\`

## 1.2：直接工具探索（代理运行期间）

在后台代理运行时，使用直接工具：

### LSP工具用于精确分析：

\`\`\`typescript
// 查找定义
LspGotoDefinition(filePath, line, character)  // 它在哪里定义？

// 查找工作区中的所有使用
LspFindReferences(filePath, line, character, includeDeclaration=true)

// 获取文件结构
LspDocumentSymbols(filePath)  // 层次化大纲
LspWorkspaceSymbols(filePath, query="[目标符号]")  // 按名称搜索

// 获取当前诊断
lsp_diagnostics(filePath)  // 开始前的错误、警告
\`\`\`

### AST-Grep用于模式分析：

\`\`\`typescript
// 查找结构模式
ast_grep_search(
  pattern="function $NAME($$$) { $$$ }",  // 或相关模式
  lang="typescript",  // 或相关语言
  paths=["src/"]
)

// 预览重构（试运行）
ast_grep_replace(
  pattern="[旧模式]",
  rewrite="[新模式]",
  lang="[语言]",
  dryRun=true  // 始终先预览
)
\`\`\`

### Grep用于文本模式搜索：

\`\`\`
grep(pattern="[搜索词]", path="src/", include="*.ts")
\`\`\`

## 1.3：收集后台结果

\`\`\`
background_output(task_id="[代理1_id]")
background_output(task_id="[代理2_id]")
...
\`\`\`

**收集所有结果后标记阶段1为已完成。**

---

# 阶段2：构建代码地图（依赖映射）

**标记阶段2为进行中。**

## 2.1：构建确定性代码地图

基于阶段1的结果，构建：

\`\`\`
## 代码地图：[目标]

### 核心文件（直接影响）
- \`path/to/file.ts:L10-L50\` - 主要定义
- \`path/to/file2.ts:L25\` - 关键使用

### 依赖图
\`\`\`
[目标] 
├── 导入自： 
│   ├── module-a (类型)
│   └── module-b (工具)
├── 被导入于：
│   ├── consumer-1.ts
│   ├── consumer-2.ts
│   └── consumer-3.ts
└── 被使用于：
    ├── handler.ts (直接调用)
    └── service.ts (依赖注入)
\`\`\`

### 影响区域
| 区域 | 风险级别 | 受影响文件 | 测试覆盖率 |
|------|---------|-----------|-----------|
| 核心 | 高 | 3个文件 | 85%覆盖 |
| 消费者 | 中 | 8个文件 | 70%覆盖 |
| 边缘 | 低 | 2个文件 | 50%覆盖 |

### 已建立的模式
- 模式A：[描述] - 在N个地方使用
- 模式B：[描述] - 已建立的约定
\`\`\`

## 2.2：识别重构约束

基于代码地图：
- **必须遵循**：[已识别的现有模式]
- **禁止破坏**：[关键依赖]
- **安全修改**：[隔离的代码区域]
- **需要迁移**：[破坏性变更影响]

**标记阶段2为已完成。**

---

# 阶段3：测试评估（验证策略）

**标记阶段3为进行中。**

## 3.1：检测测试基础设施

\`\`\`bash
# 检查测试命令
cat package.json | jq '.scripts | keys[] | select(test("test"))'

# 或对于Python
ls -la pytest.ini pyproject.toml setup.cfg

# 或对于Go
ls -la *_test.go
\`\`\`

## 3.2：分析测试覆盖率

\`\`\`
// 查找与目标相关的所有测试
call_omo_agent(
  subagent_type="explore",
  run_in_background=false,  // 需要同步获取
  prompt="分析[目标]的测试覆盖率：
  1. 哪些测试文件覆盖此代码？
  2. 存在哪些测试用例？
  3. 是否有集成测试？
  4. 测试了哪些边缘情况？
  5. 估计的覆盖率百分比？"
)
\`\`\`

## 3.3：确定验证策略

基于测试分析：

| 覆盖率级别 | 策略 |
|-----------|------|
| 高（>80%） | 每步后运行现有测试 |
| 中（50-80%） | 运行测试 + 添加安全断言 |
| 低（<50%） | **暂停**：建议先添加测试 |
| 无 | **阻止**：拒绝激进重构 |

**如果覆盖率低或无，询问用户：**

\`\`\`
[目标]的测试覆盖率为[级别]。

**风险评估**：在没有足够测试的情况下重构是危险的。

选项：
1. 先添加测试，然后重构（推荐）
2. 谨慎进行，需要手动验证
3. 中止重构

您更喜欢哪种方法？
\`\`\`

## 3.4：记录验证计划

\`\`\`
## 验证计划

### 测试命令
- 单元测试：\`bun test\` / \`npm test\` / \`pytest\` / 等
- 集成测试：[如果存在的命令]
- 类型检查：\`tsc --noEmit\` / \`pyright\` / 等

### 验证检查点
每个重构步骤后：
1. lsp_diagnostics → 零新错误
2. 运行测试命令 → 全部通过
3. 类型检查 → 清洁

### 回归指标
- [必须通过的特定测试]
- [必须保留的行为]
- [不得更改的API契约]
\`\`\`

**标记阶段3为已完成。**

---

# 阶段4：计划生成（计划代理）

**标记阶段4为进行中。**

## 4.1：调用计划代理

\`\`\`
Task(
  subagent_type="plan",
  prompt="创建详细的重构计划：

  ## 重构目标
  [用户的原始请求]

  ## 代码地图（来自阶段2）
  [在此插入代码地图]

  ## 测试覆盖率（来自阶段3）
  [在此插入验证计划]

  ## 约束
  - 必须遵循现有模式：[列表]
  - 禁止破坏：[关键路径]
  - 必须在每步后运行测试

  ## 要求
  1. 分解为原子化重构步骤
  2. 每步必须可独立验证
  3. 按依赖关系排序步骤（什么必须先发生）
  4. 为每步指定确切的文件和行范围
  5. 包含每步的回滚策略
  6. 定义提交检查点"
)
\`\`\`

## 4.2：审查和验证计划

从计划代理收到计划后：

1. **验证完整性**：所有识别的文件都已处理？
2. **验证安全性**：每步都可逆？
3. **验证顺序**：依赖关系是否得到尊重？
4. **验证验证**：测试命令是否已指定？

## 4.3：注册详细待办事项

将计划代理输出转换为细粒度待办事项：

\`\`\`
TodoWrite([
  // 计划中的每一步都成为一个待办事项
  {"id": "refactor-1", "content": "步骤1：[描述]", "status": "pending", "priority": "high"},
  {"id": "verify-1", "content": "验证步骤1：运行测试", "status": "pending", "priority": "high"},
  {"id": "refactor-2", "content": "步骤2：[描述]", "status": "pending", "priority": "medium"},
  {"id": "verify-2", "content": "验证步骤2：运行测试", "status": "pending", "priority": "medium"},
  // ... 继续所有步骤
])
\`\`\`

**标记阶段4为已完成。**

---

# 阶段5：执行重构（确定性执行）

**标记阶段5为进行中。**

## 5.1：执行协议

对于每个重构步骤：

### 步骤前
1. 标记步骤待办事项为 \`in_progress\`
2. 读取当前文件状态
3. 验证lsp_diagnostics为基线

### 执行步骤
使用适当的工具：

**符号重命名：**
\`\`\`typescript
lsp_prepare_rename(filePath, line, character)  // 验证重命名是否可行
lsp_rename(filePath, line, character, newName)  // 执行重命名
\`\`\`

**模式转换：**
\`\`\`typescript
// 先预览
ast_grep_replace(pattern, rewrite, lang, dryRun=true)

// 如果预览看起来不错，执行
ast_grep_replace(pattern, rewrite, lang, dryRun=false)
\`\`\`

**结构性变更：**
\`\`\`typescript
// 使用Edit工具进行精确更改
edit(filePath, oldString, newString)
\`\`\`

### 步骤后验证（强制）

\`\`\`typescript
// 1. 检查诊断
lsp_diagnostics(filePath)  // 必须清洁或与基线相同

// 2. 运行测试
bash("bun test")  // 或适当的测试命令

// 3. 类型检查
bash("tsc --noEmit")  // 或适当的类型检查
\`\`\`

### 步骤完成
1. 如果验证通过 → 标记步骤待办事项为 \`completed\`
2. 如果验证失败 → **停止并修复**

## 5.2：失败恢复协议

如果任何验证失败：

1. **立即停止**
2. **回滚**失败的更改
3. **诊断**出了什么问题
4. **选项**：
   - 修复问题并重试
   - 跳过此步骤（如果可选）
   - 咨询oracle代理寻求帮助
   - 向用户寻求指导

**永远不要在测试失败的情况下继续下一步。**

## 5.3：提交检查点

在每个逻辑变更组之后：

\`\`\`bash
git add [已更改文件]
git commit -m "refactor(scope): 描述

[更改内容和原因的详细信息]"
\`\`\`

**所有重构步骤完成后标记阶段5为已完成。**

---

# 阶段6：最终验证（回归检查）

**标记阶段6为进行中。**

## 6.1：完整测试套件

\`\`\`bash
# 运行完整测试套件
bun test  # 或 npm test、pytest、go test 等
\`\`\`

## 6.2：类型检查

\`\`\`bash
# 完整类型检查
tsc --noEmit  # 或等效命令
\`\`\`

## 6.3：代码检查

\`\`\`bash
# 运行代码检查器
eslint .  # 或等效命令
\`\`\`

## 6.4：构建验证（如适用）

\`\`\`bash
# 确保构建仍然有效
bun run build  # 或 npm run build 等
\`\`\`

## 6.5：最终诊断

\`\`\`typescript
// 检查所有已更改的文件
for (file of changedFiles) {
  lsp_diagnostics(file)  // 必须全部清洁
}
\`\`\`

## 6.6：生成摘要

\`\`\`markdown
## 重构完成

### 变更内容
- [所做更改的列表]

### 修改的文件
- \`path/to/file.ts\` - [更改内容]
- \`path/to/file2.ts\` - [更改内容]

### 验证结果
- 测试：通过（X/Y通过）
- 类型检查：清洁
- 代码检查：清洁
- 构建：成功

### 未检测到回归
所有现有测试通过。未引入新错误。
\`\`\`

**标记阶段6为已完成。**

---

# 关键规则

## 禁止操作
- 更改后跳过lsp_diagnostics检查
- 在测试失败的情况下继续
- 在不理解影响的情况下进行更改
- 使用 \`as any\`、\`@ts-ignore\`、\`@ts-expect-error\`
- 删除测试以使其通过
- 提交损坏的代码
- 在不理解现有模式的情况下重构

## 必须操作
- 在更改前先理解
- 应用前先预览（ast_grep dryRun=true）
- 每次更改后验证
- 遵循现有代码库模式
- 实时更新待办事项
- 在逻辑检查点提交
- 立即报告问题

## 中止条件

如果发生以下任何情况，**停止并咨询用户**：
- 目标代码的测试覆盖率为零
- 更改会破坏公共API
- 重构范围不清楚
- 连续3次验证失败
- 违反用户定义的约束

---

# 工具使用哲学

你已经了解这些工具。智能地使用它们：

## LSP工具
利用LSP工具进行精确分析。关键模式：
- **在更改前先理解**：\`LspGotoDefinition\` 掌握上下文
- **影响分析**：\`LspFindReferences\` 在修改前映射所有使用
- **安全重构**：\`lsp_prepare_rename\` → \`lsp_rename\` 用于符号重命名
- **持续验证**：每次更改后使用 \`lsp_diagnostics\`

## AST-Grep工具
使用 \`ast_grep_search\` 和 \`ast_grep_replace\` 进行结构转换。
**关键**：始终先使用 \`dryRun=true\`，审查后再执行。

## 代理
- \`explore\`：并行代码库模式发现
- \`plan\`：详细重构计划生成
- \`oracle\`：只读咨询，用于复杂的架构决策和调试
- \`librarian\`：**主动使用**，当遇到废弃方法或库迁移任务时。查询官方文档和开源示例以获取现代替代方案。

## 废弃代码和库迁移
在重构过程中遇到废弃的方法/API时：
1. 启动 \`librarian\` 查找推荐的现代替代方案
2. **不要自动升级到最新版本**，除非用户明确请求迁移
3. 如果用户请求库迁移，在进行更改前使用 \`librarian\` 获取最新API文档

---

**记住：没有测试的重构是鲁莽的。不理解的重构是破坏性的。此命令确保你两者都不会做。**

<user-request>
$ARGUMENTS
</user-request>
`
