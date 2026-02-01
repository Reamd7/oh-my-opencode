/**
 * 思考模式钩子 (Think Mode Hook)
 * 
 * 当用户在提示词中包含"think"、"思考"等关键词时，自动将模型切换到高推理变体，
 * 并注入扩展的思考预算配置。这使得模型能够进行更深入的推理和分析。
 * 
 * When user includes "think", "思考" or similar keywords in their prompt,
 * automatically switches model to high reasoning variant and injects extended
 * thinking budget configuration. This enables deeper reasoning and analysis.
 * 
 * 支持的模型切换 (Supported model switches):
 * - Claude: claude-sonnet-4-5 → claude-sonnet-4-5-high (64K thinking tokens)
 * - Gemini: gemini-3-pro → gemini-3-pro-high (HIGH thinking level)
 * - GPT: gpt-5 → gpt-5-high (high reasoning_effort)
 * 
 * 多语言关键词支持 (Multilingual keyword support):
 * - 英语: think, ultrathink
 * - 中文: 思考, 考虑
 * - 日语: 思考, 考え
 * - 韩语: 생각, 고민
 * - 以及其他30+种语言 (and 30+ other languages)
 */

import { detectThinkKeyword, extractPromptText } from "./detector"
import { getHighVariant, isAlreadyHighVariant, getThinkingConfig } from "./switcher"
import type { ThinkModeState, ThinkModeInput } from "./types"
import { log } from "../../shared"

export * from "./detector"
export * from "./switcher"
export * from "./types"

// 会话级思考模式状态缓存 (Session-level think mode state cache)
const thinkModeState = new Map<string, ThinkModeState>()

/**
 * 清除指定会话的思考模式状态
 * Clears think mode state for specified session
 */
export function clearThinkModeState(sessionID: string): void {
  thinkModeState.delete(sessionID)
}

/**
 * 创建思考模式钩子
 * Creates think mode hook
 * 
 * @returns 钩子对象，监听 chat.params 和 event 事件 (Hook object that listens to chat.params and event)
 */
export function createThinkModeHook() {
  return {
    "chat.params": async (
      output: ThinkModeInput,
      sessionID: string
    ): Promise<void> => {
      const promptText = extractPromptText(output.parts)

      const state: ThinkModeState = {
        requested: false,
        modelSwitched: false,
        thinkingConfigInjected: false,
      }

      // 检测思考关键词 (Detect think keywords)
      if (!detectThinkKeyword(promptText)) {
        thinkModeState.set(sessionID, state)
        return
      }

      state.requested = true

      const currentModel = output.message.model
      if (!currentModel) {
        thinkModeState.set(sessionID, state)
        return
      }

      state.providerID = currentModel.providerID
      state.modelID = currentModel.modelID

      // 已经是高推理变体，无需切换 (Already high variant, no switch needed)
      if (isAlreadyHighVariant(currentModel.modelID)) {
        thinkModeState.set(sessionID, state)
        return
      }

      const highVariant = getHighVariant(currentModel.modelID)
      const thinkingConfig = getThinkingConfig(currentModel.providerID, currentModel.modelID)

      // 切换到高推理模型变体 (Switch to high reasoning model variant)
      if (highVariant) {
        output.message.model = {
          providerID: currentModel.providerID,
          modelID: highVariant,
        }
        state.modelSwitched = true
        log("Think mode: model switched to high variant", {
          sessionID,
          from: currentModel.modelID,
          to: highVariant,
        })
      }

      // 注入思考配置（扩展思考预算）(Inject thinking config - extended thinking budget)
      if (thinkingConfig) {
        const messageData = output.message as Record<string, unknown>
        const agentThinking = messageData.thinking as { type?: string } | undefined
        const agentProviderOptions = messageData.providerOptions

        const agentDisabledThinking = agentThinking?.type === "disabled"
        const agentHasCustomProviderOptions = Boolean(agentProviderOptions)

        // 尊重代理的思考配置：如果代理禁用了思考或有自定义配置，则跳过注入
        // Respect agent's thinking config: skip injection if agent disabled thinking or has custom config
        if (agentDisabledThinking) {
          log("Think mode: skipping - agent has thinking disabled", {
            sessionID,
            provider: currentModel.providerID,
          })
        } else if (agentHasCustomProviderOptions) {
          log("Think mode: skipping - agent has custom providerOptions", {
            sessionID,
            provider: currentModel.providerID,
          })
        } else {
          Object.assign(output.message, thinkingConfig)
          state.thinkingConfigInjected = true
          log("Think mode: thinking config injected", {
            sessionID,
            provider: currentModel.providerID,
            config: thinkingConfig,
          })
        }
      }

      thinkModeState.set(sessionID, state)
    },

    // 清理已删除会话的状态 (Clean up state for deleted sessions)
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type === "session.deleted") {
        const props = event.properties as { info?: { id?: string } } | undefined
        if (props?.info?.id) {
          thinkModeState.delete(props.info.id)
        }
      }
    },
  }
}
