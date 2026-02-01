/**
 * 命名风格转换工具 - camelCase和snake_case互转
 * Naming style converter - Convert between camelCase and snake_case
 * 
 * 功能:
 * - 字符串命名风格转换
 * - 对象键名递归转换
 * - 支持深度转换和浅转换
 * 
 * Features:
 * - String naming style conversion
 * - Recursive object key conversion
 * - Supports deep and shallow conversion
 * 
 * @module snake-case
 */

import { isPlainObject } from "./deep-merge"

/**
 * 将camelCase转换为snake_case
 * Convert camelCase to snake_case
 * 
 * @example
 * camelToSnake("myVariableName") // "my_variable_name"
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * 将snake_case转换为camelCase
 * Convert snake_case to camelCase
 * 
 * @example
 * snakeToCamel("my_variable_name") // "myVariableName"
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * 将对象的所有键转换为snake_case
 * Convert all object keys to snake_case
 * 
 * @param obj - 要转换的对象
 * @param deep - 是否递归转换嵌套对象 (默认true)
 * @returns 键名为snake_case的新对象
 */
export function objectToSnakeCase(
  obj: Record<string, unknown>,
  deep: boolean = true
): Record<string, unknown> {
   const result: Record<string, unknown> = {}
   for (const [key, value] of Object.entries(obj)) {
     const snakeKey = camelToSnake(key)
     if (deep && isPlainObject(value)) {
       result[snakeKey] = objectToSnakeCase(value, true)
     } else if (deep && Array.isArray(value)) {
       result[snakeKey] = value.map((item) =>
         isPlainObject(item) ? objectToSnakeCase(item, true) : item
       )
     } else {
       result[snakeKey] = value
     }
   }
   return result
 }

/**
 * 将对象的所有键转换为camelCase
 * Convert all object keys to camelCase
 * 
 * @param obj - 要转换的对象
 * @param deep - 是否递归转换嵌套对象 (默认true)
 * @returns 键名为camelCase的新对象
 */
export function objectToCamelCase(
  obj: Record<string, unknown>,
  deep: boolean = true
): Record<string, unknown> {
   const result: Record<string, unknown> = {}
   for (const [key, value] of Object.entries(obj)) {
     const camelKey = snakeToCamel(key)
     if (deep && isPlainObject(value)) {
       result[camelKey] = objectToCamelCase(value, true)
     } else if (deep && Array.isArray(value)) {
       result[camelKey] = value.map((item) =>
         isPlainObject(item) ? objectToCamelCase(item, true) : item
       )
     } else {
       result[camelKey] = value
     }
   }
   return result
 }
