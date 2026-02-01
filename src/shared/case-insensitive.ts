/**
 * 大小写不敏感工具 - agent/配置名称的不区分大小写查找和比较
 * Case-insensitive utilities - Case-insensitive lookup and comparison for agent/config names
 * 
 * 用途:
 * - 允许 "Oracle", "oracle", "ORACLE" 等价使用
 * - 提高配置的用户友好性
 * - 统一agent名称处理
 * 
 * Usage:
 * - Allow "Oracle", "oracle", "ORACLE" to work the same
 * - Improve config user-friendliness
 * - Unify agent name handling
 * 
 * @module case-insensitive
 */

/**
 * 使用大小写不敏感的键匹配在对象中查找值
 * Find a value in an object using case-insensitive key matching
 * 
 * 优先尝试精确匹配，然后回退到小写比较
 * First tries exact match, then falls back to lowercase comparison
 */
export function findCaseInsensitive<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  if (!obj) return undefined
  const exactMatch = obj[key]
  if (exactMatch !== undefined) return exactMatch
  const lowerKey = key.toLowerCase()
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === lowerKey) return v
  }
  return undefined
}

/**
 * 检查数组是否包含值 (大小写不敏感)
 * Check if an array includes a value using case-insensitive comparison
 */
export function includesCaseInsensitive(arr: string[], value: string): boolean {
  const lowerValue = value.toLowerCase()
  return arr.some((item) => item.toLowerCase() === lowerValue)
}

/**
 * 在数组中使用大小写不敏感的名称匹配查找元素
 * Find an element in array using case-insensitive name matching
 * 
 * 用于按名称查找agents/categories
 * Useful for finding agents/categories by name
 */
export function findByNameCaseInsensitive<T extends { name: string }>(
  arr: T[],
  name: string
): T | undefined {
  const lowerName = name.toLowerCase()
  return arr.find((item) => item.name.toLowerCase() === lowerName)
}

/**
 * 检查两个字符串是否相等 (大小写不敏感)
 * Check if two strings are equal (case-insensitive)
 */
export function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
