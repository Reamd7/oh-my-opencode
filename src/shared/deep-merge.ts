/**
 * 深度对象合并工具 - 原型污染安全的递归合并
 * Deep object merge utility - Prototype pollution safe recursive merge
 * 
 * 安全特性:
 * - 防止原型污染 (过滤 __proto__, constructor, prototype)
 * - 最大深度限制 (MAX_DEPTH=50) 防止栈溢出
 * - 仅合并纯对象，不合并类实例
 * 
 * Safety features:
 * - Prevents prototype pollution (filters __proto__, constructor, prototype)
 * - Max depth limit (MAX_DEPTH=50) prevents stack overflow
 * - Only merges plain objects, not class instances
 * 
 * @module deep-merge
 */

// 危险的键名 - 可能导致原型污染攻击
// Dangerous keys - can lead to prototype pollution attacks
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// 最大递归深度 - 防止栈溢出
// Maximum recursion depth - prevents stack overflow
const MAX_DEPTH = 50;

/**
 * 检查值是否为纯对象 (非数组、非null、非类实例)
 * Check if value is a plain object (not array, not null, not class instance)
 * 
 * @param value - 要检查的值
 * @returns true 如果是纯对象
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * 深度合并两个对象，override值优先
 * Deep merges two objects, with override values taking precedence
 * 
 * 合并规则:
 * - 对象递归合并
 * - 数组替换 (不拼接)
 * - override中的undefined值不覆盖base值
 * 
 * Merge rules:
 * - Objects are recursively merged
 * - Arrays are replaced (not concatenated)
 * - undefined values in override do not overwrite base values
 *
 * @example
 * deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 10 }, e: 5 })
 * // => { a: 1, b: { c: 10, d: 3 }, e: 5 }
 */
export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>, depth?: number): T;
export function deepMerge<T extends Record<string, unknown>>(base: T | undefined, override: T | undefined, depth?: number): T | undefined;
export function deepMerge<T extends Record<string, unknown>>(
  base: T | undefined,
  override: T | undefined,
  depth = 0
): T | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  if (depth > MAX_DEPTH) return override ?? base;

  const result = { ...base } as Record<string, unknown>;

  for (const key of Object.keys(override)) {
    if (DANGEROUS_KEYS.has(key)) continue;

    const baseValue = base[key];
    const overrideValue = override[key];

    if (overrideValue === undefined) continue;

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue, depth + 1);
    } else {
      result[key] = overrideValue;
    }
  }

  return result as T;
}
