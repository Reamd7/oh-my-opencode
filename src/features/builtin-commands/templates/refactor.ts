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
export const REFACTOR_TEMPLATE = `# Intelligent Refactor Command

## Usage
\`\`\`
/refactor <refactoring-target> [--scope=<file|module|project>] [--strategy=<safe|aggressive>]

Arguments:
  refactoring-target: What to refactor. Can be:
    - File path: src/auth/handler.ts
    - Symbol name: "AuthService class"
    - Pattern: "all functions using deprecated API"
    - Description: "extract validation logic into separate module"

Options:
  --scope: Refactoring scope (default: module)
    - file: Single file only
    - module: Module/directory scope
    - project: Entire codebase

  --strategy: Risk tolerance (default: safe)
    - safe: Conservative, maximum test coverage required
    - aggressive: Allow broader changes with adequate coverage
\`\`\`

## What This Command Does

Performs intelligent, deterministic refactoring with full codebase awareness. Unlike blind search-and-replace, this command:

1. **Understands your intent** - Analyzes what you actually want to achieve
2. **Maps the codebase** - Builds a definitive codemap before touching anything
3. **Assesses risk** - Evaluates test coverage and determines verification strategy
4. **Plans meticulously** - Creates a detailed plan with Plan agent
5. **Executes precisely** - Step-by-step refactoring with LSP and AST-grep
6. **Verifies constantly** - Runs tests after each change to ensure zero regression

---

# PHASE 0: INTENT GATE (MANDATORY FIRST STEP)
# 阶段0：意图门控（强制第一步）

**BEFORE ANY ACTION, classify and validate the request.**
**在任何操作之前，分类并验证请求。**

## Step 0.1: Parse Request Type
## 步骤0.1：解析请求类型

| Signal | Classification | Action |
|--------|----------------|--------|
| Specific file/symbol | Explicit | Proceed to codebase analysis |
| "Refactor X to Y" | Clear transformation | Proceed to codebase analysis |
| "Improve", "Clean up" | Open-ended | **MUST ask**: "What specific improvement?" |
| Ambiguous scope | Uncertain | **MUST ask**: "Which modules/files?" |
| Missing context | Incomplete | **MUST ask**: "What's the desired outcome?" |

## Step 0.2: Validate Understanding
## 步骤0.2：验证理解

Before proceeding, confirm:
在继续之前，确认：
- [ ] Target is clearly identified（目标已明确识别）
- [ ] Desired outcome is understood（期望结果已理解）
- [ ] Scope is defined (file/module/project)（范围已定义：文件/模块/项目）
- [ ] Success criteria can be articulated（成功标准可以明确表述）

**If ANY of above is unclear, ASK CLARIFYING QUESTION:**

\`\`\`
I want to make sure I understand the refactoring goal correctly.

**What I understood**: [interpretation]
**What I'm unsure about**: [specific ambiguity]

Options I see:
1. [Option A] - [implications]
2. [Option B] - [implications]

**My recommendation**: [suggestion with reasoning]

Should I proceed with [recommendation], or would you prefer differently?
\`\`\`

## Step 0.3: Create Initial Todos
## 步骤0.3：创建初始待办事项

**IMMEDIATELY after understanding the request, create todos:**
**理解请求后立即创建待办事项：**

\`\`\`
TodoWrite([
  {"id": "phase-1", "content": "PHASE 1: Codebase Analysis - launch parallel explore agents", "status": "pending", "priority": "high"},
  {"id": "phase-2", "content": "PHASE 2: Build Codemap - map dependencies and impact zones", "status": "pending", "priority": "high"},
  {"id": "phase-3", "content": "PHASE 3: Test Assessment - analyze test coverage and verification strategy", "status": "pending", "priority": "high"},
  {"id": "phase-4", "content": "PHASE 4: Plan Generation - invoke Plan agent for detailed refactoring plan", "status": "pending", "priority": "high"},
  {"id": "phase-5", "content": "PHASE 5: Execute Refactoring - step-by-step with continuous verification", "status": "pending", "priority": "high"},
  {"id": "phase-6", "content": "PHASE 6: Final Verification - full test suite and regression check", "status": "pending", "priority": "high"}
])
\`\`\`

---

# PHASE 1: CODEBASE ANALYSIS (PARALLEL EXPLORATION)
# 阶段1：代码库分析（并行探索）

**Mark phase-1 as in_progress.**
**标记阶段1为进行中。**

## 1.1: Launch Parallel Explore Agents (BACKGROUND)
## 1.1：启动并行探索代理（后台）

Fire ALL of these simultaneously using \`call_omo_agent\`:
使用 \`call_omo_agent\` 同时启动所有这些代理：

\`\`\`
// Agent 1: Find the refactoring target
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="Find all occurrences and definitions of [TARGET]. 
  Report: file paths, line numbers, usage patterns."
)

// Agent 2: Find related code
call_omo_agent(
  subagent_type="explore", 
  run_in_background=true,
  prompt="Find all code that imports, uses, or depends on [TARGET].
  Report: dependency chains, import graphs."
)

// Agent 3: Find similar patterns
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="Find similar code patterns to [TARGET] in the codebase.
  Report: analogous implementations, established conventions."
)

// Agent 4: Find tests
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="Find all test files related to [TARGET].
  Report: test file paths, test case names, coverage indicators."
)

// Agent 5: Architecture context
call_omo_agent(
  subagent_type="explore",
  run_in_background=true,
  prompt="Find architectural patterns and module organization around [TARGET].
  Report: module boundaries, layer structure, design patterns in use."
)
\`\`\`

## 1.2: Direct Tool Exploration (WHILE AGENTS RUN)
## 1.2：直接工具探索（代理运行期间）

While background agents are running, use direct tools:
在后台代理运行时，使用直接工具：

### LSP Tools for Precise Analysis:
### LSP工具用于精确分析：

\`\`\`typescript
// Find definition(s)
LspGotoDefinition(filePath, line, character)  // Where is it defined?

// Find ALL usages across workspace
LspFindReferences(filePath, line, character, includeDeclaration=true)

// Get file structure
LspDocumentSymbols(filePath)  // Hierarchical outline
LspWorkspaceSymbols(filePath, query="[target_symbol]")  // Search by name

// Get current diagnostics
lsp_diagnostics(filePath)  // Errors, warnings before we start
\`\`\`

### AST-Grep for Pattern Analysis:
### AST-Grep用于模式分析：

\`\`\`typescript
// Find structural patterns
ast_grep_search(
  pattern="function $NAME($$$) { $$$ }",  // or relevant pattern
  lang="typescript",  // or relevant language
  paths=["src/"]
)

// Preview refactoring (DRY RUN)
ast_grep_replace(
  pattern="[old_pattern]",
  rewrite="[new_pattern]",
  lang="[language]",
  dryRun=true  // ALWAYS preview first
)
\`\`\`

### Grep for Text Patterns:
### Grep用于文本模式搜索：

\`\`\`
grep(pattern="[search_term]", path="src/", include="*.ts")
\`\`\`

## 1.3: Collect Background Results
## 1.3：收集后台结果

\`\`\`
background_output(task_id="[agent_1_id]")
background_output(task_id="[agent_2_id]")
...
\`\`\`

**Mark phase-1 as completed after all results collected.**
**收集所有结果后标记阶段1为已完成。**

---

# PHASE 2: BUILD CODEMAP (DEPENDENCY MAPPING)
# 阶段2：构建代码地图（依赖映射）

**Mark phase-2 as in_progress.**
**标记阶段2为进行中。**

## 2.1: Construct Definitive Codemap
## 2.1：构建确定性代码地图

Based on Phase 1 results, build:
基于阶段1的结果，构建：

\`\`\`
## CODEMAP: [TARGET]

### Core Files (Direct Impact)
- \`path/to/file.ts:L10-L50\` - Primary definition
- \`path/to/file2.ts:L25\` - Key usage

### Dependency Graph
\`\`\`
[TARGET] 
├── imports from: 
│   ├── module-a (types)
│   └── module-b (utils)
├── imported by:
│   ├── consumer-1.ts
│   ├── consumer-2.ts
│   └── consumer-3.ts
└── used by:
    ├── handler.ts (direct call)
    └── service.ts (dependency injection)
\`\`\`

### Impact Zones
| Zone | Risk Level | Files Affected | Test Coverage |
|------|------------|----------------|---------------|
| Core | HIGH | 3 files | 85% covered |
| Consumers | MEDIUM | 8 files | 70% covered |
| Edge | LOW | 2 files | 50% covered |

### Established Patterns
- Pattern A: [description] - used in N places
- Pattern B: [description] - established convention
\`\`\`

## 2.2: Identify Refactoring Constraints
## 2.2：识别重构约束

Based on codemap:
基于代码地图：
- **MUST follow**: [existing patterns identified]（必须遵循：已识别的现有模式）
- **MUST NOT break**: [critical dependencies]（禁止破坏：关键依赖）
- **Safe to change**: [isolated code zones]（安全修改：隔离的代码区域）
- **Requires migration**: [breaking changes impact]（需要迁移：破坏性变更影响）

**Mark phase-2 as completed.**
**标记阶段2为已完成。**

---

# PHASE 3: TEST ASSESSMENT (VERIFICATION STRATEGY)
# 阶段3：测试评估（验证策略）

**Mark phase-3 as in_progress.**
**标记阶段3为进行中。**

## 3.1: Detect Test Infrastructure
## 3.1：检测测试基础设施

\`\`\`bash
# Check for test commands
cat package.json | jq '.scripts | keys[] | select(test("test"))'

# Or for Python
ls -la pytest.ini pyproject.toml setup.cfg

# Or for Go
ls -la *_test.go
\`\`\`

## 3.2: Analyze Test Coverage
## 3.2：分析测试覆盖率

\`\`\`
// Find all tests related to target
call_omo_agent(
  subagent_type="explore",
  run_in_background=false,  // Need this synchronously
  prompt="Analyze test coverage for [TARGET]:
  1. Which test files cover this code?
  2. What test cases exist?
  3. Are there integration tests?
  4. What edge cases are tested?
  5. Estimated coverage percentage?"
)
\`\`\`

## 3.3: Determine Verification Strategy
## 3.3：确定验证策略

Based on test analysis:
基于测试分析：

| Coverage Level | Strategy |
|----------------|----------|
| HIGH (>80%) | Run existing tests after each step |
| MEDIUM (50-80%) | Run tests + add safety assertions |
| LOW (<50%) | **PAUSE**: Propose adding tests first |
| NONE | **BLOCK**: Refuse aggressive refactoring |

**If coverage is LOW or NONE, ask user:**

\`\`\`
Test coverage for [TARGET] is [LEVEL].

**Risk Assessment**: Refactoring without adequate tests is dangerous.

Options:
1. Add tests first, then refactor (RECOMMENDED)
2. Proceed with extra caution, manual verification required
3. Abort refactoring

Which approach do you prefer?
\`\`\`

## 3.4: Document Verification Plan
## 3.4：记录验证计划

\`\`\`
## VERIFICATION PLAN

### Test Commands
- Unit: \`bun test\` / \`npm test\` / \`pytest\` / etc.
- Integration: [command if exists]
- Type check: \`tsc --noEmit\` / \`pyright\` / etc.

### Verification Checkpoints
After each refactoring step:
1. lsp_diagnostics → zero new errors
2. Run test command → all pass
3. Type check → clean

### Regression Indicators
- [Specific test that must pass]
- [Behavior that must be preserved]
- [API contract that must not change]
\`\`\`

**Mark phase-3 as completed.**
**标记阶段3为已完成。**

---

# PHASE 4: PLAN GENERATION (PLAN AGENT)
# 阶段4：计划生成（计划代理）

**Mark phase-4 as in_progress.**
**标记阶段4为进行中。**

## 4.1: Invoke Plan Agent
## 4.1：调用计划代理

\`\`\`
Task(
  subagent_type="plan",
  prompt="Create a detailed refactoring plan:

  ## Refactoring Goal
  [User's original request]

  ## Codemap (from Phase 2)
  [Insert codemap here]

  ## Test Coverage (from Phase 3)
  [Insert verification plan here]

  ## Constraints
  - MUST follow existing patterns: [list]
  - MUST NOT break: [critical paths]
  - MUST run tests after each step

  ## Requirements
  1. Break down into atomic refactoring steps
  2. Each step must be independently verifiable
  3. Order steps by dependency (what must happen first)
  4. Specify exact files and line ranges for each step
  5. Include rollback strategy for each step
  6. Define commit checkpoints"
)
\`\`\`

## 4.2: Review and Validate Plan
## 4.2：审查和验证计划

After receiving plan from Plan agent:
从计划代理收到计划后：

1. **Verify completeness**: All identified files addressed?（验证完整性：所有识别的文件都已处理？）
2. **Verify safety**: Each step reversible?（验证安全性：每步都可逆？）
3. **Verify order**: Dependencies respected?（验证顺序：依赖关系是否得到尊重？）
4. **Verify verification**: Test commands specified?（验证验证：测试命令是否已指定？）

## 4.3: Register Detailed Todos
## 4.3：注册详细待办事项

Convert Plan agent output into granular todos:
将计划代理输出转换为细粒度待办事项：

\`\`\`
TodoWrite([
  // Each step from the plan becomes a todo
  {"id": "refactor-1", "content": "Step 1: [description]", "status": "pending", "priority": "high"},
  {"id": "verify-1", "content": "Verify Step 1: run tests", "status": "pending", "priority": "high"},
  {"id": "refactor-2", "content": "Step 2: [description]", "status": "pending", "priority": "medium"},
  {"id": "verify-2", "content": "Verify Step 2: run tests", "status": "pending", "priority": "medium"},
  // ... continue for all steps
])
\`\`\`

**Mark phase-4 as completed.**
**标记阶段4为已完成。**

---

# PHASE 5: EXECUTE REFACTORING (DETERMINISTIC EXECUTION)
# 阶段5：执行重构（确定性执行）

**Mark phase-5 as in_progress.**
**标记阶段5为进行中。**

## 5.1: Execution Protocol
## 5.1：执行协议

For EACH refactoring step:
对于每个重构步骤：

### Pre-Step
### 步骤前
1. Mark step todo as \`in_progress\`（标记步骤待办事项为进行中）
2. Read current file state（读取当前文件状态）
3. Verify lsp_diagnostics is baseline（验证lsp_diagnostics为基线）

### Execute Step
### 执行步骤
Use appropriate tool:
使用适当的工具：

**For Symbol Renames:**
**符号重命名：**
\`\`\`typescript
lsp_prepare_rename(filePath, line, character)  // Validate rename is possible
lsp_rename(filePath, line, character, newName)  // Execute rename
\`\`\`

**For Pattern Transformations:**
**模式转换：**
\`\`\`typescript
// Preview first
ast_grep_replace(pattern, rewrite, lang, dryRun=true)

// If preview looks good, execute
ast_grep_replace(pattern, rewrite, lang, dryRun=false)
\`\`\`

**For Structural Changes:**
**结构性变更：**
\`\`\`typescript
// Use Edit tool for precise changes
edit(filePath, oldString, newString)
\`\`\`

### Post-Step Verification (MANDATORY)
### 步骤后验证（强制）

\`\`\`typescript
// 1. Check diagnostics
lsp_diagnostics(filePath)  // Must be clean or same as baseline

// 2. Run tests
bash("bun test")  // Or appropriate test command

// 3. Type check
bash("tsc --noEmit")  // Or appropriate type check
\`\`\`

### Step Completion
### 步骤完成
1. If verification passes → Mark step todo as \`completed\`（验证通过 → 标记步骤待办事项为已完成）
2. If verification fails → **STOP AND FIX**（验证失败 → 停止并修复）

## 5.2: Failure Recovery Protocol
## 5.2：失败恢复协议

If ANY verification fails:
如果任何验证失败：

1. **STOP** immediately（立即停止）
2. **REVERT** the failed change（回滚失败的更改）
3. **DIAGNOSE** what went wrong（诊断出了什么问题）
4. **OPTIONS**:（选项：）
   - Fix the issue and retry（修复问题并重试）
   - Skip this step (if optional)（跳过此步骤（如果可选））
   - Consult oracle agent for help（咨询oracle代理寻求帮助）
   - Ask user for guidance（向用户寻求指导）

**NEVER proceed to next step with broken tests.**
**永远不要在测试失败的情况下继续下一步。**

## 5.3: Commit Checkpoints
## 5.3：提交检查点

After each logical group of changes:
在每个逻辑变更组之后：

\`\`\`bash
git add [changed-files]
git commit -m "refactor(scope): description

[details of what was changed and why]"
\`\`\`

**Mark phase-5 as completed when all refactoring steps done.**
**所有重构步骤完成后标记阶段5为已完成。**

---

# PHASE 6: FINAL VERIFICATION (REGRESSION CHECK)
# 阶段6：最终验证（回归检查）

**Mark phase-6 as in_progress.**
**标记阶段6为进行中。**

## 6.1: Full Test Suite
## 6.1：完整测试套件

\`\`\`bash
# Run complete test suite
bun test  # or npm test, pytest, go test, etc.
\`\`\`

## 6.2: Type Check
## 6.2：类型检查

\`\`\`bash
# Full type check
tsc --noEmit  # or equivalent
\`\`\`

## 6.3: Lint Check
## 6.3：代码检查

\`\`\`bash
# Run linter
eslint .  # or equivalent
\`\`\`

## 6.4: Build Verification (if applicable)
## 6.4：构建验证（如适用）

\`\`\`bash
# Ensure build still works
bun run build  # or npm run build, etc.
\`\`\`

## 6.5: Final Diagnostics
## 6.5：最终诊断

\`\`\`typescript
// Check all changed files
for (file of changedFiles) {
  lsp_diagnostics(file)  // Must all be clean
}
\`\`\`

## 6.6: Generate Summary
## 6.6：生成摘要

\`\`\`markdown
## Refactoring Complete

### What Changed
- [List of changes made]

### Files Modified
- \`path/to/file.ts\` - [what changed]
- \`path/to/file2.ts\` - [what changed]

### Verification Results
- Tests: PASSED (X/Y passing)
- Type Check: CLEAN
- Lint: CLEAN
- Build: SUCCESS

### No Regressions Detected
All existing tests pass. No new errors introduced.
\`\`\`

**Mark phase-6 as completed.**
**标记阶段6为已完成。**

---

# CRITICAL RULES
# 关键规则

## NEVER DO
## 禁止操作
- Skip lsp_diagnostics check after changes
- Proceed with failing tests
- Make changes without understanding impact
- Use \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\`
- Delete tests to make them pass
- Commit broken code
- Refactor without understanding existing patterns

## ALWAYS DO
## 必须操作
- Understand before changing
- Preview before applying (ast_grep dryRun=true)
- Verify after every change
- Follow existing codebase patterns
- Keep todos updated in real-time
- Commit at logical checkpoints
- Report issues immediately
## ABORT CONDITIONS
## 中止条件

If any of these occur, **STOP and consult user**:
如果发生以下任何情况，**停止并咨询用户**：
- Test coverage is zero for target code
- Changes would break public API
- Refactoring scope is unclear
- 3 consecutive verification failures
- User-defined constraints violated

---

# Tool Usage Philosophy
# 工具使用哲学

You already know these tools. Use them intelligently:
你已经了解这些工具。智能地使用它们：

## LSP Tools
## LSP工具
Leverage LSP tools for precision analysis. Key patterns:
利用LSP工具进行精确分析。关键模式：
- **Understand before changing**: \`LspGotoDefinition\` to grasp context
- **Impact analysis**: \`LspFindReferences\` to map all usages before modification
- **Safe refactoring**: \`lsp_prepare_rename\` → \`lsp_rename\` for symbol renames
- **Continuous verification**: \`lsp_diagnostics\` after every change

## AST-Grep
## AST-Grep工具
Use \`ast_grep_search\` and \`ast_grep_replace\` for structural transformations.
使用 \`ast_grep_search\` 和 \`ast_grep_replace\` 进行结构转换。
**Critical**: Always \`dryRun=true\` first, review, then execute.
**关键**：始终先使用 \`dryRun=true\`，审查后再执行。

## Agents
## 代理
- \`explore\`: Parallel codebase pattern discovery
- \`plan\`: Detailed refactoring plan generation
- \`oracle\`: Read-only consultation for complex architectural decisions and debugging
- \`librarian\`: **Use proactively** when encountering deprecated methods or library migration tasks. Query official docs and OSS examples for modern replacements.

## Deprecated Code & Library Migration
## 废弃代码和库迁移
When you encounter deprecated methods/APIs during refactoring:
在重构过程中遇到废弃的方法/API时：
1. Fire \`librarian\` to find the recommended modern alternative
2. **DO NOT auto-upgrade to latest version** unless user explicitly requests migration
3. If user requests library migration, use \`librarian\` to fetch latest API docs before making changes

---

**Remember: Refactoring without tests is reckless. Refactoring without understanding is destructive. This command ensures you do neither.**

<user-request>
$ARGUMENTS
</user-request>
`
