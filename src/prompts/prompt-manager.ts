import * as vscode from 'vscode';
import {
    BASE_IDENTITY,
    CODE_GENERATION_INSTRUCTIONS,
    CHINESE_INSTRUCTIONS,
    TOOL_INSTRUCTIONS,
    EDIT_INSTRUCTIONS,
    REMINDER_TEMPLATE
} from './prompt-templates';
// ========== 上下文感知功能（已注释） ==========
// import { ContextInfo, ContextCollector } from '../context/context-collector';

export type PromptMode = 'enhanced';

export interface PromptConfig {
    customSystemPrompt?: string;
    // ========== 上下文感知功能（已注释） ==========
    // workspaceContext?: string; // 工作区上下文字符串（由ContextCollector生成）
}

export class PromptManager {
    private static instance: PromptManager;
    
    public static getInstance(): PromptManager {
        if (!PromptManager.instance) {
            PromptManager.instance = new PromptManager();
        }
        return PromptManager.instance;
    }

    /**
     * 构建系统提示词
     * @param config 配置对象
     * @returns 完整的系统提示词
     */
    public buildSystemPrompt(config: PromptConfig): string {
        let systemPrompt = '';

        // 1. 基础身份定义
        systemPrompt += BASE_IDENTITY + '\n\n';

        // 2. 使用增强模式指令
        systemPrompt += this.getEnhancedInstructions() + '\n\n';

        // 3. 添加代码生成专用指令
        systemPrompt += CODE_GENERATION_INSTRUCTIONS + '\n\n';

        // 4. 添加中文特色指令
        systemPrompt += CHINESE_INSTRUCTIONS + '\n\n';

        // 5. 添加工具使用指导
        systemPrompt += '<toolUseInstructions>\n' + TOOL_INSTRUCTIONS + '\n</toolUseInstructions>\n\n';

        // 6. 添加编程最佳实践
        systemPrompt += '<editFileInstructions>\n' + EDIT_INSTRUCTIONS + '\n</editFileInstructions>\n\n';

        // 7. 添加当前工作区上下文
        systemPrompt += this.getCurrentWorkspaceContext() + '\n\n';

        // 8. 添加提醒
        systemPrompt += REMINDER_TEMPLATE + '\n\n';

        // 9. 添加自定义系统提示词（如果有）
        if (config.customSystemPrompt && config.customSystemPrompt.trim()) {
            systemPrompt += '<customInstructions>\n' + config.customSystemPrompt.trim() + '\n</customInstructions>\n\n';
        }

        // ========== 上下文感知功能（已注释） ==========
        // // 2. 添加工作区上下文（动态注入）
        // if (config.workspaceContext) {
        //     systemPrompt += '\n\n' + config.workspaceContext;
        // }

        return systemPrompt.trim();
    }

    /**
     * 获取增强模式指令
     */
    private getEnhancedInstructions(): string {
        return `## 增强模式指令

专注代码生成、分析、优化和问题诊断。
确保代码正确性和可运行性，遵循最佳实践。
用中文交流，提供清晰的解释和注释。`;
    }

    /**
     * 获取当前工作区上下文
     */
    private getCurrentWorkspaceContext(): string {
        // 这里返回一个基础的结构描述
        // 实际实现中可以遍历文件系统获取更详细的结构
        return '```\n项目根目录/\n├── src/\n├── package.json\n├── README.md\n└── ...\n```\n此工作区结构的视图可能被截断。如果需要，可以使用工具收集更多上下文。';
    }
}