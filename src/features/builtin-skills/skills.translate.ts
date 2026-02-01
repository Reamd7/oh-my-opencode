/**
 * 内置技能定义
 * 
 * ## 功能概述
 * 定义所有内置技能，为代理提供专业领域的指令和工作流。
 * 技能是结构化的指令集，通过 load_skills 参数注入代理，使其具备特定领域的专业能力。
 * 
 * ## 技能系统架构
 * 
 * ### 技能的本质
 * 技能不是代码，而是**结构化的指令文档**（Markdown格式），告诉代理：
 * - 如何思考问题（思维模式）
 * - 如何执行任务（工作流程）
 * - 如何使用工具（最佳实践）
 * - 如何避免错误（反模式）
 * 
 * ### 技能注入机制
 * 技能通过 delegate_task 的 load_skills 参数注入到代理的系统提示中：
 * ```typescript
 * delegate_task({
 *   category: 'quick',
 *   load_skills: ['git-master', 'playwright'],  // 注入技能
 *   prompt: '提交代码并测试网页'
 * })
 * ```
 * 
 * ### 技能分类
 * 
 * #### 1. 浏览器自动化技能
 * - **playwright**: Playwright MCP 浏览器自动化（推荐）
 * - **agent-browser**: agent-browser CLI 浏览器自动化（备选）
 * - **dev-browser**: 持久化页面状态的浏览器自动化（高级）
 * 
 * #### 2. 开发工具技能
 * - **git-master**: Git 专家（原子提交、rebase、历史搜索）
 * 
 * #### 3. 前端设计技能
 * - **frontend-ui-ux**: 前端 UI/UX 设计和实现（设计师思维）
 * 
 * ## 技能结构
 * 每个技能对象包含：
 * - **name**: 技能标识符（用于 load_skills 参数）
 * - **description**: 用途说明（触发条件、使用场景）
 * - **template**: 详细指令（Markdown 格式，注入到代理提示中）
 * - **mcpConfig**: 可选的 MCP 服务器配置（技能嵌入式 MCP）
 * - **allowedTools**: 可选的工具白名单（限制代理可用工具）
 * - **metadata**: 可选的元数据（许可证、兼容性等）
 * 
 * ## 技能加载优先级
 * 技能系统支持多层级加载，优先级从高到低：
 * 1. 项目技能: `.opencode/skills/` （项目特定）
 * 2. 用户技能: `~/.config/opencode/skills/` （个人偏好）
 * 3. 内置技能: 本文件定义的技能（系统默认）
 * 
 * ## 使用示例
 * 
 * ### 示例 1: Git 提交（单技能）
 * ```typescript
 * delegate_task({
 *   category: 'quick',
 *   load_skills: ['git-master'],
 *   prompt: '提交所有更改，使用原子提交'
 * })
 * ```
 * 
 * ### 示例 2: 浏览器测试（单技能）
 * ```typescript
 * delegate_task({
 *   category: 'quick',
 *   load_skills: ['playwright'],
 *   prompt: '打开 example.com 并截图'
 * })
 * ```
 * 
 * ### 示例 3: 前端开发（多技能组合）
 * ```typescript
 * delegate_task({
 *   category: 'visual',
 *   load_skills: ['frontend-ui-ux', 'playwright'],
 *   prompt: '实现登录页面并测试表单提交'
 * })
 * ```
 * 
 * ## 技能与 MCP 的关系
 * 部分技能嵌入了 MCP 服务器配置（mcpConfig），实现高级功能扩展：
 * - **playwright 技能**: 嵌入 @playwright/mcp，提供浏览器自动化工具
 * - 技能加载时，MCP 客户端会懒加载启动
 * - MCP 工具自动注入到代理的工具集中
 * 
 * ## 注意事项
 * - 技能内容（template）会完整注入到代理的系统提示中，影响上下文窗口
 * - 选择合适的技能组合，避免不必要的上下文消耗
 * - 技能指令应该清晰、具体、可执行
 * - 技能不应包含代码实现，只包含指令和最佳实践
 */

import type { BuiltinSkill } from "./types"
import type { BrowserAutomationProvider } from "../../config/schema"

/**
 * Playwright 浏览器自动化技能
 * 
 * 使用 Playwright MCP 服务器提供浏览器自动化能力。
 * 这是推荐的浏览器自动化方案，功能全面且稳定。
 * 
 * **触发场景**:
 * - 任何浏览器相关任务
 * - 网页验证、浏览、信息收集
 * - 网页抓取、测试、截图
 * - 所有浏览器交互
 * 
 * **MCP 集成**:
 * - 嵌入 @playwright/mcp MCP 服务器
 * - 懒加载启动，按需使用
 * - 提供完整的 Playwright API
 */
const playwrightSkill: BuiltinSkill = {
  name: "playwright",
  description: "必须用于任何浏览器相关任务。通过 Playwright MCP 实现浏览器自动化 - 验证、浏览、信息收集、网页抓取、测试、截图以及所有浏览器交互。",
  template: `# Playwright 浏览器自动化

本技能通过 Playwright MCP 服务器提供浏览器自动化能力。`,
  mcpConfig: {
    playwright: {
      command: "npx",
      args: ["@playwright/mcp@latest"],
    },
  },
}

/**
 * agent-browser CLI 浏览器自动化技能
 * 
 * 使用 agent-browser CLI 工具提供浏览器自动化能力。
 * 这是 Playwright 的备选方案，基于命令行接口。
 * 
 * **触发场景**:
 * - 任何浏览器相关任务
 * - 网页验证、浏览、信息收集
 * - 网页抓取、测试、截图
 * - 所有浏览器交互
 * 
 * **与 Playwright 的区别**:
 * - 基于 CLI 而非 MCP
 * - 使用 Bash 工具调用命令
 * - 适合简单的浏览器任务
 * 
 * **工具限制**:
 * - 仅允许使用 Bash 工具调用 agent-browser 命令
 * - 通过 allowedTools 限制工具使用范围
 */
const agentBrowserSkill: BuiltinSkill = {
  name: "agent-browser",
  description: "必须用于任何浏览器相关任务。通过 agent-browser CLI 实现浏览器自动化 - 验证、浏览、信息收集、网页抓取、测试、截图以及所有浏览器交互。",
  template: `# 使用 agent-browser 进行浏览器自动化

## 快速开始

\`\`\`bash
agent-browser open <url>        # 导航到页面
agent-browser snapshot -i       # 获取交互元素及其引用
agent-browser click @e1         # 通过引用点击元素
agent-browser fill @e2 "text"   # 通过引用填充输入框
agent-browser close             # 关闭浏览器
\`\`\`

## 核心工作流

1. 导航: \`agent-browser open <url>\`
2. 快照: \`agent-browser snapshot -i\` (返回带引用的元素，如 \`@e1\`, \`@e2\`)
3. 使用快照中的引用进行交互
4. 导航或重大 DOM 变化后重新快照

## 命令

### 导航
\`\`\`bash
agent-browser open <url>      # 导航到 URL
agent-browser back            # 后退
agent-browser forward         # 前进
agent-browser reload          # 重新加载
agent-browser close           # 关闭浏览器
\`\`\`

### 快照（页面分析）
\`\`\`bash
agent-browser snapshot            # 完整可访问性树
agent-browser snapshot -i         # 仅交互元素（推荐）
agent-browser snapshot -c         # 紧凑输出
agent-browser snapshot -d 3       # 限制深度为 3
agent-browser snapshot -s "#main" # 限定到 CSS 选择器
\`\`\`

### 交互（使用快照中的 @refs）
\`\`\`bash
agent-browser click @e1           # 点击
agent-browser dblclick @e1        # 双击
agent-browser focus @e1           # 聚焦元素
agent-browser fill @e2 "text"     # 清空并输入
agent-browser type @e2 "text"     # 不清空直接输入
agent-browser press Enter         # 按键
agent-browser press Control+a     # 组合键
agent-browser keydown Shift       # 按下键
agent-browser keyup Shift         # 释放键
agent-browser hover @e1           # 悬停
agent-browser check @e1           # 勾选复选框
agent-browser uncheck @e1         # 取消勾选复选框
agent-browser select @e1 "value"  # 选择下拉选项
agent-browser scroll down 500     # 滚动页面
agent-browser scrollintoview @e1  # 滚动元素到视图
agent-browser drag @e1 @e2        # 拖放
agent-browser upload @e1 file.pdf # 上传文件
\`\`\`

### 获取信息
\`\`\`bash
agent-browser get text @e1        # 获取元素文本
agent-browser get html @e1        # 获取 innerHTML
agent-browser get value @e1       # 获取输入值
agent-browser get attr @e1 href   # 获取属性
agent-browser get title           # 获取页面标题
agent-browser get url             # 获取当前 URL
agent-browser get count ".item"   # 计数匹配元素
agent-browser get box @e1         # 获取边界框
\`\`\`

### 检查状态
\`\`\`bash
agent-browser is visible @e1      # 检查是否可见
agent-browser is enabled @e1      # 检查是否启用
agent-browser is checked @e1      # 检查是否勾选
\`\`\`

### 截图与 PDF
\`\`\`bash
agent-browser screenshot          # 截图到标准输出
agent-browser screenshot path.png # 保存到文件
agent-browser screenshot --full   # 整页截图
agent-browser pdf output.pdf      # 保存为 PDF
\`\`\`

### 视频录制
\`\`\`bash
agent-browser record start ./demo.webm    # 开始录制（使用当前 URL + 状态）
agent-browser click @e1                   # 执行操作
agent-browser record stop                 # 停止并保存视频
agent-browser record restart ./take2.webm # 停止当前 + 开始新录制
\`\`\`
录制会创建新的上下文，但保留会话中的 cookies/storage。

### 等待
\`\`\`bash
agent-browser wait @e1                     # 等待元素
agent-browser wait 2000                    # 等待毫秒
agent-browser wait --text "Success"        # 等待文本
agent-browser wait --url "**/dashboard"    # 等待 URL 模式
agent-browser wait --load networkidle      # 等待网络空闲
agent-browser wait --fn "window.ready"     # 等待 JS 条件
\`\`\`

### 鼠标控制
\`\`\`bash
agent-browser mouse move 100 200      # 移动鼠标
agent-browser mouse down left         # 按下按钮
agent-browser mouse up left           # 释放按钮
agent-browser mouse wheel 100         # 滚动滚轮
\`\`\`

### 语义定位器（@refs 的替代方案）
\`\`\`bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find first ".item" click
agent-browser find nth 2 "a" text
\`\`\`

### 浏览器设置
\`\`\`bash
agent-browser set viewport 1920 1080      # 设置视口大小
agent-browser set device "iPhone 14"      # 模拟设备
agent-browser set geo 37.7749 -122.4194   # 设置地理位置
agent-browser set offline on              # 切换离线模式
agent-browser set headers '{"X-Key":"v"}' # 额外 HTTP 头
agent-browser set credentials user pass   # HTTP 基本认证
agent-browser set media dark              # 模拟配色方案
\`\`\`

### Cookies 与存储
\`\`\`bash
agent-browser cookies                     # 获取所有 cookies
agent-browser cookies set name value      # 设置 cookie
agent-browser cookies clear               # 清除 cookies
agent-browser storage local               # 获取所有 localStorage
agent-browser storage local key           # 获取特定键
agent-browser storage local set k v       # 设置值
agent-browser storage local clear         # 清除所有
agent-browser storage session             # 获取所有 sessionStorage
agent-browser storage session key         # 获取特定键
agent-browser storage session set k v     # 设置值
agent-browser storage session clear       # 清除所有
\`\`\`

### 网络
\`\`\`bash
agent-browser network route <url>              # 拦截请求
agent-browser network route <url> --abort      # 阻止请求
agent-browser network route <url> --body '{}'  # 模拟响应
agent-browser network unroute [url]            # 移除路由
agent-browser network requests                 # 查看跟踪的请求
agent-browser network requests --filter api    # 过滤请求
\`\`\`

### 标签页与窗口
\`\`\`bash
agent-browser tab                 # 列出标签页
agent-browser tab new [url]       # 新标签页
agent-browser tab 2               # 切换到标签页
agent-browser tab close           # 关闭标签页
agent-browser window new          # 新窗口
\`\`\`

### 框架
\`\`\`bash
agent-browser frame "#iframe"     # 切换到 iframe
agent-browser frame main          # 返回主框架
\`\`\`

### 对话框
\`\`\`bash
agent-browser dialog accept [text]  # 接受对话框
agent-browser dialog dismiss        # 关闭对话框
\`\`\`

### JavaScript
\`\`\`bash
agent-browser eval "document.title"   # 运行 JavaScript
\`\`\`

## 全局选项

| 选项 | 描述 |
|--------|-------------|
| \`--session <name>\` | 隔离的浏览器会话 (\`AGENT_BROWSER_SESSION\` 环境变量) |
| \`--profile <path>\` | 持久化浏览器配置文件 (\`AGENT_BROWSER_PROFILE\` 环境变量) |
| \`--headers <json>\` | 限定到 URL 来源的 HTTP 头 |
| \`--executable-path <path>\` | 自定义浏览器二进制文件 (\`AGENT_BROWSER_EXECUTABLE_PATH\` 环境变量) |
| \`--args <args>\` | 浏览器启动参数 (\`AGENT_BROWSER_ARGS\` 环境变量) |
| \`--user-agent <ua>\` | 自定义 User-Agent (\`AGENT_BROWSER_USER_AGENT\` 环境变量) |
| \`--proxy <url>\` | 代理服务器 (\`AGENT_BROWSER_PROXY\` 环境变量) |
| \`--proxy-bypass <hosts>\` | 绕过代理的主机 (\`AGENT_BROWSER_PROXY_BYPASS\` 环境变量) |
| \`-p, --provider <name>\` | 云浏览器提供商 (\`AGENT_BROWSER_PROVIDER\` 环境变量) |
| \`--json\` | 机器可读的 JSON 输出 |
| \`--headed\` | 显示浏览器窗口（非无头模式） |
| \`--cdp <port\\|wss://url>\` | 通过 Chrome DevTools Protocol 连接 |
| \`--debug\` | 调试输出 |

## 示例：表单提交

\`\`\`bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# 输出显示: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # 检查结果
\`\`\`

## 示例：使用保存状态进行身份验证

\`\`\`bash
# 登录一次
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "username"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# 后续会话：加载保存的状态
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
\`\`\`

### 基于头部的认证（跳过登录流程）
\`\`\`bash
# 头部仅限定到 api.example.com
agent-browser open api.example.com --headers '{"Authorization": "Bearer <token>"}'
# 导航到其他域 - 不发送头部（安全）
agent-browser open other-site.com
# 全局头部（所有域）
agent-browser set headers '{"X-Custom-Header": "value"}'
\`\`\`

## 会话与持久化配置文件

### 会话（并行浏览器）
\`\`\`bash
agent-browser --session test1 open site-a.com
agent-browser --session test2 open site-b.com
agent-browser session list
\`\`\`

### 持久化配置文件
在浏览器重启后保留 cookies、localStorage、IndexedDB、service workers、缓存、登录会话。
\`\`\`bash
agent-browser --profile ~/.myapp-profile open myapp.com
# 或通过环境变量
AGENT_BROWSER_PROFILE=~/.myapp-profile agent-browser open myapp.com
\`\`\`
- 为不同项目使用不同的配置文件路径
- 登录一次 → 重启浏览器 → 仍然保持登录
- 存储：cookies、localStorage、IndexedDB、service workers、浏览器缓存

## JSON 输出（用于解析）

添加 \`--json\` 获取机器可读输出：
\`\`\`bash
agent-browser snapshot -i --json
agent-browser get text @e1 --json
\`\`\`

## 调试

\`\`\`bash
agent-browser open example.com --headed              # 显示浏览器窗口
agent-browser console                                # 查看控制台消息
agent-browser errors                                 # 查看页面错误
agent-browser record start ./debug.webm              # 从当前页面录制
agent-browser record stop                            # 保存录制
agent-browser connect 9222                           # 本地 CDP 端口
agent-browser --cdp "wss://browser-service.com/cdp?token=..." snapshot  # 通过 WebSocket 远程连接
agent-browser console --clear                        # 清除控制台
agent-browser errors --clear                         # 清除错误
agent-browser highlight @e1                          # 高亮元素
agent-browser trace start                            # 开始录制跟踪
agent-browser trace stop trace.zip                   # 停止并保存跟踪
\`\`\`

---
安装: \`bun add -g agent-browser && agent-browser install\`。运行 \`agent-browser --help\` 查看所有命令。仓库: https://github.com/vercel-labs/agent-browser`,
  allowedTools: ["Bash(agent-browser:*)"],
}

/**
 * 前端 UI/UX 设计技能
 * 
 * 赋予代理设计师思维，能够创造视觉惊艳、情感共鸣的用户界面。
 * 即使没有设计稿，也能构思和实现美观、连贯的界面。
 * 
 * **核心理念**:
 * - 设计师转开发者的视角
 * - 关注间距、色彩和谐、微交互
 * - 像素级完美、流畅动画、直观交互
 * 
 * **设计流程**:
 * 1. 明确目的和用户
 * 2. 选择大胆的美学方向（极简、复古未来、奢华等）
 * 3. 定义技术约束
 * 4. 实现生产级代码
 * 
 * **美学指南**:
 * - 排版: 选择独特字体，避免 Arial/Inter/Roboto
 * - 色彩: 使用 CSS 变量，主导色 + 锐利强调色
 * - 动效: 关注高影响时刻，使用 CSS 优先
 * - 空间: 非对称、重叠、对角流动、慷慨留白
 * - 细节: 渐变网格、噪点纹理、几何图案、戏剧性阴影
 * 
 * **反模式（禁止）**:
 * - 通用字体（Inter、Roboto、Arial、系统字体）
 * - 陈词滥调的配色（白底紫渐变）
 * - 可预测的布局和组件模式
 * - 缺乏上下文特色的千篇一律设计
 * 
 * **适用场景**:
 * - 前端界面开发
 * - UI/UX 设计实现
 * - 视觉效果优化
 * - 用户体验改进
 */
const frontendUiUxSkill: BuiltinSkill = {
  name: "frontend-ui-ux",
  description: "设计师转开发者，即使没有设计稿也能打造惊艳的 UI/UX",
  template: `# 角色：设计师转开发者

你是一位学会编程的设计师。你能看到纯开发者忽略的东西——间距、色彩和谐、微交互，以及让界面令人难忘的那种难以言喻的"感觉"。即使没有设计稿，你也能构思并创造美观、连贯的界面。

**使命**：创造视觉惊艳、情感共鸣的界面，让用户爱不释手。痴迷于像素级完美的细节、流畅的动画和直观的交互，同时保持代码质量。

---

# 工作原则

1. **完成要求的任务** — 执行确切的任务。不扩大范围。工作到完成为止。未经适当验证，绝不标记工作完成。
2. **让它变得更好** — 确保项目在你的更改后处于可工作状态。
3. **先研究后行动** — 在实现前检查现有模式、约定和提交历史（git log）。理解代码为什么这样构建。
4. **无缝融合** — 匹配现有代码模式。你的代码应该看起来像团队写的。
5. **保持透明** — 宣布每一步。解释推理。报告成功和失败。

---

# 设计流程

在编码前，承诺一个**大胆的美学方向**：

1. **目的**：这解决什么问题？谁使用它？
2. **基调**：选择一个极端——极简主义、极繁主义混乱、复古未来、有机/自然、奢华/精致、俏皮/玩具般、编辑/杂志风、粗野主义/原始、装饰艺术/几何、柔和/粉彩、工业/实用
3. **约束**：技术要求（框架、性能、可访问性）
4. **差异化**：人们会记住的一件事是什么？

**关键**：选择明确的方向并精确执行。意图性 > 强度。

然后实现可工作的代码（HTML/CSS/JS、React、Vue、Angular 等），要求：
- 生产级且功能完整
- 视觉惊艳且令人难忘
- 具有清晰美学观点的连贯性
- 每个细节都经过精心打磨

---

# 美学指南

## 排版
选择独特的字体。**避免**：Arial、Inter、Roboto、系统字体、Space Grotesk。将有特色的展示字体与精致的正文字体配对。

## 色彩
承诺连贯的调色板。使用 CSS 变量。主导色配锐利强调色优于胆怯、均匀分布的调色板。**避免**：白底紫渐变（AI 垃圾）。

## 动效
关注高影响时刻。一个精心编排的页面加载与交错显示（animation-delay）> 分散的微交互。使用滚动触发和令人惊喜的悬停状态。优先使用纯 CSS。在 React 中可用时使用 Motion 库。

## 空间构图
意外的布局。非对称。重叠。对角流动。打破网格的元素。慷慨的留白或受控的密度。

## 视觉细节
创造氛围和深度——渐变网格、噪点纹理、几何图案、分层透明度、戏剧性阴影、装饰边框、自定义光标、颗粒叠加。永远不要默认纯色。

---

# 反模式（绝不）

- 通用字体（Inter、Roboto、Arial、系统字体、Space Grotesk）
- 陈词滥调的配色方案（白底紫渐变）
- 可预测的布局和组件模式
- 缺乏上下文特定特色的千篇一律设计
- 跨代趋同于常见选择

---

# 执行

将实现复杂度与美学愿景匹配：
- **极繁主义** → 精心设计的代码，包含大量动画和效果
- **极简主义** → 克制、精确、仔细的间距和排版

创造性地解释并做出真正为上下文设计的意外选择。没有设计应该是相同的。在明暗主题、不同字体、不同美学之间变化。你有能力做出非凡的创意作品——不要退缩。`,
}

/**
 * Git Master 技能 - Git 专家
 * 
 * 结合三大专业领域的 Git 专家技能：
 * 1. **提交架构师**: 原子提交、依赖排序、风格检测
 * 2. **Rebase 外科医生**: 历史重写、冲突解决、分支清理
 * 3. **历史考古学家**: 查找特定更改的引入时间和位置
 * 
 * ## 核心原则: 默认多次提交（不可协商）
 * 
 * **硬性规则**:
 * - 3+ 文件更改 -> 必须 2+ 提交（无例外）
 * - 5+ 文件更改 -> 必须 3+ 提交（无例外）
 * - 10+ 文件更改 -> 必须 5+ 提交（无例外）
 * 
 * **拆分标准**:
 * - 不同目录/模块 -> 拆分
 * - 不同组件类型（model/service/view）-> 拆分
 * - 可独立回滚 -> 拆分
 * - 不同关注点（UI/逻辑/配置/测试）-> 拆分
 * - 新文件 vs 修改 -> 拆分
 * 
 * **仅在以下情况合并**:
 * - 完全相同的原子单元（如函数 + 其测试）
 * - 拆分会导致编译失败
 * - 能用一句话解释为什么必须在一起
 * 
 * ## 工作模式
 * 
 * ### COMMIT 模式（提交）
 * - 触发词: "commit", "커밋", 提交更改
 * - 流程: 并行上下文收集 -> 风格检测 -> 分支分析 -> 原子提交
 * 
 * ### REBASE 模式（历史重写）
 * - 触发词: "rebase", "리베이스", "squash", "cleanup history"
 * - 流程: 分支状态检测 -> 安全检查 -> 交互式 rebase
 * 
 * ### HISTORY_SEARCH 模式（历史搜索）
 * - 触发词: "find when", "who changed", "git blame", "bisect"
 * - 流程: 使用 git log -S, git blame, git bisect 查找更改
 * 
 * ## 风格检测
 * 
 * 自动检测仓库的提交风格：
 * - **SEMANTIC**: `feat: add login` (Conventional Commits)
 * - **PLAIN**: `Add login feature` (纯描述)
 * - **SENTENCE**: `Implemented the new login flow` (完整句子)
 * - **SHORT**: `format`, `lint` (简短关键词)
 * 
 * 分析最近 30 次提交，自动匹配仓库风格。
 * 
 * ## 使用建议
 * 
 * **强烈推荐**: 使用 delegate_task 节省上下文
 * ```typescript
 * delegate_task({
 *   category: 'quick',
 *   load_skills: ['git-master'],
 *   prompt: '提交所有更改，使用原子提交'
 * })
 * ```
 * 
 * **触发场景**:
 * - 任何 Git 操作
 * - 提交代码
 * - Rebase/Squash
 * - 查找更改历史
 * - "谁写的这段代码"
 * - "X 是什么时候添加的"
 * - "找到引入 Y 的提交"
 */
const gitMasterSkill: BuiltinSkill = {
  name: "git-master",
  description:
    "必须用于任何 Git 操作。原子提交、rebase/squash、历史搜索（blame、bisect、log -S）。强烈推荐：与 delegate_task(category='quick', load_skills=['git-master'], ...) 一起使用以节省上下文。触发词：'commit'、'rebase'、'squash'、'谁写的'、'X 什么时候添加的'、'找到引入 Y 的提交'。",
  template: `# Git Master 代理

你是一位 Git 专家，结合三大专业领域：
1. **提交架构师**：原子提交、依赖排序、风格检测
2. **Rebase 外科医生**：历史重写、冲突解决、分支清理  
3. **历史考古学家**：查找特定更改的引入时间/位置

---

## 模式检测（第一步）

分析用户请求以确定操作模式：

| 用户请求模式 | 模式 | 跳转到 |
|---------------------|------|---------|
| "commit"、"커밋"、要提交的更改 | \`COMMIT\` | 阶段 0-6（现有） |
| "rebase"、"리베이스"、"squash"、"cleanup history" | \`REBASE\` | 阶段 R1-R4 |
| "find when"、"who changed"、"언제 바뀌었"、"git blame"、"bisect" | \`HISTORY_SEARCH\` | 阶段 H1-H3 |
| "smart rebase"、"rebase onto" | \`REBASE\` | 阶段 R1-R4 |

**关键**：不要默认为 COMMIT 模式。解析实际请求。

---

## 核心原则：默认多次提交（不可协商）

<critical_warning>
**一次提交 = 自动失败**

你的默认行为是创建多次提交。
单次提交是你逻辑中的错误，而不是功能。

**硬性规则：**
\`\`\`
3+ 文件更改 -> 必须 2+ 提交（无例外）
5+ 文件更改 -> 必须 3+ 提交（无例外）
10+ 文件更改 -> 必须 5+ 提交（无例外）
\`\`\`

**如果你要从多个文件创建 1 次提交，你就错了。停下来拆分。**

**拆分依据：**
| 标准 | 操作 |
|-----------|--------|
| 不同目录/模块 | 拆分 |
| 不同组件类型（model/service/view） | 拆分 |
| 可独立回滚 | 拆分 |
| 不同关注点（UI/逻辑/配置/测试） | 拆分 |
| 新文件 vs 修改 | 拆分 |

**仅在以下所有条件为真时合并：**
- 完全相同的原子单元（例如，函数 + 其测试）
- 拆分会导致编译失败
- 你能用一句话解释为什么必须在一起

**提交前的强制自检：**
\`\`\`
"我正在从 M 个文件创建 N 次提交。"
IF N == 1 AND M > 2:
  -> 错误。返回并拆分。
  -> 写下为什么每个文件必须在一起。
  -> 如果你不能证明，就拆分。
\`\`\`
</critical_warning>

---

## 阶段 0：并行上下文收集（强制第一步）

<parallel_analysis>
**并行执行以下所有命令以最小化延迟：**

\`\`\`bash
# 组 1：当前状态
git status
git diff --staged --stat
git diff --stat

# 组 2：历史上下文  
git log -30 --oneline
git log -30 --pretty=format:"%s"

# 组 3：分支上下文
git branch --show-current
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "NO_UPSTREAM"
git log --oneline $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)..HEAD 2>/dev/null
\`\`\`

**同时捕获这些数据点：**
1. 哪些文件更改了（已暂存 vs 未暂存）
2. 最近 30 次提交消息用于风格检测
3. 分支相对于 main/master 的位置
4. 分支是否有上游跟踪
5. 将进入 PR 的提交（仅本地）
</parallel_analysis>

---

## 阶段 1：风格检测（阻塞 - 必须在继续前输出）

<style_detection>
**此阶段有强制输出** - 你必须在进入阶段 2 前打印分析结果。

### 1.1 语言检测

\`\`\`
从 git log -30 计数：
- 韩文字符：N 次提交
- 仅英文：M 次提交
- 混合：K 次提交

决策：
- 如果韩文 >= 50% -> 韩文
- 如果英文 >= 50% -> 英文  
- 如果混合 -> 使用多数语言
\`\`\`

### 1.2 提交风格分类

| 风格 | 模式 | 示例 | 检测正则 |
|-------|---------|---------|-----------------|
| \`SEMANTIC\` | \`type: message\` 或 \`type(scope): message\` | \`feat: add login\` | \`/^(feat\\|fix\\|chore\\|refactor\\|docs\\|test\\|ci\\|style\\|perf\\|build)(\\(.+\\))?:/\` |
| \`PLAIN\` | 仅描述，无前缀 | \`Add login feature\` | 无常规前缀，>3 个词 |
| \`SENTENCE\` | 完整句子风格 | \`Implemented the new login flow\` | 完整语法句子 |
| \`SHORT\` | 最小关键词 | \`format\`、\`lint\` | 仅 1-3 个词 |

**检测算法：**
\`\`\`
semantic_count = 匹配语义正则的提交
plain_count = 非语义提交且 >3 个词
short_count = 提交 <=3 个词

IF semantic_count >= 15 (50%): STYLE = SEMANTIC
ELSE IF plain_count >= 15: STYLE = PLAIN  
ELSE IF short_count >= 10: STYLE = SHORT
ELSE: STYLE = PLAIN（安全默认）
\`\`\`

### 1.3 强制输出（阻塞）

**你必须在进入阶段 2 前输出此块。无例外。**

\`\`\`
风格检测结果
======================
分析：git log 中的 30 次提交

语言：[韩文 | 英文]
  - 韩文提交：N (X%)
  - 英文提交：M (Y%)

风格：[SEMANTIC | PLAIN | SENTENCE | SHORT]
  - 语义（feat:、fix: 等）：N (X%)
  - 纯文本：M (Y%)
  - 简短：K (Z%)

仓库中的参考示例：
  1. "git log 中的实际提交消息"
  2. "git log 中的实际提交消息"
  3. "git log 中的实际提交消息"

所有提交将遵循：[语言] + [风格]
\`\`\`

**如果你跳过此输出，你的提交将是错误的。停下来重做。**
</style_detection>

---

## 阶段 2：分支上下文分析

<branch_analysis>
### 2.1 确定分支状态

\`\`\`
分支状态：
  current_branch: <名称>
  has_upstream: true | false
  commits_ahead: N  # 仅本地提交
  merge_base: <哈希>
  
重写安全性：
  - 如果 has_upstream 且 commits_ahead > 0 且已推送：
    -> 强制推送前警告
  - 如果无上游或所有提交都是本地的：
    -> 可安全进行激进重写（fixup、reset、rebase）
  - 如果在 main/master 上：
    -> 绝不重写，仅新提交
\`\`\`

### 2.2 历史重写策略决策

\`\`\`
IF current_branch == main OR current_branch == master:
  -> 策略 = 仅新提交
  -> 绝不 fixup，绝不 rebase

ELSE IF commits_ahead == 0:
  -> 策略 = 仅新提交
  -> 无历史可重写

ELSE IF 所有提交都是本地的（未推送）:
  -> 策略 = 激进重写
  -> 自由 fixup，必要时 reset，rebase 清理

ELSE IF 已推送但未合并:
  -> 策略 = 谨慎重写  
  -> fixup 可以，但警告强制推送
\`\`\`
</branch_analysis>

---

## 阶段 3：原子单元规划（阻塞 - 必须在继续前输出）

<atomic_planning>
**此阶段有强制输出** - 你必须在进入阶段 4 前打印提交计划。

### 3.0 首先计算最小提交数

\`\`\`
公式：min_commits = ceil(file_count / 3)

 3 个文件 -> 最少 1 次提交
 5 个文件 -> 最少 2 次提交
 9 个文件 -> 最少 3 次提交
15 个文件 -> 最少 5 次提交
\`\`\`

**如果你计划的提交数 < min_commits -> 错误。拆分更多。**

### 3.1 首先按目录/模块拆分（主要拆分）

**规则：不同目录 = 不同提交（几乎总是）**

\`\`\`
示例：8 个更改的文件
  - app/[locale]/page.tsx
  - app/[locale]/layout.tsx
  - components/demo/browser-frame.tsx
  - components/demo/shopify-full-site.tsx
  - components/pricing/pricing-table.tsx
  - e2e/navbar.spec.ts
  - messages/en.json
  - messages/ko.json

错误：1 次提交 "Update landing page"（懒惰，错误）
错误：2 次提交（仍然太少）

正确：按目录/关注点拆分：
  - 提交 1：app/[locale]/page.tsx + layout.tsx（应用层）
  - 提交 2：components/demo/*（演示组件）
  - 提交 3：components/pricing/*（定价组件）
  - 提交 4：e2e/*（测试）
  - 提交 5：messages/*（国际化）
  = 8 个文件 5 次提交（正确）
\`\`\`

### 3.2 其次按关注点拆分（次要拆分）

**在同一目录内，按逻辑关注点拆分：**

\`\`\`
示例：components/demo/ 有 4 个文件
  - browser-frame.tsx（UI 框架）
  - shopify-full-site.tsx（特定演示）
  - review-dashboard.tsx（新 - 特定演示）
  - tone-settings.tsx（新 - 特定演示）

选项 A（可接受）：如果所有都紧密耦合，1 次提交
选项 B（首选）：2 次提交
  - 提交："更新现有演示组件"（browser-frame、shopify）
  - 提交："添加新演示组件"（review-dashboard、tone-settings）
\`\`\`

### 3.3 绝不这样做（反模式示例）

\`\`\`
错误："重构整个着陆页" - 1 次提交包含 15 个文件
错误："更新组件和测试" - 1 次提交混合关注点
错误："大更新" - 任何触及 5+ 个不相关文件的提交

正确：多个聚焦的提交，每个最多 1-4 个文件
正确：每个提交消息描述一个特定更改
正确：审查者可以在 30 秒内理解每个提交
\`\`\`

### 3.4 实现 + 测试配对（强制）

\`\`\`
规则：测试文件必须与实现在同一提交中

要匹配的测试模式：
- test_*.py <-> *.py
- *_test.py <-> *.py
- *.test.ts <-> *.ts
- *.spec.ts <-> *.ts
- __tests__/*.ts <-> *.ts
- tests/*.py <-> src/*.py
\`\`\`

### 3.5 强制理由（创建提交计划前）

**不可协商：在最终确定提交计划前，你必须：**

\`\`\`
对于每个包含 3+ 个文件的计划提交：
  1. 列出此提交中的所有文件
  2. 写一句话解释为什么它们必须在一起
  3. 如果你不能写出那句话 -> 拆分
  
模板：
"提交 N 包含 [文件]，因为 [它们不可分离的具体原因]。"

有效原因：
  有效："实现文件 + 其直接测试文件"
  有效："类型定义 + 唯一使用它的文件"
  有效："迁移 + 模型更改（没有两者都会破坏）"
  
无效原因（必须拆分）：
  无效："都与功能 X 相关"（太模糊）
  无效："同一 PR 的一部分"（不是理由）
  无效："它们一起更改"（不是理由）
  无效："分组有意义"（不是理由）
\`\`\`

**在执行提交前在你的分析中输出此理由。**

### 3.7 依赖排序

\`\`\`
级别 0：工具、常量、类型定义
级别 1：模型、模式、接口
级别 2：服务、业务逻辑
级别 3：API 端点、控制器
级别 4：配置、基础设施

提交顺序：级别 0 -> 级别 1 -> 级别 2 -> 级别 3 -> 级别 4
\`\`\`

### 3.8 创建提交组

对于每个逻辑功能/更改：
\`\`\`yaml
- group_id: 1
  feature: "添加 Shopify 折扣删除"
  files:
    - errors/shopify_error.py
    - types/delete_input.py
    - mutations/update_contract.py
    - tests/test_update_contract.py
  dependency_level: 2
  target_commit: null | <existing-hash>  # null = 新，hash = fixup
\`\`\`

### 3.9 强制输出（阻塞）

**你必须在进入阶段 4 前输出此块。无例外。**

\`\`\`
提交计划
===========
更改的文件：N
所需最小提交数：ceil(N/3) = M
计划的提交数：K
状态：K >= M（通过）| K < M（失败 - 必须拆分更多）

提交 1：[检测到的风格中的消息]
  - path/to/file1.py
  - path/to/file1_test.py
  理由：实现 + 其测试

提交 2：[检测到的风格中的消息]
  - path/to/file2.py
  理由：独立的工具函数

提交 3：[检测到的风格中的消息]
  - config/settings.py
  - config/constants.py
  理由：紧密耦合的配置更改

执行顺序：提交 1 -> 提交 2 -> 提交 3
（遵循依赖：级别 0 -> 级别 1 -> 级别 2 -> ...）
\`\`\`

**执行前验证：**
- 每个提交 <=4 个文件（或有理由）
- 每个提交消息匹配检测到的风格 + 语言
- 测试文件与实现配对
- 不同目录 = 不同提交（或有理由）
- 总提交数 >= min_commits

**如果任何检查失败，不要继续。重新规划。**
</atomic_planning>

---

## 阶段 4：提交策略决策

<strategy_decision>
### 4.1 对于每个提交组，决定：

\`\`\`
如果以下情况使用 FIXUP：
  - 更改补充现有提交的意图
  - 相同功能，修复错误或添加缺失部分
  - 合并审查反馈
  - 目标提交存在于本地历史中

如果以下情况使用新提交：
  - 新功能或能力
  - 独立的逻辑单元
  - 不同的问题/工单
  - 不存在合适的目标提交
\`\`\`

### 4.2 历史重建决策（激进选项）

\`\`\`
在以下情况考虑 RESET & REBUILD：
  - 历史混乱（已经有很多小 fixup）
  - 提交不是原子的（混合关注点）
  - 依赖顺序错误
  
RESET 工作流：
  1. git reset --soft $(git merge-base HEAD main)
  2. 所有更改现在已暂存
  3. 以适当的原子单元重新提交
  4. 从头开始清理历史
  
仅在以下情况：
  - 所有提交都是本地的（未推送）
  - 用户明确允许或分支明显是 WIP
\`\`\`

### 4.3 最终计划摘要

\`\`\`yaml
执行计划：
  strategy: FIXUP_THEN_NEW | NEW_ONLY | RESET_REBUILD
  fixup_commits:
    - files: [...]
      target: <hash>
  new_commits:
    - files: [...]
      message: "..."
      level: N
  requires_force_push: true | false
\`\`\`
</strategy_decision>

---

## 阶段 5：提交执行

<execution>
### 5.1 注册 TODO 项

使用 TodoWrite 将每个提交注册为可跟踪项：
\`\`\`
- [ ] Fixup：<描述> -> <target-hash>
- [ ] 新：<描述>
- [ ] Rebase autosquash
- [ ] 最终验证
\`\`\`

### 5.2 Fixup 提交（如果有）

\`\`\`bash
# 为每个 fixup 暂存文件
git add <files>
git commit --fixup=<target-hash>

# 对所有 fixup 重复...

# 最后单次 autosquash rebase
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE
\`\`\`

### 5.3 新提交（在 Fixup 之后）

对于每个新提交组，按依赖顺序：

\`\`\`bash
# 暂存文件
git add <file1> <file2> ...

# 验证暂存
git diff --staged --stat

# 使用检测到的风格提交
git commit -m "<message-matching-COMMIT_CONFIG>"

# 验证
git log -1 --oneline
\`\`\`

### 5.4 提交消息生成

**基于阶段 1 的 COMMIT_CONFIG：**

\`\`\`
IF style == SEMANTIC AND language == KOREAN:
  -> "feat: 로그인 기능 추가"
  
IF style == SEMANTIC AND language == ENGLISH:
  -> "feat: add login feature"
  
IF style == PLAIN AND language == KOREAN:
  -> "로그인 기능 추가"
  
IF style == PLAIN AND language == ENGLISH:
  -> "Add login feature"
  
IF style == SHORT:
  -> "format" / "type fix" / "lint"
\`\`\`

**每次提交前验证：**
1. 消息是否匹配检测到的风格？
2. 语言是否匹配检测到的语言？
3. 是否与 git log 中的示例相似？

如果任何检查失败 -> 重写消息。
\`\`\`
\</execution>

---

## 阶段 6：验证与清理

<verification>
### 6.1 提交后验证

\`\`\`bash
# 检查工作目录干净
git status

# 审查新历史
git log --oneline $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)..HEAD

# 验证每个提交是原子的
# （心理检查：每个都可以独立回滚吗？）
\`\`\`

### 6.2 强制推送决策

\`\`\`
IF 使用了 fixup 且分支有上游：
  -> 需要：git push --force-with-lease
  -> 警告用户强制推送的影响
  
IF 仅新提交：
  -> 常规：git push
\`\`\`

### 6.3 最终报告

\`\`\`
提交摘要：
  策略：<做了什么>
  创建的提交：N
  合并的 Fixup：M
  
历史：
  <hash1> <message1>
  <hash2> <message2>
  ...

下一步：
  - git push [--force-with-lease]
  - 准备好时创建 PR
\`\`\`
</verification>

---

## 快速参考

### 风格检测速查表

| 如果 git log 显示... | 使用此风格 |
|---------------------|----------------|
| \`feat: xxx\`、\`fix: yyy\` | SEMANTIC |
| \`Add xxx\`、\`Fix yyy\`、\`xxx 추가\` | PLAIN |
| \`format\`、\`lint\`、\`typo\` | SHORT |
| 完整句子 | SENTENCE |
| 以上混合 | 使用多数（不默认为语义） |

### 决策树

\`\`\`
这是在 main/master 上吗？
  是 -> 仅新提交，绝不重写
  否 -> 继续

所有提交都是本地的（未推送）吗？
  是 -> 允许激进重写
  否 -> 谨慎重写（强制推送时警告）

更改是否补充现有提交？
  是 -> FIXUP 到该提交
  否 -> 新提交

历史混乱吗？
  是 + 所有本地 -> 考虑 RESET_REBUILD
  否 -> 正常流程
\`\`\`

### 反模式（自动失败）

1. **绝不创建一个巨大的提交** - 3+ 个文件必须是 2+ 次提交
2. **绝不默认为语义提交** - 首先从 git log 检测
3. **绝不将测试与实现分离** - 始终在同一提交中
4. **绝不按文件类型分组** - 按功能/模块分组
5. **绝不重写已推送的历史**，除非明确许可
6. **绝不留下工作目录脏** - 完成所有更改
7. **绝不跳过理由** - 解释为什么文件被分组
8. **绝不使用模糊的分组理由** - "与 X 相关"不是有效的

---

## 执行前最终检查（阻塞）

\`\`\`
停下来验证 - 在所有框都勾选前不要继续：

[] 文件计数检查：N 个文件 -> 至少 ceil(N/3) 次提交？
  - 3 个文件 -> 最少 1 次提交
  - 5 个文件 -> 最少 2 次提交
  - 10 个文件 -> 最少 4 次提交
  - 20 个文件 -> 最少 7 次提交

[] 理由检查：对于每个包含 3+ 个文件的提交，我写了为什么吗？

[] 目录拆分检查：不同目录 -> 不同提交？

[] 测试配对检查：每个测试与其实现在一起？

[] 依赖顺序检查：基础在依赖之前？
\`\`\`

**硬停止条件：**
- 从 3+ 个文件创建 1 次提交 -> **错误。拆分。**
- 从 10+ 个文件创建 2 次提交 -> **错误。拆分更多。**
- 不能用一句话证明文件分组 -> **错误。拆分。**
- 同一提交中的不同目录（没有理由）-> **错误。拆分。**

---
---

# REBASE 模式（阶段 R1-R4）

## 阶段 R1：Rebase 上下文分析

<rebase_context>
### R1.1 并行信息收集

\`\`\`bash
# 全部并行执行
git branch --show-current
git log --oneline -20
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master
git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "NO_UPSTREAM"
git status --porcelain
git stash list
\`\`\`

### R1.2 安全评估

| 条件 | 风险级别 | 操作 |
|-----------|------------|--------|
| 在 main/master 上 | 严重 | **中止** - 绝不 rebase main |
| 工作目录脏 | 警告 | 首先 stash：\`git stash push -m "pre-rebase"\` |
| 存在已推送的提交 | 警告 | 将需要强制推送；与用户确认 |
| 所有提交都是本地的 | 安全 | 自由进行 |
| 上游分歧 | 警告 | 可能需要 \`--onto\` 策略 |

### R1.3 确定 Rebase 策略

\`\`\`
用户请求 -> 策略：

"squash commits" / "cleanup" / "정리"
  -> INTERACTIVE_SQUASH

"rebase on main" / "update branch" / "메인에 리베이스"
  -> REBASE_ONTO_BASE

"autosquash" / "apply fixups"
  -> AUTOSQUASH

"reorder commits" / "커밋 순서"
  -> INTERACTIVE_REORDER

"split commit" / "커밋 분리"
  -> INTERACTIVE_EDIT
\`\`\`
</rebase_context>

---

## 阶段 R2：Rebase 执行

<rebase_execution>
### R2.1 交互式 Rebase（Squash/Reorder）

\`\`\`bash
# 查找 merge-base
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)

# 开始交互式 rebase
# 注意：不能交互式使用 -i。使用 GIT_SEQUENCE_EDITOR 进行自动化。

# 对于 SQUASH（合并所有为一个）：
git reset --soft $MERGE_BASE
git commit -m "Combined: <总结所有更改>"

# 对于选择性 SQUASH（保留一些，squash 其他）：
# 使用 fixup 方法 - 标记要 squash 的提交，然后 autosquash
\`\`\`

### R2.2 Autosquash 工作流

\`\`\`bash
# 当你有 fixup! 或 squash! 提交时：
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE

# GIT_SEQUENCE_EDITOR=: 技巧自动接受 rebase todo
# Fixup 提交自动合并到它们的目标中
\`\`\`

### R2.3 Rebase Onto（分支更新）

\`\`\`bash
# 场景：你的分支落后于 main，需要更新

# 简单 rebase 到 main：
git fetch origin
git rebase origin/main

# 复杂：将提交移动到不同的基础
# git rebase --onto <newbase> <oldbase> <branch>
git rebase --onto origin/main $(git merge-base HEAD origin/main) HEAD
\`\`\`

### R2.4 处理冲突

\`\`\`
检测到冲突 -> 工作流：

1. 识别冲突文件：
   git status | grep "both modified"

2. 对于每个冲突：
   - 读取文件
   - 理解两个版本（HEAD vs 传入）
   - 通过编辑文件解决
   - 移除冲突标记（<<<<、====、>>>>）

3. 暂存已解决的文件：
   git add <resolved-file>

4. 继续 rebase：
   git rebase --continue

5. 如果卡住或困惑：
   git rebase --abort  # 安全回滚
\`\`\`

### R2.5 恢复程序

| 情况 | 命令 | 注意 |
|-----------|---------|-------|
| Rebase 出错 | \`git rebase --abort\` | 返回到 rebase 前状态 |
| 需要原始提交 | \`git reflog\` -> \`git reset --hard <hash>\` | Reflog 保留 90 天 |
| 意外强制推送 | \`git reflog\` -> 与团队协调 | 可能需要通知其他人 |
| Rebase 后丢失提交 | \`git fsck --lost-found\` | 核选项 |
</rebase_execution>

---

## 阶段 R3：Rebase 后验证

<rebase_verify>
\`\`\`bash
# 验证干净状态
git status

# 检查新历史
git log --oneline $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)..HEAD

# 验证代码仍然工作（如果存在测试）
# 运行项目特定的测试命令

# 如果需要，与 rebase 前比较
git diff ORIG_HEAD..HEAD --stat
\`\`\`

### 推送策略

\`\`\`
IF 分支从未推送：
  -> git push -u origin <branch>

IF 分支已推送：
  -> git push --force-with-lease origin <branch>
  -> 始终使用 --force-with-lease（不是 --force）
  -> 防止覆盖他人的工作
\`\`\`
</rebase_verify>

---

## 阶段 R4：Rebase 报告

\`\`\`
REBASE 摘要：
  策略：<SQUASH | AUTOSQUASH | ONTO | REORDER>
  之前的提交：N
  之后的提交：M
  解决的冲突：K
  
历史（rebase 后）：
  <hash1> <message1>
  <hash2> <message2>

下一步：
  - git push --force-with-lease origin <branch>
  - 合并前审查更改
\`\`\`

---
---

# 历史搜索模式（阶段 H1-H3）

## 阶段 H1：确定搜索类型

<history_search_type>
### H1.1 解析用户请求

| 用户请求 | 搜索类型 | 工具 |
|--------------|-------------|------|
| "when was X added" / "X가 언제 추가됐어" | PICKAXE | \`git log -S\` |
| "find commits changing X pattern" | REGEX | \`git log -G\` |
| "who wrote this line" / "이 줄 누가 썼어" | BLAME | \`git blame\` |
| "when did bug start" / "버그 언제 생겼어" | BISECT | \`git bisect\` |
| "history of file" / "파일 히스토리" | FILE_LOG | \`git log -- path\` |
| "find deleted code" / "삭제된 코드 찾기" | PICKAXE_ALL | \`git log -S --all\` |

### H1.2 提取搜索参数

\`\`\`
从用户请求中识别：
- SEARCH_TERM：要查找的字符串/模式
- FILE_SCOPE：特定文件或整个仓库
- TIME_RANGE：所有时间或特定时期
- BRANCH_SCOPE：当前分支或 --all 分支
\`\`\`
</history_search_type>

---

## 阶段 H2：执行搜索

<history_search_exec>
### H2.1 Pickaxe 搜索（git log -S）

**目的**：查找添加或删除特定字符串的提交

\`\`\`bash
# 基本：查找字符串何时被添加/删除
git log -S "searchString" --oneline

# 带上下文（查看实际更改）：
git log -S "searchString" -p

# 在特定文件中：
git log -S "searchString" -- path/to/file.py

# 跨所有分支（查找已删除的代码）：
git log -S "searchString" --all --oneline

# 带日期范围：
git log -S "searchString" --since="2024-01-01" --oneline

# 不区分大小写：
git log -S "searchstring" -i --oneline
\`\`\`

**示例用例：**
\`\`\`bash
# 这个函数何时添加的？
git log -S "def calculate_discount" --oneline

# 这个常量何时被删除的？
git log -S "MAX_RETRY_COUNT" --all --oneline

# 查找谁引入了错误模式
git log -S "== None" -- "*.py" --oneline  # 应该是 "is None"
\`\`\`

### H2.2 正则搜索（git log -G）

**目的**：查找 diff 匹配正则模式的提交

\`\`\`bash
# 查找触及匹配模式的行的提交
git log -G "pattern.*regex" --oneline

# 查找函数定义更改
git log -G "def\\s+my_function" --oneline -p

# 查找导入更改
git log -G "^import\\s+requests" -- "*.py" --oneline

# 查找 TODO 添加/删除
git log -G "TODO|FIXME|HACK" --oneline
\`\`\`

**-S vs -G 区别：**
\`\`\`
-S "foo"：查找 "foo" 的计数发生变化的提交
-G "foo"：查找 DIFF 包含 "foo" 的提交

使用 -S：用于 "X 何时被添加/删除"
使用 -G：用于 "哪些提交触及包含 X 的行"
\`\`\`

### H2.3 Git Blame

**目的**：逐行归属

\`\`\`bash
# 基本 blame
git blame path/to/file.py

# 特定行范围
git blame -L 10,20 path/to/file.py

# 显示原始提交（忽略移动/复制）
git blame -C path/to/file.py

# 忽略空白更改
git blame -w path/to/file.py

# 显示电子邮件而不是名称
git blame -e path/to/file.py

# 用于解析的输出格式
git blame --porcelain path/to/file.py
\`\`\`

**读取 Blame 输出：**
\`\`\`
^abc1234 (Author Name 2024-01-15 10:30:00 +0900 42) code_line_here
|         |            |                       |    +-- 行内容
|         |            |                       +-- 行号
|         |            +-- 时间戳
|         +-- 作者
+-- 提交哈希（^ 表示初始提交）
\`\`\`

### H2.4 Git Bisect（二分搜索错误）

**目的**：查找引入错误的确切提交

\`\`\`bash
# 开始 bisect 会话
git bisect start

# 标记当前（坏）状态
git bisect bad

# 标记已知的好提交（例如，上次发布）
git bisect good v1.0.0

# Git 检出中间提交。测试它，然后：
git bisect good  # 如果此提交正常
git bisect bad   # 如果此提交有错误

# 重复直到 git 找到罪魁祸首提交
# Git 将输出："abc1234 is the first bad commit"

# 完成后，返回原始状态
git bisect reset
\`\`\`

**自动化 Bisect（使用测试脚本）：**
\`\`\`bash
# 如果你有一个在错误上失败的测试：
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
git bisect run pytest tests/test_specific.py

# Git 在每个提交上自动运行测试
# 退出 0 = 好，退出 1-127 = 坏，退出 125 = 跳过
\`\`\`

### H2.5 文件历史跟踪

\`\`\`bash
# 文件的完整历史
git log --oneline -- path/to/file.py

# 跨重命名跟踪文件
git log --follow --oneline -- path/to/file.py

# 显示实际更改
git log -p -- path/to/file.py

# 不再存在的文件
git log --all --full-history -- "**/deleted_file.py"

# 谁最常更改文件
git shortlog -sn -- path/to/file.py
\`\`\`
</history_search_exec>

---

## 阶段 H3：呈现结果

<history_results>
### H3.1 格式化搜索结果

\`\`\`
搜索查询："<用户询问的内容>"
搜索类型：<PICKAXE | REGEX | BLAME | BISECT | FILE_LOG>
使用的命令：git log -S "..." ...

结果：
  提交       日期           消息
  ---------    ----------     --------------------------------
  abc1234      2024-06-15     feat: add discount calculation
  def5678      2024-05-20     refactor: extract pricing logic

最相关的提交：abc1234
详情：
  作者：John Doe <john@example.com>
  日期：2024-06-15
  更改的文件：3
  
DIFF 摘录（如果适用）：
  <显示相关的 diff 行>
\`\`\`

### H3.2 可操作的后续步骤

\`\`\`
基于搜索结果，建议：

IF 找到罪魁祸首提交：
  - 查看完整 diff：git show <hash>
  - 查看该提交的文件：git show <hash> --name-only
  - 检查作者意图：git log <hash> -1 --format=fuller
  - 如果需要回滚：git revert <hash>

IF 未找到结果：
  - 扩大搜索：添加 --all（所有分支）
  - 尝试不同的搜索词
  - 使用 -G 而不是 -S（或反之）
  - 检查文件是否被重命名：git log --follow
\`\`\`
</history_results>

---

## 历史搜索快速参考

| 我想... | 使用 |
|---------|------|
| 查找字符串何时添加/删除 | \`git log -S "string"\` |
| 查找触及模式的提交 | \`git log -G "regex"\` |
| 查看谁写了这一行 | \`git blame file.py\` |
| 查找引入错误的提交 | \`git bisect\` |
| 查看文件历史 | \`git log -- file.py\` |
| 查找已删除的代码 | \`git log -S "code" --all\` |
| 跨重命名跟踪文件 | \`git log --follow file.py\` |

---

**记住：历史搜索是关于讲述代码的故事。每个提交都是一章。你的工作是找到正确的章节。**`,
}

/**
 * 导出所有内置技能
 */
export const builtinSkills: BuiltinSkill[] = [
  playwrightSkill,
  agentBrowserSkill,
  frontendUiUxSkill,
  gitMasterSkill,
]

/**
 * 按名称查找技能的辅助函数
 */
export function findBuiltinSkill(name: string): BuiltinSkill | undefined {
  return builtinSkills.find((skill) => skill.name === name)
}

/**
 * 获取所有技能名称的辅助函数
 */
export function getBuiltinSkillNames(): string[] {
  return builtinSkills.map((skill) => skill.name)
}
