import * as vscode from 'vscode';
import {
    BASE_IDENTITY
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
        let systemPrompt = BASE_IDENTITY;

        // 添加自定义系统提示词（如果有）
        if (config.customSystemPrompt && config.customSystemPrompt.trim()) {
            systemPrompt += '\n\n' + config.customSystemPrompt.trim();
        }

        // ========== 上下文感知功能（已注释） ==========
        // // 2. 添加工作区上下文（动态注入）
        // if (config.workspaceContext) {
        //     systemPrompt += '\n\n' + config.workspaceContext;
        // }

        return systemPrompt.trim();
    }
}