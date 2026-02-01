/**
 * 工具名称转换器 - 将工具名称转换为显示格式
 * Tool name transformer - Convert tool names to display format
 * 
 * 功能:
 * - 特殊工具名称映射 (webfetch -> WebFetch)
 * - kebab-case/snake_case转PascalCase
 * - 首字母大写
 * 
 * Features:
 * - Special tool name mappings (webfetch -> WebFetch)
 * - kebab-case/snake_case to PascalCase
 * - Capitalize first letter
 * 
 * @module tool-name
 */

// 特殊工具名称映射 - 保持特定的大小写格式
// Special tool name mappings - Preserve specific casing
const SPECIAL_TOOL_MAPPINGS: Record<string, string> = {
  webfetch: "WebFetch",
  websearch: "WebSearch",
  todoread: "TodoRead",
  todowrite: "TodoWrite",
}

/**
 * 将字符串转换为PascalCase
 * Convert string to PascalCase
 * 
 * @example
 * toPascalCase("my-tool-name") // "MyToolName"
 * toPascalCase("my_tool_name") // "MyToolName"
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
}

/**
 * 转换工具名称为显示格式
 * Transform tool name to display format
 * 
 * 转换规则:
 * 1. 检查特殊映射表
 * 2. 如果包含 - 或 _，转换为PascalCase
 * 3. 否则仅首字母大写
 * 
 * Transform rules:
 * 1. Check special mappings
 * 2. If contains - or _, convert to PascalCase
 * 3. Otherwise just capitalize first letter
 * 
 * @example
 * transformToolName("webfetch") // "WebFetch"
 * transformToolName("my-tool") // "MyTool"
 * transformToolName("read") // "Read"
 */
export function transformToolName(toolName: string): string {
  const lower = toolName.toLowerCase()
  if (lower in SPECIAL_TOOL_MAPPINGS) {
    return SPECIAL_TOOL_MAPPINGS[lower]
  }

  if (toolName.includes("-") || toolName.includes("_")) {
    return toPascalCase(toolName)
  }

  return toolName.charAt(0).toUpperCase() + toolName.slice(1)
}
