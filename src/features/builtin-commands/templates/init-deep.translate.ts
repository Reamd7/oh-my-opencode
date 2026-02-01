export const INIT_DEEP_TEMPLATE = `# /init-deep

生成分层的 AGENTS.md 文件。根目录 + 基于复杂度评分的子目录。

## 使用方法

\`\`\`
/init-deep                      # 更新模式：修改现有文件 + 在必要时创建新文件
/init-deep --create-new         # 读取现有文件 → 删除所有 → 从头重新生成
/init-deep --max-depth=2        # 限制目录深度（默认：3）
\`\`\`

---

## 工作流程（高层级）

1. **发现 + 分析**（并发）
   - 立即启动后台探索代理
   - 主会话：bash 结构 + LSP 代码地图 + 读取现有 AGENTS.md
2. **评分 & 决策** - 根据合并的发现结果确定 AGENTS.md 位置
3. **生成** - 先生成根目录，然后并行生成子目录
4. **审查** - 去重、精简、验证

<critical>
**使用 TodoWrite 记录所有阶段。实时标记 in_progress → completed。**
\`\`\`
TodoWrite([
  { id: "discovery", content: "启动探索代理 + LSP 代码地图 + 读取现有文件", status: "pending", priority: "high" },
  { id: "scoring", content: "评分目录，确定位置", status: "pending", priority: "high" },
  { id: "generate", content: "生成 AGENTS.md 文件（根目录 + 子目录）", status: "pending", priority: "high" },
  { id: "review", content: "去重、验证、精简", status: "pending", priority: "medium" }
])
\`\`\`
</critical>

---

## 阶段 1：发现 + 分析（并发）

**标记 "discovery" 为 in_progress。**

### 立即启动后台探索代理

不要等待——这些任务异步运行，主会话同时工作。

\`\`\`
// 一次性全部启动，稍后收集结果
delegate_task(agent="explore", prompt="项目结构：预测检测到的语言的标准模式 → 仅报告偏差")
delegate_task(agent="explore", prompt="入口点：查找主文件 → 报告非标准组织")
delegate_task(agent="explore", prompt="约定：查找配置文件（.eslintrc、pyproject.toml、.editorconfig）→ 报告项目特定规则")
delegate_task(agent="explore", prompt="反模式：查找 'DO NOT'、'NEVER'、'ALWAYS'、'DEPRECATED' 注释 → 列出禁止的模式")
delegate_task(agent="explore", prompt="构建/CI：查找 .github/workflows、Makefile → 报告非标准模式")
delegate_task(agent="explore", prompt="测试模式：查找测试配置、测试结构 → 报告独特约定")
\`\`\`

<dynamic-agents>
**动态代理派生**：在 bash 分析后，根据项目规模派生额外的探索代理：

| 因素 | 阈值 | 额外代理 |
|--------|-----------|-------------------|
| **总文件数** | >100 | 每 100 个文件 +1 |
| **总行数** | >10k | 每 10k 行 +1 |
| **目录深度** | ≥4 | +2 用于深度探索 |
| **大文件（>500 行）** | >10 个文件 | +1 用于复杂度热点 |
| **Monorepo** | 检测到 | 每个包/工作区 +1 |
| **多语言** | >1 | 每种语言 +1 |

\`\`\`bash
# 首先测量项目规模
total_files=$(find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l)
total_lines=$(find . -type f \\( -name "*.ts" -o -name "*.py" -o -name "*.go" \\) -not -path '*/node_modules/*' -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
large_files=$(find . -type f \\( -name "*.ts" -o -name "*.py" \\) -not -path '*/node_modules/*' -exec wc -l {} + 2>/dev/null | awk '$1 > 500 {count++} END {print count+0}')
max_depth=$(find . -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | awk -F/ '{print NF}' | sort -rn | head -1)
\`\`\`

派生示例：
\`\`\`
// 500 个文件，50k 行，深度 6，15 个大文件 → 派生 5+5+2+1 = 13 个额外代理
delegate_task(agent="explore", prompt="大文件分析：查找 >500 行的文件，报告复杂度热点")
delegate_task(agent="explore", prompt="深度 4+ 的深层模块：查找隐藏模式、内部约定")
delegate_task(agent="explore", prompt="横切关注点：查找跨目录的共享工具")
// ... 根据计算结果派生更多
\`\`\`
</dynamic-agents>

### 主会话：并发分析

**在后台代理运行时**，主会话执行：

#### 1. Bash 结构分析
\`\`\`bash
# 目录深度 + 文件计数
find . -type d -not -path '*/\\.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' | awk -F/ '{print NF-1}' | sort -n | uniq -c

# 每个目录的文件数（前 30）
find . -type f -not -path '*/\\.*' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30

# 按扩展名的代码集中度
find . -type f \\( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.go" -o -name "*.rs" \\) -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# 现有的 AGENTS.md / CLAUDE.md
find . -type f \\( -name "AGENTS.md" -o -name "CLAUDE.md" \\) -not -path '*/node_modules/*' 2>/dev/null
\`\`\`

#### 2. 读取现有 AGENTS.md
\`\`\`
对于找到的每个现有文件：
  Read(filePath=file)
  提取：关键见解、约定、反模式
  存储在 EXISTING_AGENTS 映射中
\`\`\`

如果使用 \`--create-new\`：先读取所有现有文件（保留上下文）→ 然后删除所有 → 重新生成。

#### 3. LSP 代码地图（如果可用）
\`\`\`
LspServers()  # 检查可用性

# 入口点（并行）
LspDocumentSymbols(filePath="src/index.ts")
LspDocumentSymbols(filePath="main.py")

# 关键符号（并行）
LspWorkspaceSymbols(filePath=".", query="class")
LspWorkspaceSymbols(filePath=".", query="interface")
LspWorkspaceSymbols(filePath=".", query="function")

# 顶级导出的中心性
LspFindReferences(filePath="...", line=X, character=Y)
\`\`\`

**LSP 回退**：如果不可用，依赖探索代理 + AST-grep。

### 收集后台结果

\`\`\`
// 主会话分析完成后，收集所有任务结果
for each task_id: background_output(task_id="...")
\`\`\`

**合并：bash + LSP + 现有文件 + 探索发现。标记 "discovery" 为 completed。**

---

## 阶段 2：评分 & 位置决策

**标记 "scoring" 为 in_progress。**

### 评分矩阵

| 因素 | 权重 | 高阈值 | 来源 |
|--------|--------|----------------|--------|
| 文件数 | 3x | >20 | bash |
| 子目录数 | 2x | >5 | bash |
| 代码比例 | 2x | >70% | bash |
| 独特模式 | 1x | 有自己的配置 | explore |
| 模块边界 | 2x | 有 index.ts/__init__.py | bash |
| 符号密度 | 2x | >30 个符号 | LSP |
| 导出数 | 2x | >10 个导出 | LSP |
| 引用中心性 | 3x | >20 个引用 | LSP |

### 决策规则

| 分数 | 操作 |
|-------|--------|
| **根目录 (.)** | 始终创建 |
| **>15** | 创建 AGENTS.md |
| **8-15** | 如果是独特领域则创建 |
| **<8** | 跳过（父目录覆盖）|

### 输出
\`\`\`
AGENTS_LOCATIONS = [
  { path: ".", type: "root" },
  { path: "src/hooks", score: 18, reason: "高复杂度" },
  { path: "src/api", score: 12, reason: "独特领域" }
]
\`\`\`

**标记 "scoring" 为 completed。**

---

## 阶段 3：生成 AGENTS.md

**标记 "generate" 为 in_progress。**

### 根目录 AGENTS.md（完整处理）

\`\`\`markdown
# 项目知识库

**生成时间：** {TIMESTAMP}
**提交：** {SHORT_SHA}
**分支：** {BRANCH}

## 概述
{1-2 句话：是什么 + 核心技术栈}

## 结构
\\\`\\\`\\\`
{root}/
├── {dir}/    # {仅非显而易见的目的}
└── {entry}
\\\`\\\`\\\`

## 在哪里查找
| 任务 | 位置 | 备注 |
|------|----------|-------|

## 代码地图
{来自 LSP - 如果不可用或项目 <10 个文件则跳过}

| 符号 | 类型 | 位置 | 引用数 | 角色 |
|--------|------|----------|------|------|

## 约定
{仅偏离标准的部分}

## 反模式（本项目）
{本项目明确禁止的}

## 独特风格
{项目特定的}

## 命令
\\\`\\\`\\\`bash
{dev/test/build}
\\\`\\\`\\\`

## 备注
{陷阱}
\`\`\`

**质量门槛**：50-150 行，无通用建议，无显而易见的信息。

### 子目录 AGENTS.md（并行）

为每个位置启动写入任务：

\`\`\`
for loc in AGENTS_LOCATIONS (除根目录外):
  delegate_task(category="writing", prompt=\\\`
    为以下路径生成 AGENTS.md：\${loc.path}
    - 原因：\${loc.reason}
    - 最多 30-80 行
    - 永远不要重复父目录内容
    - 章节：概述（1 行）、结构（如果 >5 个子目录）、在哪里查找、约定（如果不同）、反模式
  \\\`)
\`\`\`

**等待所有任务完成。标记 "generate" 为 completed。**

---

## 阶段 4：审查 & 去重

**标记 "review" 为 in_progress。**

对于每个生成的文件：
- 删除通用建议
- 删除父目录重复内容
- 精简到大小限制
- 验证电报式风格

**标记 "review" 为 completed。**

---

## 最终报告

\`\`\`
=== init-deep 完成 ===

模式：{update | create-new}

文件：
  [OK] ./AGENTS.md (根目录，{N} 行)
  [OK] ./src/hooks/AGENTS.md ({N} 行)

分析的目录数：{N}
创建的 AGENTS.md：{N}
更新的 AGENTS.md：{N}

层次结构：
  ./AGENTS.md
  └── src/hooks/AGENTS.md
\`\`\`

---

## 反模式

- **静态代理数量**：必须根据项目大小/深度变化代理数量
- **顺序执行**：必须并行（探索 + LSP 并发）
- **忽略现有文件**：始终先读取现有文件，即使使用 --create-new
- **过度文档化**：不是每个目录都需要 AGENTS.md
- **冗余**：子目录永远不要重复父目录内容
- **通用内容**：删除适用于所有项目的任何内容
- **冗长风格**：电报式或死亡`
