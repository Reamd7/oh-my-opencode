import type { AnalyzeResult, SgResult } from "./types"

/**
 * 格式化搜索结果为用户友好的文本
 * 
 * 输出格式：
 * - 错误信息（如果有）
 * - 截断警告（如果结果被截断）
 * - 匹配数量统计
 * - 每个匹配的位置和代码片段
 */
export function formatSearchResult(result: SgResult): string {
  if (result.error) {
    return `Error: ${result.error}`
  }

  if (result.matches.length === 0) {
    return "No matches found"
  }

  const lines: string[] = []

  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches"
      ? `showing first ${result.matches.length} of ${result.totalMatches}`
      : result.truncatedReason === "max_output_bytes"
      ? "output exceeded 1MB limit"
      : "search timed out"
    lines.push(`[TRUNCATED] Results truncated (${reason})\n`)
  }

  lines.push(`Found ${result.matches.length} match(es)${result.truncated ? ` (truncated from ${result.totalMatches})` : ""}:\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    lines.push(`  ${match.lines.trim()}`)
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * 格式化替换结果为用户友好的文本
 * 
 * @param result - AST-grep执行结果
 * @param isDryRun - 是否为dry-run模式（预览模式）
 */
export function formatReplaceResult(result: SgResult, isDryRun: boolean): string {
  if (result.error) {
    return `Error: ${result.error}`
  }

  if (result.matches.length === 0) {
    return "No matches found to replace"
  }

  const prefix = isDryRun ? "[DRY RUN] " : ""
  const lines: string[] = []

  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches"
      ? `showing first ${result.matches.length} of ${result.totalMatches}`
      : result.truncatedReason === "max_output_bytes"
      ? "output exceeded 1MB limit"
      : "search timed out"
    lines.push(`[TRUNCATED] Results truncated (${reason})\n`)
  }

  lines.push(`${prefix}${result.matches.length} replacement(s):\n`)

  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`
    lines.push(`${loc}`)
    lines.push(`  ${match.text}`)
    lines.push("")
  }

  if (isDryRun) {
    lines.push("Use dryRun=false to apply changes")
  }

  return lines.join("\n")
}

/**
 * 格式化分析结果
 * 
 * @param results - 分析结果列表
 * @param extractedMetaVars - 是否提取并显示meta变量
 */
export function formatAnalyzeResult(results: AnalyzeResult[], extractedMetaVars: boolean): string {
  if (results.length === 0) {
    return "No matches found"
  }

  const lines: string[] = [`Found ${results.length} match(es):\n`]

  for (const result of results) {
    const loc = `L${result.range.start.line + 1}:${result.range.start.column + 1}`
    lines.push(`[${loc}] (${result.kind})`)
    lines.push(`  ${result.text}`)

    if (extractedMetaVars && result.metaVariables.length > 0) {
      lines.push("  Meta-variables:")
      for (const mv of result.metaVariables) {
        lines.push(`    $${mv.name} = "${mv.text}" (${mv.kind})`)
      }
    }
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * 格式化转换结果
 * 
 * @param _original - 原始代码（未使用）
 * @param transformed - 转换后的代码
 * @param editCount - 编辑次数
 */
export function formatTransformResult(_original: string, transformed: string, editCount: number): string {
  if (editCount === 0) {
    return "No matches found to transform"
  }

  return `Transformed (${editCount} edit(s)):\n\`\`\`\n${transformed}\n\`\`\``
}
