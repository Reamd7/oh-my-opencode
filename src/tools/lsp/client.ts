/**
 * LSP客户端 - Language Server Protocol 集成
 * 
 * ## 功能概述
 * 提供与TypeScript/JavaScript语言服务器的集成，支持代码智能分析。
 * 
 * ## 核心能力
 * - **goto_definition**: 跳转到定义
 * - **find_references**: 查找所有引用
 * - **symbols**: 符号搜索（文档/工作区）
 * - **diagnostics**: 错误和警告诊断
 * - **rename**: 跨文件重命名
 * - **prepare_rename**: 重命名前验证
 * 
 * ## LSP协议
 * 基于Language Server Protocol标准，通过stdio与语言服务器通信。
 * 使用JSON-RPC 2.0协议进行请求-响应通信。
 * 
 * ## 架构设计
 * - **LSPServerManager**: 单例管理器，负责客户端生命周期和资源池化
 * - **LSPClient**: 单个LSP服务器连接，处理协议通信
 * - **引用计数**: 自动管理客户端复用，避免重复启动
 * - **空闲清理**: 5分钟无活动后自动关闭服务器
 * 
 * ## 使用场景
 * - 代码重构前的引用分析
 * - 类型错误检测
 * - 符号查找和导航
 * - 安全的跨文件重命名
 */
import { spawn, type Subprocess } from "bun"
import { readFileSync } from "fs"
import { extname, resolve } from "path"
import { pathToFileURL } from "node:url"
import { getLanguageId } from "./config"
import type { Diagnostic, ResolvedServer } from "./types"

/**
 * 托管客户端 - 包含LSP客户端及其元数据
 * 
 * @property client - LSP客户端实例
 * @property lastUsedAt - 最后使用时间戳（用于空闲清理）
 * @property refCount - 引用计数（0表示可清理）
 * @property initPromise - 初始化Promise（避免重复初始化）
 * @property isInitializing - 是否正在初始化
 */
interface ManagedClient {
  client: LSPClient
  lastUsedAt: number
  refCount: number
  initPromise?: Promise<void>
  isInitializing: boolean
}

/**
 * LSP服务器管理器 - 单例模式
 * 
 * 负责管理所有LSP客户端的生命周期：
 * - 客户端池化和复用（避免重复启动）
 * - 引用计数管理（自动释放）
 * - 空闲超时清理（5分钟）
 * - 进程退出时的资源清理
 */
class LSPServerManager {
  private static instance: LSPServerManager
  private clients = new Map<string, ManagedClient>() // key: "root::serverId"
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000 // 5分钟空闲超时

  private constructor() {
    this.startCleanupTimer()
    this.registerProcessCleanup()
  }

  private registerProcessCleanup(): void {
    const cleanup = () => {
      for (const [, managed] of this.clients) {
        try {
          managed.client.stop()
        } catch {}
      }
      this.clients.clear()
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }
    }

    // Works on all platforms
    process.on("exit", cleanup)

    // Ctrl+C - works on all platforms
    process.on("SIGINT", () => {
      cleanup()
      process.exit(0)
    })

    // Kill signal - Unix/macOS
    process.on("SIGTERM", () => {
      cleanup()
      process.exit(0)
    })

    // Ctrl+Break - Windows specific
    if (process.platform === "win32") {
      process.on("SIGBREAK", () => {
        cleanup()
        process.exit(0)
      })
    }
  }

  static getInstance(): LSPServerManager {
    if (!LSPServerManager.instance) {
      LSPServerManager.instance = new LSPServerManager()
    }
    return LSPServerManager.instance
  }

  private getKey(root: string, serverId: string): string {
    return `${root}::${serverId}`
  }

  private startCleanupTimer(): void {
    if (this.cleanupInterval) return
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleClients()
    }, 60000)
  }

  private cleanupIdleClients(): void {
    const now = Date.now()
    for (const [key, managed] of this.clients) {
      if (managed.refCount === 0 && now - managed.lastUsedAt > this.IDLE_TIMEOUT) {
        managed.client.stop()
        this.clients.delete(key)
      }
    }
  }

  async getClient(root: string, server: ResolvedServer): Promise<LSPClient> {
    const key = this.getKey(root, server.id)

    let managed = this.clients.get(key)
    if (managed) {
      if (managed.initPromise) {
        await managed.initPromise
      }
      if (managed.client.isAlive()) {
        managed.refCount++
        managed.lastUsedAt = Date.now()
        return managed.client
      }
      await managed.client.stop()
      this.clients.delete(key)
    }

    const client = new LSPClient(root, server)
    const initPromise = (async () => {
      await client.start()
      await client.initialize()
    })()

    this.clients.set(key, {
      client,
      lastUsedAt: Date.now(),
      refCount: 1,
      initPromise,
      isInitializing: true,
    })

    await initPromise
    const m = this.clients.get(key)
    if (m) {
      m.initPromise = undefined
      m.isInitializing = false
    }

    return client
  }

  warmupClient(root: string, server: ResolvedServer): void {
    const key = this.getKey(root, server.id)
    if (this.clients.has(key)) return

    const client = new LSPClient(root, server)
    const initPromise = (async () => {
      await client.start()
      await client.initialize()
    })()

    this.clients.set(key, {
      client,
      lastUsedAt: Date.now(),
      refCount: 0,
      initPromise,
      isInitializing: true,
    })

    initPromise.then(() => {
      const m = this.clients.get(key)
      if (m) {
        m.initPromise = undefined
        m.isInitializing = false
      }
    })
  }

  releaseClient(root: string, serverId: string): void {
    const key = this.getKey(root, serverId)
    const managed = this.clients.get(key)
    if (managed && managed.refCount > 0) {
      managed.refCount--
      managed.lastUsedAt = Date.now()
    }
  }

  isServerInitializing(root: string, serverId: string): boolean {
    const key = this.getKey(root, serverId)
    const managed = this.clients.get(key)
    return managed?.isInitializing ?? false
  }

  async stopAll(): Promise<void> {
    for (const [, managed] of this.clients) {
      await managed.client.stop()
    }
    this.clients.clear()
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  async cleanupTempDirectoryClients(): Promise<void> {
    const keysToRemove: string[] = []
    for (const [key, managed] of this.clients.entries()) {
      const isTempDir = key.startsWith("/tmp/") || key.startsWith("/var/folders/")
      const isIdle = managed.refCount === 0
      if (isTempDir && isIdle) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      const managed = this.clients.get(key)
      if (managed) {
        this.clients.delete(key)
        try {
          await managed.client.stop()
        } catch {}
      }
    }
  }
}

export const lspManager = LSPServerManager.getInstance()

/**
 * LSP客户端 - 单个语言服务器连接
 * 
 * 通过stdio与LSP服务器通信，实现JSON-RPC 2.0协议。
 * 
 * ## 通信流程
 * 1. start() - 启动子进程
 * 2. initialize() - LSP握手（initialize + initialized）
 * 3. openFile() - 打开文件（textDocument/didOpen）
 * 4. 调用LSP方法（definition/references/symbols等）
 * 5. stop() - 关闭连接（shutdown + exit）
 * 
 * ## 协议细节
 * - 消息格式: Content-Length头 + JSON-RPC body
 * - 请求超时: 15秒
 * - 文件同步: 自动跟踪已打开文件
 * - 诊断推送: 自动存储publishDiagnostics通知
 */
export class LSPClient {
  private proc: Subprocess<"pipe", "pipe", "pipe"> | null = null // LSP服务器子进程
  private buffer: Uint8Array = new Uint8Array(0) // stdout缓冲区（解析LSP消息）
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>() // 待响应的请求
  private requestIdCounter = 0 // JSON-RPC请求ID计数器
  private openedFiles = new Set<string>() // 已打开的文件（避免重复didOpen）
  private stderrBuffer: string[] = [] // stderr日志（用于错误诊断）
  private processExited = false // 进程是否已退出
  private diagnosticsStore = new Map<string, Diagnostic[]>() // 诊断缓存（uri -> diagnostics）

  constructor(
    private root: string, // 工作区根目录
    private server: ResolvedServer // 服务器配置
  ) {}

  async start(): Promise<void> {
    this.proc = spawn(this.server.command, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      cwd: this.root,
      env: {
        ...process.env,
        ...this.server.env,
      },
    })

    if (!this.proc) {
      throw new Error(`Failed to spawn LSP server: ${this.server.command.join(" ")}`)
    }

    this.startReading()
    this.startStderrReading()

    await new Promise((resolve) => setTimeout(resolve, 100))

    if (this.proc.exitCode !== null) {
      const stderr = this.stderrBuffer.join("\n")
      throw new Error(
        `LSP server exited immediately with code ${this.proc.exitCode}` + (stderr ? `\nstderr: ${stderr}` : "")
      )
    }
  }

  private startReading(): void {
    if (!this.proc) return

    const reader = this.proc.stdout.getReader()
    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            this.processExited = true
            this.rejectAllPending("LSP server stdout closed")
            break
          }
          const newBuf = new Uint8Array(this.buffer.length + value.length)
          newBuf.set(this.buffer)
          newBuf.set(value, this.buffer.length)
          this.buffer = newBuf
          this.processBuffer()
        }
      } catch (err) {
        this.processExited = true
        this.rejectAllPending(`LSP stdout read error: ${err}`)
      }
    }
    read()
  }

  private startStderrReading(): void {
    if (!this.proc) return

    const reader = this.proc.stderr.getReader()
    const read = async () => {
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value)
          this.stderrBuffer.push(text)
          if (this.stderrBuffer.length > 100) {
            this.stderrBuffer.shift()
          }
        }
      } catch {
      }
    }
    read()
  }

  private rejectAllPending(reason: string): void {
    for (const [id, handler] of this.pending) {
      handler.reject(new Error(reason))
      this.pending.delete(id)
    }
  }

  private findSequence(haystack: Uint8Array, needle: number[]): number {
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer
      }
      return i
    }
    return -1
  }

  /**
   * 处理LSP消息缓冲区
   * 
   * LSP协议消息格式:
   * Content-Length: 123\r\n\r\n{"jsonrpc":"2.0",...}
   * 
   * 解析步骤:
   * 1. 查找"Content-Length:"头
   * 2. 提取消息长度
   * 3. 读取指定长度的JSON body
   * 4. 分发到对应的处理器（响应/通知/请求）
   */
  private processBuffer(): void {
    const decoder = new TextDecoder()
    const CONTENT_LENGTH = [67, 111, 110, 116, 101, 110, 116, 45, 76, 101, 110, 103, 116, 104, 58] // "Content-Length:" ASCII
    const CRLF_CRLF = [13, 10, 13, 10] // \r\n\r\n
    const LF_LF = [10, 10] // \n\n (兼容某些服务器)

    while (true) {
      const headerStart = this.findSequence(this.buffer, CONTENT_LENGTH)
      if (headerStart === -1) break
      if (headerStart > 0) this.buffer = this.buffer.slice(headerStart)

      let headerEnd = this.findSequence(this.buffer, CRLF_CRLF)
      let sepLen = 4
      if (headerEnd === -1) {
        headerEnd = this.findSequence(this.buffer, LF_LF)
        sepLen = 2
      }
      if (headerEnd === -1) break

      const header = decoder.decode(this.buffer.slice(0, headerEnd))
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) break

      const len = parseInt(match[1], 10)
      const start = headerEnd + sepLen
      const end = start + len
      if (this.buffer.length < end) break

      const content = decoder.decode(this.buffer.slice(start, end))
      this.buffer = this.buffer.slice(end)

      try {
        const msg = JSON.parse(content)

        if ("method" in msg && !("id" in msg)) {
          if (msg.method === "textDocument/publishDiagnostics" && msg.params?.uri) {
            this.diagnosticsStore.set(msg.params.uri, msg.params.diagnostics ?? [])
          }
        } else if ("id" in msg && "method" in msg) {
          this.handleServerRequest(msg.id, msg.method, msg.params)
        } else if ("id" in msg && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!
          this.pending.delete(msg.id)
          if ("error" in msg) {
            handler.reject(new Error(msg.error.message))
          } else {
            handler.resolve(msg.result)
          }
        }
      } catch {
      }
    }
  }

  /**
   * 发送LSP请求（JSON-RPC 2.0）
   * 
   * @param method - LSP方法名（如"textDocument/definition"）
   * @param params - 方法参数
   * @returns Promise，15秒超时
   */
  private send(method: string, params?: unknown): Promise<unknown> {
    if (!this.proc) throw new Error("LSP client not started")

    if (this.processExited || this.proc.exitCode !== null) {
      const stderr = this.stderrBuffer.slice(-10).join("\n")
      throw new Error(`LSP server already exited (code: ${this.proc.exitCode})` + (stderr ? `\nstderr: ${stderr}` : ""))
    }

    const id = ++this.requestIdCounter
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params })
    const header = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n`
    this.proc.stdin.write(header + msg)

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          const stderr = this.stderrBuffer.slice(-5).join("\n")
          reject(new Error(`LSP request timeout (method: ${method})` + (stderr ? `\nrecent stderr: ${stderr}` : "")))
        }
      }, 15000) // 15秒超时
    })
  }

  private notify(method: string, params?: unknown): void {
    if (!this.proc) return
    if (this.processExited || this.proc.exitCode !== null) return

    const msg = JSON.stringify({ jsonrpc: "2.0", method, params })
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
  }

  private respond(id: number | string, result: unknown): void {
    if (!this.proc) return
    if (this.processExited || this.proc.exitCode !== null) return

    const msg = JSON.stringify({ jsonrpc: "2.0", id, result })
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
  }

  private handleServerRequest(id: number | string, method: string, params?: unknown): void {
    if (method === "workspace/configuration") {
      const items = (params as { items?: Array<{ section?: string }> })?.items ?? []
      const result = items.map((item) => {
        if (item.section === "json") return { validate: { enable: true } }
        return {}
      })
      this.respond(id, result)
    } else if (method === "client/registerCapability") {
      this.respond(id, null)
    } else if (method === "window/workDoneProgress/create") {
      this.respond(id, null)
    }
  }

  async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href
    await this.send("initialize", {
      processId: process.pid,
      rootUri,
      rootPath: this.root,
      workspaceFolders: [{ uri: rootUri, name: "workspace" }],
      capabilities: {
        textDocument: {
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          publishDiagnostics: {},
          rename: {
            prepareSupport: true,
            prepareSupportDefaultBehavior: 1,
            honorsChangeAnnotations: true,
          },
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  "quickfix",
                  "refactor",
                  "refactor.extract",
                  "refactor.inline",
                  "refactor.rewrite",
                  "source",
                  "source.organizeImports",
                  "source.fixAll",
                ],
              },
            },
            isPreferredSupport: true,
            disabledSupport: true,
            dataSupport: true,
            resolveSupport: {
              properties: ["edit", "command"],
            },
          },
        },
        workspace: {
          symbol: {},
          workspaceFolders: true,
          configuration: true,
          applyEdit: true,
          workspaceEdit: {
            documentChanges: true,
          },
        },
      },
      ...this.server.initialization,
    })
    this.notify("initialized")
    this.notify("workspace/didChangeConfiguration", {
      settings: { json: { validate: { enable: true } } },
    })
    await new Promise((r) => setTimeout(r, 300))
  }

  async openFile(filePath: string): Promise<void> {
    const absPath = resolve(filePath)
    if (this.openedFiles.has(absPath)) return

    const text = readFileSync(absPath, "utf-8")
    const ext = extname(absPath)
    const languageId = getLanguageId(ext)

    this.notify("textDocument/didOpen", {
      textDocument: {
        uri: pathToFileURL(absPath).href,
        languageId,
        version: 1,
        text,
      },
    })
    this.openedFiles.add(absPath)

    await new Promise((r) => setTimeout(r, 1000))
  }

  async definition(filePath: string, line: number, character: number): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.send("textDocument/definition", {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
    })
  }

  async references(filePath: string, line: number, character: number, includeDeclaration = true): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.send("textDocument/references", {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
      context: { includeDeclaration },
    })
  }

  async documentSymbols(filePath: string): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.send("textDocument/documentSymbol", {
      textDocument: { uri: pathToFileURL(absPath).href },
    })
  }

  async workspaceSymbols(query: string): Promise<unknown> {
    return this.send("workspace/symbol", { query })
  }

  async diagnostics(filePath: string): Promise<{ items: Diagnostic[] }> {
    const absPath = resolve(filePath)
    const uri = pathToFileURL(absPath).href
    await this.openFile(absPath)
    await new Promise((r) => setTimeout(r, 500))

    try {
      const result = await this.send("textDocument/diagnostic", {
        textDocument: { uri },
      })
      if (result && typeof result === "object" && "items" in result) {
        return result as { items: Diagnostic[] }
      }
    } catch {
    }

    return { items: this.diagnosticsStore.get(uri) ?? [] }
  }

  async prepareRename(filePath: string, line: number, character: number): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.send("textDocument/prepareRename", {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
    })
  }

  async rename(filePath: string, line: number, character: number, newName: string): Promise<unknown> {
    const absPath = resolve(filePath)
    await this.openFile(absPath)
    return this.send("textDocument/rename", {
      textDocument: { uri: pathToFileURL(absPath).href },
      position: { line: line - 1, character },
      newName,
    })
  }

  isAlive(): boolean {
    return this.proc !== null && !this.processExited && this.proc.exitCode === null
  }

  async stop(): Promise<void> {
    try {
      this.notify("shutdown", {})
      this.notify("exit")
    } catch {
    }
    this.proc?.kill()
    this.proc = null
    this.processExited = true
    this.diagnosticsStore.clear()
  }
}
