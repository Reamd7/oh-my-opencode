/**
 * look-at - 多模态文件分析工具
 * 
 * ## 功能
 * 分析图片、PDF等非文本文件
 * 
 * ## 能力
 * - OCR文字识别
 * - 图表理解
 * - 文档摘要
 * - 视频/音频分析
 * 
 * ## 后端
 * 使用multimodal-looker代理（默认Gemini 3 Flash）
 * 
 * ## 使用场景
 * - 提取PDF文档内容
 * - 识别截图中的文字
 * - 理解架构图
 * - 分析数据可视化
 * 
 * ## 示例
 * look_at(file_path="/path/to/diagram.png", goal="解释这个架构图")
 * look_at(file_path="/path/to/doc.pdf", goal="提取第3页的表格数据")
 */
import { extname, basename } from "node:path"
import { pathToFileURL } from "node:url"
import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"
import { LOOK_AT_DESCRIPTION, MULTIMODAL_LOOKER_AGENT } from "./constants"
import type { LookAtArgs } from "./types"
import { log } from "../../shared/logger"

interface LookAtArgsWithAlias extends LookAtArgs {
  path?: string
}

export function normalizeArgs(args: LookAtArgsWithAlias): LookAtArgs {
  return {
    file_path: args.file_path ?? args.path ?? "",
    goal: args.goal ?? "",
  }
}

export function validateArgs(args: LookAtArgs): string | null {
  if (!args.file_path) {
    return `错误：缺少必需参数 'file_path'。用法：look_at(file_path="/path/to/file", goal="要提取的内容")`
  }
  if (!args.goal) {
    return `错误：缺少必需参数 'goal'。用法：look_at(file_path="/path/to/file", goal="要提取的内容")`
  }
  return null
}

function inferMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".mov": "video/mov",
    ".avi": "video/avi",
    ".flv": "video/x-flv",
    ".webm": "video/webm",
    ".wmv": "video/wmv",
    ".3gpp": "video/3gpp",
    ".3gp": "video/3gpp",
    ".wav": "audio/wav",
    ".mp3": "audio/mp3",
    ".aiff": "audio/aiff",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".md": "text/md",
    ".html": "text/html",
    ".json": "application/json",
    ".xml": "application/xml",
    ".js": "text/javascript",
    ".py": "text/x-python",
  }
  return mimeTypes[ext] || "application/octet-stream"
}

/**
 * 创建look_at工具
 * 
 * @param ctx - 插件输入上下文
 * @returns look_at工具定义
 * 
 * 该工具：
 * 1. 创建子会话
 * 2. 使用multimodal-looker代理
 * 3. 传递文件和目标
 * 4. 返回分析结果
 */
export function createLookAt(ctx: PluginInput): ToolDefinition {
  return tool({
    description: LOOK_AT_DESCRIPTION,
    args: {
      file_path: tool.schema.string().describe("要分析的文件的绝对路径"),
      goal: tool.schema.string().describe("要从文件中提取的具体信息"),
    },
    async execute(rawArgs: LookAtArgs, toolContext) {
      // 规范化和验证参数
      const args = normalizeArgs(rawArgs as LookAtArgsWithAlias)
      const validationError = validateArgs(args)
      if (validationError) {
        log(`[look_at] 验证失败：${validationError}`)
        return validationError
      }

      log(`[look_at] 正在分析文件：${args.file_path}，目标：${args.goal}`)

      // 推断MIME类型
      const mimeType = inferMimeType(args.file_path)
      const filename = basename(args.file_path)

      const prompt = `分析此文件并提取请求的信息。

目标：${args.goal}

仅提供与目标匹配的提取信息。
对请求的内容要详尽，对其他内容要简洁。
如果未找到请求的信息，请明确说明缺少什么。`

      // 创建子会话
      log(`[look_at] 正在创建会话，父会话：${toolContext.sessionID}`)
      const parentSession = await ctx.client.session.get({
        path: { id: toolContext.sessionID },
      }).catch(() => null)
      const parentDirectory = parentSession?.data?.directory ?? ctx.directory

      const createResult = await ctx.client.session.create({
        body: {
          parentID: toolContext.sessionID,
          title: `look_at: ${args.goal.substring(0, 50)}`,
          permission: [
            { permission: "question", action: "deny" as const, pattern: "*" }, // 禁止提问
          ],
        } as any,
        query: {
          directory: parentDirectory,
        },
      })

      if (createResult.error) {
        log(`[look_at] 会话创建错误：`, createResult.error)
        const errorStr = String(createResult.error)
        if (errorStr.toLowerCase().includes("unauthorized")) {
          return `错误：创建会话失败（未授权）。这可能是由于：
1. OAuth token 限制（例如，Claude Code 凭据仅限于 Claude Code 使用）
2. 提供商身份验证问题
3. 会话权限继承问题

请尝试使用不同的提供商或 API 密钥身份验证。

原始错误：${createResult.error}`
        }
        return `错误：创建会话失败：${createResult.error}`
      }

      const sessionID = createResult.data.id
      log(`[look_at] 已创建会话：${sessionID}`)

      // 发送提示词和文件
      log(`[look_at] 正在向会话 ${sessionID} 发送提示词和文件`)
      try {
        await ctx.client.session.prompt({
          path: { id: sessionID },
          body: {
            agent: MULTIMODAL_LOOKER_AGENT, // 使用多模态代理
            tools: {
              // 禁用递归工具
              task: false,
              call_omo_agent: false,
              look_at: false,
              read: false,
            },
            parts: [
              { type: "text", text: prompt },
              { type: "file", mime: mimeType, url: pathToFileURL(args.file_path).href, filename },
            ],
          },
        })
      } catch (promptError) {
        const errorMessage = promptError instanceof Error ? promptError.message : String(promptError)
        log(`[look_at] 提示词错误：`, promptError)

        const isJsonParseError = errorMessage.includes("JSON") && (errorMessage.includes("EOF") || errorMessage.includes("parse"))
        if (isJsonParseError) {
          return `错误：分析文件失败 - 从 multimodal-looker 代理收到格式错误的响应。

这通常发生在以下情况：
1. multimodal-looker 模型不可用或未连接
2. 模型不支持此文件类型（${mimeType}）
3. API 返回了空响应或截断的响应

文件：${args.file_path}
MIME 类型：${mimeType}

请尝试：
- 确保有可用的视觉能力模型（例如 gemini-3-flash、gpt-5.2）
- 检查 opencode 设置中的提供商连接
- 对于 .md、.txt 等文本文件，请改用 Read 工具

原始错误：${errorMessage}`
        }

        return `错误：向 multimodal-looker 代理发送提示词失败：${errorMessage}`
      }

      log(`[look_at] 提示词已发送，正在获取消息...`)

      const messagesResult = await ctx.client.session.messages({
        path: { id: sessionID },
      })

      if (messagesResult.error) {
        log(`[look_at] 消息错误：`, messagesResult.error)
        return `错误：获取消息失败：${messagesResult.error}`
      }

      const messages = messagesResult.data
      log(`[look_at] 获得 ${messages.length} 条消息`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastAssistantMessage = messages
        .filter((m: any) => m.info.role === "assistant")
        .sort((a: any, b: any) => (b.info.time?.created || 0) - (a.info.time?.created || 0))[0]

      if (!lastAssistantMessage) {
        log(`[look_at] 未找到助手消息`)
        return `错误：multimodal-looker 代理无响应`
      }

      log(`[look_at] 找到助手消息，包含 ${lastAssistantMessage.parts.length} 个部分`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textParts = lastAssistantMessage.parts.filter((p: any) => p.type === "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseText = textParts.map((p: any) => p.text).join("\n")

      log(`[look_at] 获得响应，长度：${responseText.length}`)

      return responseText
    },
  })
}
