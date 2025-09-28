import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import {
    BASE_IDENTITY,
    CORE_INSTRUCTIONS,
    TOOL_INSTRUCTIONS,
    EDIT_INSTRUCTIONS,
    CHINESE_INSTRUCTIONS,
    CODE_GENERATION_INSTRUCTIONS,
    CONTEXT_TEMPLATE,
    REMINDER_TEMPLATE
} from './prompt-templates';

export type PromptMode = 'basic' | 'enhanced';

export interface PromptConfig {
    promptMode: PromptMode;
    enableToolInstructions: boolean;
    enableCodingBestPractices: boolean;
    enableChineseInstructions: boolean;
    fastMode: boolean;
    customSystemPrompt?: string;
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
        // 快速模式：使用简化的系统提示词
        if (config.fastMode) {
            return this.buildFastSystemPrompt(config);
        }

        let systemPrompt = '';

        // 1. 基础身份定义（始终包含）
        systemPrompt += BASE_IDENTITY + '\n\n';

        // 2. 根据模式添加不同的指令
        switch (config.promptMode) {
            case 'enhanced':
                systemPrompt += this.getEnhancedInstructions() + '\n\n';
                break;
            case 'basic':
            default:
                systemPrompt += this.getBasicInstructions() + '\n\n';
                break;
        }

        // 3. 添加代码生成专用指令（作为参考，不强制执行）
        systemPrompt += CODE_GENERATION_INSTRUCTIONS + '\n\n';

        // 4. 添加中文特色指令（如果启用）
        if (config.enableChineseInstructions) {
            systemPrompt += CHINESE_INSTRUCTIONS + '\n\n';
        }

        // 5. 添加工具使用指导（如果启用）
        if (config.enableToolInstructions) {
            systemPrompt += '<toolUseInstructions>\n' + TOOL_INSTRUCTIONS + '\n</toolUseInstructions>\n\n';
        }

        // 6. 添加编程最佳实践（如果启用）
        if (config.enableCodingBestPractices) {
            systemPrompt += '<editFileInstructions>\n' + EDIT_INSTRUCTIONS + '\n</editFileInstructions>\n\n';
        }

        // 7. 添加当前工作区上下文
        systemPrompt += this.getCurrentWorkspaceContext() + '\n\n';

        // 8. 添加提醒
        systemPrompt += REMINDER_TEMPLATE + '\n\n';

        // 9. 添加自定义系统提示词（如果有）
        if (config.customSystemPrompt && config.customSystemPrompt.trim()) {
            systemPrompt += '<customInstructions>\n' + config.customSystemPrompt.trim() + '\n</customInstructions>\n\n';
        }

        return systemPrompt.trim();
    }

    /**
     * 构建快速模式的系统提示词（精简版）
     */
    private buildFastSystemPrompt(config: PromptConfig): string {
        let systemPrompt = '';

        // 极简但严格的代码生成指令
        systemPrompt += `代码生成机器模式：
- 第一个字符：<template>
- 最后一个字符：</style>
- 中间：标准Vue组件代码
- 禁止：任何解释、标记、说明
- 【重要】所有注释必须使用中文

Vue标准：
<template>
  <div class="component">
    <!-- 显示标题 -->
    <h1>{{ title }}</h1>
  </div>
</template>

<script>
export default {
  data() {
    return {
      title: 'Hello'
    }
  }
}
</script>

<style scoped>
/* 组件样式 */
.component {
  padding: 10px;
}
</style>

只输出上述格式的代码，无其他内容。\n\n`;

        // 添加自定义系统提示词（如果有）
        if (config.customSystemPrompt && config.customSystemPrompt.trim()) {
            systemPrompt += config.customSystemPrompt.trim() + '\n\n';
        }

        return systemPrompt.trim();
    }

    /**
     * 获取基础指令
     */
    private getBasicInstructions(): string {
        return `<instructions>
你是一个专业的代码分析和生成助手。
请根据用户的要求分析代码、生成代码或解答编程相关问题。
保持回答准确、简洁、有用。
</instructions>`;
    }

    /**
     * 获取增强指令
     */
    private getEnhancedInstructions(): string {
        return `<instructions>
${CORE_INSTRUCTIONS}
</instructions>`;
    }


    /**
     * 获取当前工作区上下文
     */
    private getCurrentWorkspaceContext(): string {
        const currentDate = new Date().toLocaleDateString('zh-CN');
        const operatingSystem = this.getOperatingSystemName();
        const workspaceFolder = this.getWorkspaceFolder();
        const workspaceStructure = this.getWorkspaceStructure();

        return CONTEXT_TEMPLATE
            .replace('{currentDate}', currentDate)
            .replace('{operatingSystem}', operatingSystem)
            .replace('{workspaceFolder}', workspaceFolder)
            .replace('{workspaceStructure}', workspaceStructure);
    }

    /**
     * 获取操作系统名称
     */
    private getOperatingSystemName(): string {
        const platform = os.platform();
        switch (platform) {
            case 'win32':
                return 'Windows';
            case 'darwin':
                return 'macOS';
            case 'linux':
                return 'Linux';
            default:
                return platform;
        }
    }

    /**
     * 获取工作区文件夹路径
     */
    private getWorkspaceFolder(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders.map(folder => `- ${folder.uri.fsPath}`).join('\n');
        }
        return '- 未打开工作区';
    }

    /**
     * 获取工作区结构（简化版）
     */
    private getWorkspaceStructure(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '```\n无工作区结构\n```';
        }

        // 这里返回一个基础的结构描述
        // 实际实现中可以遍历文件系统获取更详细的结构
        return '```\n项目根目录/\n├── src/\n├── package.json\n├── README.md\n└── ...\n```\n此工作区结构的视图可能被截断。如果需要，可以使用工具收集更多上下文。';
    }

    /**
     * 从VSCode配置创建PromptConfig
     */
    public static createConfigFromVSCode(): PromptConfig {
        const config = vscode.workspace.getConfiguration('ccdcCodeGen');
        
        return {
            promptMode: config.get<PromptMode>('promptMode', 'enhanced'),
            enableToolInstructions: config.get<boolean>('enableToolInstructions', true),
            enableCodingBestPractices: config.get<boolean>('enableCodingBestPractices', true),
            enableChineseInstructions: config.get<boolean>('enableChineseInstructions', true),
            fastMode: config.get<boolean>('fastMode', false),
            customSystemPrompt: config.get<string>('systemPrompt', '')
        };
    }
}
