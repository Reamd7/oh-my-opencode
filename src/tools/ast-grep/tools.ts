import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { CLI_LANGUAGES } from "./constants"
import { runSg } from "./cli"
import { formatSearchResult, formatReplaceResult } from "./utils"
import type { CliLanguage } from "./types"

/**
 * 向用户显示输出结果
 * 通过metadata回调将结果传递给OpenCode UI
 */
function showOutputToUser(context: unknown, output: string): void {
  const ctx = context as { metadata?: (input: { metadata: { output: string } }) => void }
  ctx.metadata?.({ metadata: { output } })
}

/**
 * 获取空结果提示
 * 当搜索无结果时，根据语言和模式提供修正建议
 * 
 * 常见错误：
 * - Python: 函数/类定义末尾不应有冒号
 * - JS/TS: 函数模式需要包含参数和函数体
 */
function getEmptyResultHint(pattern: string, lang: CliLanguage): string | null {
  const src = pattern.trim()

  if (lang === "python") {
    if (src.startsWith("class ") && src.endsWith(":")) {
      const withoutColon = src.slice(0, -1)
      return `Hint: Remove trailing colon. Try: "${withoutColon}"`
    }
    if ((src.startsWith("def ") || src.startsWith("async def ")) && src.endsWith(":")) {
      const withoutColon = src.slice(0, -1)
      return `Hint: Remove trailing colon. Try: "${withoutColon}"`
    }
  }

  if (["javascript", "typescript", "tsx"].includes(lang)) {
    if (/^(export\s+)?(async\s+)?function\s+\$[A-Z_]+\s*$/i.test(src)) {
      return `Hint: Function patterns need params and body. Try "function $NAME($$$) { $$$ }"`
    }
  }

  return null
}

/**
 * AST-grep搜索工具
 * 
 * 使用AST（抽象语法树）进行代码搜索，比正则表达式更精确。
 * 
 * ## 与正则表达式的区别
 * - 正则：文本匹配，容易误匹配（如注释、字符串中的代码）
 * - AST-grep：结构匹配，只匹配真实的代码结构
 * 
 * ## Meta变量语法
 * - `$VAR`: 匹配单个AST节点（如变量名、表达式）
 * - `$$$`: 匹配多个节点（如参数列表、语句块）
 * 
 * ## 重要：模式必须是完整的AST节点
 * ❌ 错误: `export async function $NAME`（不完整）
 * ✅ 正确: `export async function $NAME($$$) { $$$ }`（完整的函数定义）
 */
export const ast_grep_search: ToolDefinition = tool({
  description:
    "Search code patterns across filesystem using AST-aware matching. Supports 25 languages. " +
    "Use meta-variables: $VAR (single node), $$$ (multiple nodes). " +
    "IMPORTANT: Patterns must be complete AST nodes (valid code). " +
    "For functions, include params and body: 'export async function $NAME($$$) { $$$ }' not 'export async function $NAME'. " +
    "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern with meta-variables ($VAR, $$$). Must be complete AST node."),
    lang: tool.schema.enum(CLI_LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search (default: ['.'])"),
    globs: tool.schema.array(tool.schema.string()).optional().describe("Include/exclude globs (prefix ! to exclude)"),
    context: tool.schema.number().optional().describe("Context lines around match"),
  },
  execute: async (args, context) => {
    try {
      const result = await runSg({
        pattern: args.pattern,
        lang: args.lang as CliLanguage,
        paths: args.paths,
        globs: args.globs,
        context: args.context,
      })

      let output = formatSearchResult(result)

      if (result.matches.length === 0 && !result.error) {
        const hint = getEmptyResultHint(args.pattern, args.lang as CliLanguage)
        if (hint) {
          output += `\n\n${hint}`
        }
      }

      showOutputToUser(context, output)
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      showOutputToUser(context, output)
      return output
    }
  },
})

/**
 * AST-grep替换工具
 * 
 * 使用AST进行代码替换，比正则替换更安全。
 * 
 * ## Dry-run模式（默认）
 * - 默认只预览更改，不实际修改文件
 * - 设置 `dryRun=false` 才会真正修改文件
 * 
 * ## Meta变量复用
 * 在rewrite中使用pattern中的meta变量，保留匹配的内容：
 * - pattern: `console.log($MSG)`
 * - rewrite: `logger.info($MSG)`
 * - 结果: `console.log("hello")` → `logger.info("hello")`
 */
export const ast_grep_replace: ToolDefinition = tool({
  description:
    "Replace code patterns across filesystem with AST-aware rewriting. " +
    "Dry-run by default. Use meta-variables in rewrite to preserve matched content. " +
    "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern to match"),
    rewrite: tool.schema.string().describe("Replacement pattern (can use $VAR from pattern)"),
    lang: tool.schema.enum(CLI_LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search"),
    globs: tool.schema.array(tool.schema.string()).optional().describe("Include/exclude globs"),
    dryRun: tool.schema.boolean().optional().describe("Preview changes without applying (default: true)"),
  },
  execute: async (args, context) => {
    try {
      const result = await runSg({
        pattern: args.pattern,
        rewrite: args.rewrite,
        lang: args.lang as CliLanguage,
        paths: args.paths,
        globs: args.globs,
        updateAll: args.dryRun === false,
      })
      const output = formatReplaceResult(result, args.dryRun !== false)
      showOutputToUser(context, output)
      return output
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      showOutputToUser(context, output)
      return output
    }
  },
})


