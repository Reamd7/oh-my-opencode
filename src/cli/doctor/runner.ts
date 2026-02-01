/**
 * Doctor诊断运行器
 * 
 * ## 核心功能
 * - 执行所有健康检查
 * - 按类别分组检查项
 * - 计算统计摘要
 * - 格式化输出结果
 * 
 * ## 检查流程
 * 1. 加载所有检查定义
 * 2. 按类别过滤（如果指定）
 * 3. 按预定义顺序执行检查
 * 4. 收集结果并生成摘要
 * 5. 根据失败情况确定退出码
 */
import type {
  DoctorOptions,
  DoctorResult,
  CheckDefinition,
  CheckResult,
  DoctorSummary,
  CheckCategory,
} from "./types"
import { getAllCheckDefinitions } from "./checks"
import { EXIT_CODES, CATEGORY_NAMES } from "./constants"
import {
  formatHeader,
  formatCategoryHeader,
  formatCheckResult,
  formatSummary,
  formatFooter,
  formatJsonOutput,
} from "./formatter"

/**
 * 执行单个检查项
 * 
 * 运行指定的健康检查并记录执行时间。如果检查函数抛出异常，
 * 会自动捕获并转换为失败结果，确保整个诊断流程不会中断。
 * 
 * 使用场景：
 * - 由runDoctor()调用，按顺序执行所有检查
 * - 可单独调用用于测试特定检查项
 * 
 * 错误处理：
 * - 捕获所有异常并转换为fail状态
 * - 记录异常消息到result.message
 * - 始终返回有效的CheckResult对象
 * 
 * @param check - 检查定义（包含name、category、check函数）
 * @returns 检查结果（包含状态、消息、耗时）
 */
export async function runCheck(check: CheckDefinition): Promise<CheckResult> {
  const start = performance.now()
  try {
    const result = await check.check()
    result.duration = Math.round(performance.now() - start)
    return result
  } catch (err) {
    return {
      name: check.name,
      status: "fail",
      message: err instanceof Error ? err.message : "Unknown error",
      duration: Math.round(performance.now() - start),
    }
  }
}

/**
 * 计算诊断摘要统计
 * 
 * 汇总所有检查结果，统计各状态的数量和总耗时。
 * 用于生成最终的诊断报告摘要。
 * 
 * 统计维度：
 * - total: 总检查项数
 * - passed: 通过的检查项数（status=pass）
 * - failed: 失败的检查项数（status=fail）
 * - warnings: 警告的检查项数（status=warn）
 * - skipped: 跳过的检查项数（status=skip）
 * - duration: 总耗时（毫秒，四舍五入）
 * 
 * @param results - 所有检查结果数组
 * @param duration - 总执行时间（毫秒）
 * @returns 诊断摘要对象
 */
export function calculateSummary(results: CheckResult[], duration: number): DoctorSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    warnings: results.filter((r) => r.status === "warn").length,
    skipped: results.filter((r) => r.status === "skip").length,
    duration: Math.round(duration),
  }
}

/**
 * 根据检查结果确定退出码
 * 
 * 遵循Unix惯例：
 * - 0: 所有检查通过或仅有警告
 * - 1: 至少有一个检查失败
 * 
 * 退出码用于：
 * - CI/CD流水线判断健康状态
 * - Shell脚本条件判断
 * - 自动化工具集成
 * 
 * @param results - 所有检查结果数组
 * @returns 退出码（0=成功，1=失败）
 */
export function determineExitCode(results: CheckResult[]): number {
  const hasFailures = results.some((r) => r.status === "fail")
  return hasFailures ? EXIT_CODES.FAILURE : EXIT_CODES.SUCCESS
}

/**
 * 按类别过滤检查项
 * 
 * 允许用户只运行特定类别的检查，例如：
 * - bunx oh-my-opencode doctor --category=authentication
 * - bunx oh-my-opencode doctor --category=dependencies
 * 
 * 使用场景：
 * - 快速诊断特定问题（如认证失败）
 * - 减少诊断时间
 * - CI/CD中分阶段检查
 * 
 * @param checks - 所有检查定义数组
 * @param category - 可选的类别过滤器
 * @returns 过滤后的检查定义数组（未指定category时返回全部）
 */
export function filterChecksByCategory(
  checks: CheckDefinition[],
  category?: CheckCategory
): CheckDefinition[] {
  if (!category) return checks
  return checks.filter((c) => c.category === category)
}

/**
 * 按类别分组检查项
 * 
 * 将检查项按category分组，用于：
 * - 按类别顺序执行检查
 * - 生成分类的输出报告
 * - 提高诊断结果的可读性
 * 
 * 分组策略：
 * - 使用Map保持插入顺序
 * - 每个category对应一个检查项数组
 * - 空category会被跳过
 * 
 * @param checks - 所有检查定义数组
 * @returns 按类别分组的Map（key=category, value=检查项数组）
 */
export function groupChecksByCategory(
  checks: CheckDefinition[]
): Map<CheckCategory, CheckDefinition[]> {
  const groups = new Map<CheckCategory, CheckDefinition[]>()

  for (const check of checks) {
    const existing = groups.get(check.category) ?? []
    existing.push(check)
    groups.set(check.category, existing)
  }

  return groups
}

const CATEGORY_ORDER: CheckCategory[] = [
  "installation",
  "configuration",
  "authentication",
  "dependencies",
  "tools",
  "updates",
]

/**
 * 运行完整的诊断流程
 * 
 * 这是doctor命令的核心函数，负责：
 * 1. 加载所有检查定义
 * 2. 按类别过滤（如果指定）
 * 3. 按预定义顺序分组执行
 * 4. 收集结果并生成摘要
 * 5. 格式化输出（文本或JSON）
 * 6. 确定退出码
 * 
 * 执行顺序（CATEGORY_ORDER）：
 * 1. installation - 安装检查
 * 2. configuration - 配置检查
 * 3. authentication - 认证检查
 * 4. dependencies - 依赖检查
 * 5. tools - 工具检查
 * 6. updates - 更新检查
 * 
 * 输出模式：
 * - 文本模式（默认）：彩色格式化输出，适合人类阅读
 * - JSON模式（--json）：结构化输出，适合工具解析
 * 
 * 使用场景：
 * - 用户手动诊断问题
 * - CI/CD健康检查
 * - 自动化测试
 * - 问题报告收集
 * 
 * @param options - 诊断选项（类别过滤、JSON输出、详细模式）
 * @returns 诊断结果（包含所有检查结果、摘要、退出码）
 */
export async function runDoctor(options: DoctorOptions): Promise<DoctorResult> {
  const start = performance.now()
  const allChecks = getAllCheckDefinitions()
  const filteredChecks = filterChecksByCategory(allChecks, options.category)
  const groupedChecks = groupChecksByCategory(filteredChecks)

  const results: CheckResult[] = []

  if (!options.json) {
    console.log(formatHeader())
  }

  for (const category of CATEGORY_ORDER) {
    const checks = groupedChecks.get(category)
    if (!checks || checks.length === 0) continue

    if (!options.json) {
      console.log(formatCategoryHeader(category))
    }

    for (const check of checks) {
      const result = await runCheck(check)
      results.push(result)

      if (!options.json) {
        console.log(formatCheckResult(result, options.verbose ?? false))
      }
    }
  }

  const duration = performance.now() - start
  const summary = calculateSummary(results, duration)
  const exitCode = determineExitCode(results)

  const doctorResult: DoctorResult = {
    results,
    summary,
    exitCode,
  }

  if (options.json) {
    console.log(formatJsonOutput(doctorResult))
  } else {
    console.log("")
    console.log(formatSummary(summary))
    console.log(formatFooter(summary))
  }

  return doctorResult
}
