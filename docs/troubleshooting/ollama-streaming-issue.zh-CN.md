# Ollama 流式问题 - JSON 解析错误

## 问题

在使用 Ollama 作为 oh-my-opencode 代理的提供商时，您可能会遇到：

```
JSON Parse error: Unexpected EOF
```

当代理尝试工具调用时会发生这种情况（例如，`explore` 代理使用 `mcp_grep_search`）。

## 根本原因

当 API 请求中使用 `stream: true` 时，Ollama 返回 **NDJSON**（换行符分隔的 JSON）：

```json
{"message":{"tool_calls":[{"function":{"name":"read","arguments":{"filePath":"README.md"}}}]}, "done":false}
{"message":{"content":""}, "done":true}
```

Claude Code SDK 期望单个 JSON 对象，而不是多个 NDJSON 行，从而导致解析错误。

### 为什么会发生这种情况

- **Ollama API**：按设计返回流式响应作为 NDJSON
- **Claude Code SDK**：不能正确处理工具调用的 NDJSON 响应
- **oh-my-opencode**：传递 SDK 的行为（无法在此层修复）

## 解决方案

### 选项 1：禁用流式（推荐 - 立即修复）

配置您的 Ollama 提供商使用 `stream: false`：

```json
{
  "provider": "ollama",
  "model": "qwen3-coder",
  "stream": false
}
```

**优点**：
- 立即生效
- 无需代码更改
- 简单配置

**缺点**：
- 响应时间稍慢（无流式）
- 交互反馈较少

### 选项 2：仅使用非工具代理

如果需要流式，避免使用工具的代理：

- ✅ **安全**：简单的文本生成、非工具任务
- ❌ **有问题**：任何带工具调用的代理（explore、librarian 等）

### 选项 3：等待 SDK 修复（长期）

正确的修复需要 Claude Code SDK：

1. 检测 NDJSON 响应
2. 分别解析每一行
3. 从多行合并 `tool_calls`
4. 返回单个合并的响应

**跟踪**：https://github.com/code-yeongyu/oh-my-opencode/issues/1124

## 解决方法实现

在 SDK 修复之前，以下是如何实现 NDJSON 解析（供 SDK 维护者参考）：

```typescript
async function parseOllamaStreamResponse(response: string): Promise<object> {
  const lines = response.split('\n').filter(line => line.trim());
  const mergedMessage = { tool_calls: [] };

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.message?.tool_calls) {
        mergedMessage.tool_calls.push(...json.message.tool_calls);
      }
      if (json.message?.content) {
        mergedMessage.content = json.message.content;
      }
    } catch (e) {
      // 跳过格式错误的行
      console.warn('跳过格式错误的 NDJSON 行:', line);
    }
  }

  return mergedMessage;
}
```

## 测试

验证修复是否有效：

```bash
# 使用 curl 测试（应该在 stream: false 下工作）
curl -s http://localhost:11434/api/chat \
  -d '{
    "model": "qwen3-coder",
    "messages": [{"role": "user", "content": "Read file README.md"}],
    "stream": false,
    "tools": [{"type": "function", "function": {"name": "read", "description": "Read a file", "parameters": {"type": "object", "properties": {"filePath": {"type": "string"}}, "required": ["filePath"]}}}]
  }'
```

## 相关问题

- **oh-my-opencode**：https://github.com/code-yeongyu/oh-my-opencode/issues/1124
- **Ollama API 文档**：https://github.com/ollama/ollama/blob/main/docs/api.md

## 获取帮助

如果遇到此问题：

1. 检查您的 Ollama 提供商配置
2. 将 `stream: false` 设置为解决方法
3. 向问题跟踪器报告任何其他错误
4. 提供您的配置（不含机密）以进行调试
