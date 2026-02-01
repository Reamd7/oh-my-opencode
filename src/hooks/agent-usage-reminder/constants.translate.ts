import { join } from "node:path";
import { getOpenCodeStorageDir } from "../../shared/data-path";

export const OPENCODE_STORAGE = getOpenCodeStorageDir();
export const AGENT_USAGE_REMINDER_STORAGE = join(
  OPENCODE_STORAGE,
  "agent-usage-reminder",
);

// All tool names normalized to lowercase for case-insensitive matching
export const TARGET_TOOLS = new Set([
  "grep",
  "safe_grep",
  "glob",
  "safe_glob",
  "webfetch",
  "context7_resolve-library-id",
  "context7_query-docs",
  "websearch_web_search_exa",
  "context7_get-library-docs",
  "grep_app_searchgithub",
]);

export const AGENT_TOOLS = new Set([
  "task",
  "call_omo_agent",
  "delegate_task",
]);

export const REMINDER_MESSAGE = `
[代理使用提醒]

您直接调用了搜索/获取工具，而没有利用专门的代理。

推荐：使用 delegate_task 配合 explore/librarian 代理以获得更好的结果：

\`\`\`
// 并行探索 - 同时启动多个代理
delegate_task(agent="explore", prompt="Find all files matching pattern X")
delegate_task(agent="explore", prompt="Search for implementation of Y") 
delegate_task(agent="librarian", prompt="Lookup documentation for Z")

// 然后在它们在后台运行时继续您的工作
// 系统会在每个任务完成时通知您
\`\`\`

原因：
- 代理可以执行更深入、更彻底的搜索
- 后台任务并行运行，节省时间
- 专门的代理具有领域专业知识
- 减少主会话中的上下文窗口使用

始终优先选择：多个并行的 delegate_task 调用 > 直接工具调用
`;
