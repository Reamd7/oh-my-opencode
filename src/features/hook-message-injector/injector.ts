import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { MESSAGE_STORAGE, PART_STORAGE } from "./constants"
import type { MessageMeta, OriginalMessageContext, TextPart, ToolPermission } from "./types"

/**
 * 存储的消息元数据
 * 
 * 用于从历史消息中提取agent/model/tools信息，
 * 当钩子注入消息时缺少这些字段时作为回退值
 */
export interface StoredMessage {
  agent?: string
  model?: { providerID?: string; modelID?: string; variant?: string }
  tools?: Record<string, ToolPermission>
}

/**
 * 查找最近的包含完整字段的消息
 * 
 * 两阶段查找策略：
 * 1. 优先查找包含agent+model的完整消息
 * 2. 回退到包含任一字段的消息
 * 
 * @param messageDir 消息目录路径
 * @returns 找到的消息元数据，未找到返回null
 */
export function findNearestMessageWithFields(messageDir: string): StoredMessage | null {
  try {
    const files = readdirSync(messageDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()

    // First pass: find message with ALL fields (ideal)
    for (const file of files) {
      try {
        const content = readFileSync(join(messageDir, file), "utf-8")
        const msg = JSON.parse(content) as StoredMessage
        if (msg.agent && msg.model?.providerID && msg.model?.modelID) {
          return msg
        }
      } catch {
        continue
      }
    }

    // Second pass: find message with ANY useful field (fallback)
    // This ensures agent info isn't lost when model info is missing
    for (const file of files) {
      try {
        const content = readFileSync(join(messageDir, file), "utf-8")
        const msg = JSON.parse(content) as StoredMessage
        if (msg.agent || (msg.model?.providerID && msg.model?.modelID)) {
          return msg
        }
      } catch {
        continue
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * 查找会话中第一条包含agent字段的消息
 * 
 * 用于获取启动会话的原始代理，避免因OpenCode内部代理切换
 * 导致的代理识别错误
 * 
 * @param messageDir 消息目录路径
 * @returns 原始代理名称，未找到返回null
 */
export function findFirstMessageWithAgent(messageDir: string): string | null {
  try {
    const files = readdirSync(messageDir)
      .filter((f) => f.endsWith(".json"))
      .sort() // Oldest first (no reverse)

    for (const file of files) {
      try {
        const content = readFileSync(join(messageDir, file), "utf-8")
        const msg = JSON.parse(content) as StoredMessage
        if (msg.agent) {
          return msg.agent
        }
      } catch {
        continue
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * 生成唯一消息ID
 * 格式: msg_{timestamp_hex}{random_base36}
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(16)
  const random = Math.random().toString(36).substring(2, 14)
  return `msg_${timestamp}${random}`
}

/**
 * 生成唯一部件ID
 * 格式: prt_{timestamp_hex}{random_base36}
 */
function generatePartId(): string {
  const timestamp = Date.now().toString(16)
  const random = Math.random().toString(36).substring(2, 10)
  return `prt_${timestamp}${random}`
}

/**
 * 获取或创建消息存储目录
 * 
 * 查找策略：
 * 1. 直接路径: MESSAGE_STORAGE/{sessionID}
 * 2. 嵌套路径: MESSAGE_STORAGE/*\/{sessionID}
 * 3. 不存在则创建直接路径
 * 
 * @param sessionID 会话ID
 * @returns 消息目录路径
 */
function getOrCreateMessageDir(sessionID: string): string {
  if (!existsSync(MESSAGE_STORAGE)) {
    mkdirSync(MESSAGE_STORAGE, { recursive: true })
  }

  const directPath = join(MESSAGE_STORAGE, sessionID)
  if (existsSync(directPath)) {
    return directPath
  }

  for (const dir of readdirSync(MESSAGE_STORAGE)) {
    const sessionPath = join(MESSAGE_STORAGE, dir, sessionID)
    if (existsSync(sessionPath)) {
      return sessionPath
    }
  }

  mkdirSync(directPath, { recursive: true })
  return directPath
}

/**
 * 注入钩子消息到OpenCode消息流
 * 
 * ## 工作流程
 * 1. 验证内容非空
 * 2. 从原始消息或历史消息继承元数据
 * 3. 生成消息ID和部件ID
 * 4. 原子写入消息元数据和文本部件
 * 
 * ## 元数据继承优先级
 * - agent: originalMessage.agent > fallback.agent > "general"
 * - model: originalMessage.model > fallback.model > undefined
 * - tools: originalMessage.tools > fallback.tools > undefined
 * 
 * @param sessionID 会话ID
 * @param hookContent 钩子消息内容
 * @param originalMessage 原始消息上下文
 * @returns 注入成功返回true，失败返回false
 */
export function injectHookMessage(
  sessionID: string,
  hookContent: string,
  originalMessage: OriginalMessageContext
): boolean {
  // 验证钩子内容，防止注入空消息
  if (!hookContent || hookContent.trim().length === 0) {
    console.warn("[hook-message-injector] Attempted to inject empty hook content, skipping injection", {
      sessionID,
      hasAgent: !!originalMessage.agent,
      hasModel: !!(originalMessage.model?.providerID && originalMessage.model?.modelID)
    })
    return false
  }

  const messageDir = getOrCreateMessageDir(sessionID)

  const needsFallback =
    !originalMessage.agent ||
    !originalMessage.model?.providerID ||
    !originalMessage.model?.modelID

  const fallback = needsFallback ? findNearestMessageWithFields(messageDir) : null

  const now = Date.now()
  const messageID = generateMessageId()
  const partID = generatePartId()

  const resolvedAgent = originalMessage.agent ?? fallback?.agent ?? "general"
  const resolvedModel =
    originalMessage.model?.providerID && originalMessage.model?.modelID
      ? { 
          providerID: originalMessage.model.providerID, 
          modelID: originalMessage.model.modelID,
          ...(originalMessage.model.variant ? { variant: originalMessage.model.variant } : {})
        }
      : fallback?.model?.providerID && fallback?.model?.modelID
        ? { 
            providerID: fallback.model.providerID, 
            modelID: fallback.model.modelID,
            ...(fallback.model.variant ? { variant: fallback.model.variant } : {})
          }
        : undefined
  const resolvedTools = originalMessage.tools ?? fallback?.tools

  const messageMeta: MessageMeta = {
    id: messageID,
    sessionID,
    role: "user",
    time: {
      created: now,
    },
    agent: resolvedAgent,
    model: resolvedModel,
    path:
      originalMessage.path?.cwd
        ? {
            cwd: originalMessage.path.cwd,
            root: originalMessage.path.root ?? "/",
          }
        : undefined,
    tools: resolvedTools,
  }

  const textPart: TextPart = {
    id: partID,
    type: "text",
    text: hookContent,
    synthetic: true,
    time: {
      start: now,
      end: now,
    },
    messageID,
    sessionID,
  }

  try {
    writeFileSync(join(messageDir, `${messageID}.json`), JSON.stringify(messageMeta, null, 2))

    const partDir = join(PART_STORAGE, messageID)
    if (!existsSync(partDir)) {
      mkdirSync(partDir, { recursive: true })
    }
    writeFileSync(join(partDir, `${partID}.json`), JSON.stringify(textPart, null, 2))

    return true
  } catch {
    return false
  }
}
