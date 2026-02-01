/**
 * 问题标签截断钩子 (Question Label Truncator Hook)
 * 
 * ## 触发时机
 * PreToolUse - 在 AskUserQuestion 工具调用前执行
 * 
 * ## 功能概述
 * 自动截断过长的问题选项标签，防止 UI 显示问题和上下文污染。
 * 当代理向用户提问时，选项标签可能过长导致界面混乱或占用过多 token。
 * 
 * ## 使用场景
 * - 代理使用 AskUserQuestion 工具向用户提问
 * - 选项标签超过最大长度限制（30 字符）
 * - 需要保持 UI 整洁和可读性
 * 
 * ## 实现逻辑
 * 1. 拦截 askuserquestion/ask_user_question 工具调用
 * 2. 遍历所有问题的选项标签
 * 3. 对超过 30 字符的标签进行截断，保留前 27 字符 + "..."
 * 4. 保持 description 字段不变（用于详细说明）
 * 
 * ## 截断策略
 * - 最大长度：30 字符（MAX_LABEL_LENGTH）
 * - 截断格式：前 27 字符 + "..."
 * - 仅截断 label，不影响 description
 */

/** 问题选项标签的最大长度限制 */
const MAX_LABEL_LENGTH = 30;

/** 问题选项接口 */
interface QuestionOption {
  label: string;
  description?: string;
}

/** 问题接口 */
interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

/** AskUserQuestion 工具参数接口 */
interface AskUserQuestionArgs {
  questions: Question[];
}

/**
 * 截断单个标签
 * @param label - 原始标签文本
 * @param maxLength - 最大长度限制
 * @returns 截断后的标签（如需要则添加 "..."）
 */
function truncateLabel(label: string, maxLength: number = MAX_LABEL_LENGTH): string {
  if (label.length <= maxLength) {
    return label;
  }
  return label.substring(0, maxLength - 3) + "...";
}

/**
 * 截断问题中所有选项的标签
 * @param args - AskUserQuestion 工具的参数
 * @returns 处理后的参数（标签已截断）
 */
function truncateQuestionLabels(args: AskUserQuestionArgs): AskUserQuestionArgs {
  if (!args.questions || !Array.isArray(args.questions)) {
    return args;
  }

  return {
    ...args,
    questions: args.questions.map((question) => ({
      ...question,
      options: question.options?.map((option) => ({
        ...option,
        label: truncateLabel(option.label),
      })) ?? [],
    })),
  };
}

/**
 * 创建问题标签截断钩子
 * 
 * 在 PreToolUse 阶段拦截 AskUserQuestion 工具调用，
 * 自动截断过长的选项标签以保持 UI 整洁。
 * 
 * @returns PreToolUse 钩子对象
 */
export function createQuestionLabelTruncatorHook() {
  return {
    "tool.execute.before": async (
      input: { tool: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      const toolName = input.tool?.toLowerCase();

      if (toolName === "askuserquestion" || toolName === "ask_user_question") {
        const args = output.args as unknown as AskUserQuestionArgs | undefined;

        if (args?.questions) {
          const truncatedArgs = truncateQuestionLabels(args);
          Object.assign(output.args, truncatedArgs);
        }
      }
    },
  };
}
