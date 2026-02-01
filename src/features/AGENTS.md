# FEATURES KNOWLEDGE BASE
# 功能模块知识库

## OVERVIEW
## 概述

Core feature modules + Claude Code compatibility layer. Orchestrates background agents, skill MCPs, builtin skills/commands, and 16 feature modules.

核心功能模块 + Claude Code 兼容层。编排后台代理、技能MCP、内置技能/命令，共17个功能模块。

**功能模块分类：**

### 1. 任务编排层 (Task Orchestration)
- **background-agent**: 后台任务生命周期管理（launch → poll → complete），支持并行执行
- **sisyphus-tasks**: 任务存储和状态管理，持久化任务数据
- **sisyphus-swarm**: 代理间通信系统（邮箱机制），支持代理协作
- **tmux-subagent**: Tmux集成，支持交互式后台会话和窗格管理

### 2. Claude Code 兼容层 (Claude Code Compatibility)
- **claude-code-agent-loader**: 从 ~/.claude/agents/ 加载自定义代理
- **claude-code-command-loader**: 从 ~/.claude/commands/ 加载自定义命令
- **claude-code-mcp-loader**: 处理 .mcp.json 文件，支持 ${VAR} 环境变量展开
- **claude-code-plugin-loader**: 管理已安装插件（installed_plugins.json）
- **claude-code-session-state**: 会话状态持久化和恢复

### 3. 技能与命令系统 (Skills & Commands)
- **builtin-skills**: 内置技能定义（playwright、git-master、frontend-ui-ux等）
- **builtin-commands**: 高级命令循环（ralph-loop、refactor、ulw-loop、init-deep等）
- **opencode-skill-loader**: 技能聚合器，支持多目录优先级加载

### 4. 上下文管理 (Context Management)
- **context-injector**: 自动注入 AGENTS.md 和 README.md 到上下文
- **boulder-state**: Todo任务持久化（"西西弗斯之石"），防止任务丢失
- **hook-message-injector**: 允许钩子向消息流注入内容

### 5. 基础设施 (Infrastructure)
- **skill-mcp-manager**: MCP客户端生命周期管理（懒加载、5分钟空闲清理）
- **task-toast-manager**: UI通知管理器，显示后台任务状态

## STRUCTURE
## 目录结构

```
features/
├── background-agent/           # 后台任务生命周期管理 (1377 lines)
│   ├── manager.ts              # 任务启动 → 轮询 → 完成流程
│   └── concurrency.ts          # 每个提供商/模型的并发限制
├── builtin-skills/             # 核心技能定义 (1729 lines)
│   └── skills.ts               # playwright、git-master、frontend-ui-ux等
├── builtin-commands/           # 内置高级命令
│   └── commands.ts             # ralph-loop、refactor、ulw-loop、init-deep、start-work
├── claude-code-agent-loader/   # Claude Code 代理加载器
│   └── loader.ts               # 从 ~/.claude/agents/*.md 加载
├── claude-code-command-loader/ # Claude Code 命令加载器
│   └── loader.ts               # 从 ~/.claude/commands/*.md 加载
├── claude-code-mcp-loader/     # Claude Code MCP加载器
│   └── loader.ts               # 处理 .mcp.json，支持 ${VAR} 展开
├── claude-code-plugin-loader/  # Claude Code 插件加载器
│   └── loader.ts               # 管理 installed_plugins.json
├── claude-code-session-state/  # 会话状态持久化
│   └── state.ts                # 会话恢复和状态管理
├── opencode-skill-loader/      # OpenCode 技能加载器
│   ├── loader.ts               # 从6个目录加载技能
│   └── merger.ts               # 技能优先级合并
├── context-injector/           # 上下文自动注入
│   └── injector.ts             # 注入 AGENTS.md/README.md
├── boulder-state/              # Todo状态持久化
│   └── state.ts                # "西西弗斯之石"任务存储
├── hook-message-injector/      # 钩子消息注入
│   └── injector.ts             # 允许钩子修改消息流
├── task-toast-manager/         # 任务通知管理器
│   └── manager.ts              # UI通知显示
├── skill-mcp-manager/          # 技能MCP管理器 (520 lines)
│   └── manager.ts              # MCP客户端懒加载和清理
├── tmux-subagent/              # Tmux会话管理
│   └── manager.ts              # Tmux窗格和会话管理
├── sisyphus-tasks/             # Sisyphus任务存储
│   └── storage.ts              # 任务数据持久化
└── sisyphus-swarm/             # Sisyphus代理群
    └── mailbox.ts              # 代理间消息传递
```

## LOADER PRIORITY
## 加载器优先级

功能模块支持多层级配置，优先级从高到低：

| Type | Priority (highest first) |
|------|--------------------------|
| Commands | `.opencode/command/` > `~/.config/opencode/command/` > `.claude/commands/` |
| Skills | `.opencode/skills/` > `~/.config/opencode/skills/` > `.claude/skills/` |
| MCPs | `.claude/.mcp.json` > `.mcp.json` > `~/.claude/.mcp.json` |

**说明：**
- **项目级配置** (`.opencode/`): 优先级最高，适用于项目特定需求
- **用户级配置** (`~/.config/opencode/`): 中等优先级，适用于个人偏好
- **Claude Code兼容** (`.claude/`): 最低优先级，保持与Claude Code的兼容性

## BACKGROUND AGENT
## 后台代理系统

后台代理系统是 oh-my-opencode 的核心编排引擎，支持并行执行多个AI代理任务。

### 生命周期 (Lifecycle)
1. **launch**: 启动新的后台会话，分配并发槽位
2. **poll** (2秒间隔): 轮询任务状态，检测进度和稳定性
3. **complete**: 任务完成，释放资源，通知父会话

### 稳定性检测 (Stability Detection)
- **3次连续轮询**消息数不变 → 判定为空闲状态
- 防止代理"假装工作"但实际无进展

### 并发控制 (Concurrency)
- 通过 `ConcurrencyManager` 管理每个提供商/模型的并发限制
- 支持配置：`background_tasks.concurrency_limits`
- 示例：`anthropic/claude-opus-4-5: 3` (最多3个并发任务)

### 清理机制 (Cleanup)
- **30分钟 TTL**: 超时自动清理
- **3分钟 stale timeout**: 无响应任务清理
- **会话删除**: 监听 `session.deleted` 事件，清理相关状态

### 状态管理 (State)
- 每个会话独立的 Map 存储
- 任务元数据：状态、进度、错误、结果
- 支持任务恢复和重试

## SKILL MCP
## 技能MCP系统

技能MCP系统允许技能嵌入自己的MCP服务器，实现高级功能扩展。

### 懒加载 (Lazy Loading)
- MCP客户端在**首次调用时**才创建
- 减少启动时间和内存占用
- 按需加载，提高性能

### 传输协议 (Transports)
- **stdio**: 标准输入/输出，适用于本地进程
- **http**: HTTP传输，支持SSE (Server-Sent Events) 和 Streamable
- 自动检测和适配传输类型

### 生命周期管理 (Lifecycle)
- **5分钟空闲清理**: 无活动的MCP客户端自动关闭
- 资源自动回收，防止内存泄漏
- 支持手动清理和重启

### 使用场景
- **playwright技能**: 嵌入浏览器自动化MCP
- **自定义工具**: 技能可以提供专用的工具集
- **外部服务集成**: 连接第三方API和服务

## ANTI-PATTERNS
## 反模式（避免这些做法）

### 1. 顺序委托 (Sequential Delegation)
❌ **错误做法**:
```typescript
await delegate_task({ agent: "explore", prompt: "..." });
await delegate_task({ agent: "librarian", prompt: "..." });
```

✅ **正确做法**:
```typescript
// 并行执行，节省时间
Promise.all([
  delegate_task({ agent: "explore", prompt: "..." }),
  delegate_task({ agent: "librarian", prompt: "..." })
]);
```

### 2. 信任代理自报告 (Trust Self-Reports)
❌ **错误做法**: 相信代理说"我已经完成了X"
✅ **正确做法**: 始终验证结果（运行测试、检查文件、执行命令）

### 3. 主线程阻塞 (Main Thread Blocks)
❌ **错误做法**: 在加载器初始化时执行重I/O操作
✅ **正确做法**: 使用懒加载，延迟到首次使用时

### 4. 直接状态修改 (Direct State Mutation)
❌ **错误做法**: 直接修改 boulder-state 或 session-state
✅ **正确做法**: 使用管理器提供的API（`setBoulderState`, `setSessionAgent`等）

### 5. 忽略并发限制 (Ignore Concurrency Limits)
❌ **错误做法**: 无限制启动后台任务
✅ **正确做法**: 配置合理的 `concurrency_limits`，避免API限流

### 6. 过度依赖钩子 (Hook Overuse)
❌ **错误做法**: 在 `PreToolUse` 钩子中执行重逻辑（每次工具调用都会触发）
✅ **正确做法**: 使用 `UserPromptSubmit` 或其他更合适的钩子

---

## INTEGRATION
## 功能模块集成机制

### 插件入口 (Plugin Entry)
功能模块通过 `src/index.ts` 集成到主插件中：

```typescript
// 1. 导入功能模块
import { BackgroundManager } from "./features/background-agent";
import { SkillMcpManager } from "./features/skill-mcp-manager";
import { createBuiltinSkills } from "./features/builtin-skills";

// 2. 初始化管理器
const backgroundManager = new BackgroundManager(ctx);
const skillMcpManager = new SkillMcpManager(ctx);

// 3. 注册到插件上下文
ctx.backgroundManager = backgroundManager;
ctx.skillMcpManager = skillMcpManager;
```

### 功能启用/禁用 (Feature Toggle)
通过配置文件控制功能模块：

```jsonc
{
  // 禁用特定钩子
  "disabled_hooks": ["comment-checker", "auto-update-checker"],
  
  // 禁用Claude Code兼容层
  "claude_code": {
    "hooks": false,
    "agents": false,
    "commands": false
  },
  
  // 禁用Sisyphus代理
  "sisyphus_agent": {
    "disabled": true
  }
}
```

### 模块依赖关系 (Module Dependencies)

```
主插件 (src/index.ts)
├── 后台代理系统
│   ├── background-agent (核心)
│   ├── sisyphus-tasks (存储)
│   └── task-toast-manager (通知)
├── 技能系统
│   ├── builtin-skills (内置)
│   ├── opencode-skill-loader (加载器)
│   └── skill-mcp-manager (MCP)
├── Claude Code兼容
│   ├── claude-code-agent-loader
│   ├── claude-code-command-loader
│   ├── claude-code-mcp-loader
│   ├── claude-code-plugin-loader
│   └── claude-code-session-state
└── 上下文管理
    ├── context-injector
    ├── boulder-state
    └── hook-message-injector
```

### 生命周期钩子集成 (Hook Integration)
功能模块通过钩子系统与主插件交互：

| 钩子阶段 | 相关功能模块 | 作用 |
|---------|------------|------|
| `session.created` | claude-code-session-state | 初始化会话状态 |
| `session.deleted` | background-agent, boulder-state | 清理会话资源 |
| `UserPromptSubmit` | keyword-detector, context-injector | 处理用户输入 |
| `PreToolUse` | comment-checker, tool-output-truncator | 工具调用前处理 |
| `PostToolUse` | background-notification | 工具调用后通知 |

### 工具注册 (Tool Registration)
功能模块提供的工具通过工具系统注册：

```typescript
// background-agent 提供的工具
tools: [
  createCallOmoAgent(backgroundManager),      // call_omo_agent
  createBackgroundTools(backgroundManager),   // background_output, background_cancel
]

// skill-mcp-manager 提供的工具
tools: [
  createSkillMcpTool(skillMcpManager),       // skill_mcp
]
```

### 配置加载顺序 (Config Loading Order)
1. **默认配置**: 插件内置默认值
2. **用户配置**: `~/.config/opencode/oh-my-opencode.json`
3. **项目配置**: `.opencode/oh-my-opencode.json`
4. **运行时覆盖**: 通过API动态修改

---

## FEATURE MODULE CHECKLIST
## 功能模块开发清单

创建新功能模块时，遵循以下步骤：

### 1. 目录结构
```
src/features/my-feature/
├── index.ts          # 导出接口
├── types.ts          # 类型定义
├── manager.ts        # 核心逻辑
├── AGENTS.md         # 模块文档
└── *.test.ts         # 单元测试
```

### 2. 类型定义 (types.ts)
- 定义清晰的接口和类型
- 使用 JSDoc 添加中文注释
- 导出所有公共类型

### 3. 管理器实现 (manager.ts)
- 实现核心业务逻辑
- 提供清晰的API
- 处理错误和边界情况

### 4. 导出接口 (index.ts)
```typescript
export * from "./types";
export { MyFeatureManager } from "./manager";
```

### 5. 集成到主插件
- 在 `src/index.ts` 中导入
- 初始化管理器
- 注册工具和钩子

### 6. 文档和测试
- 更新 `src/features/AGENTS.md`
- 编写单元测试
- 添加使用示例

---

## TROUBLESHOOTING
## 故障排查

### 后台任务卡住
**症状**: 后台任务一直处于 `running` 状态
**原因**: 
- 并发槽位耗尽
- 任务无进展但未被检测为空闲
**解决**:
```typescript
// 检查并发限制
config.background_tasks.concurrency_limits

// 调整稳定性检测阈值
config.background_tasks.stability_threshold = 5
```

### MCP客户端无法启动
**症状**: `skill_mcp` 工具调用失败
**原因**:
- MCP服务器路径错误
- 环境变量未设置
**解决**:
```bash
# 检查MCP配置
cat .mcp.json

# 验证环境变量
echo $MCP_SERVER_PATH
```

### 技能加载失败
**症状**: 技能未出现在可用列表中
**原因**:
- 技能文件格式错误
- 优先级被覆盖
**解决**:
```bash
# 检查技能文件
cat .opencode/skills/my-skill/SKILL.md

# 验证加载顺序
# 项目技能 > 用户技能 > 内置技能
```

### 会话状态丢失
**症状**: 会话恢复后状态不一致
**原因**:
- boulder-state 未正确持久化
- 会话清理过早
**解决**:
```typescript
// 确保使用管理器API
import { setBoulderState } from "./features/boulder-state";

// 不要直接修改状态
setBoulderState(sessionID, state);
```
