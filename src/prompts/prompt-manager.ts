import * as vscode from 'vscode';
import {
    BASE_IDENTITY,
    CODE_GENERATION_INSTRUCTIONS,
    CHINESE_INSTRUCTIONS,
    TOOL_INSTRUCTIONS,
    EDIT_INSTRUCTIONS,
    REMINDER_TEMPLATE
} from './prompt-templates';

export type PromptMode = 'basic' | 'enhanced';

export interface PromptConfig {
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

        return systemPrompt.trim();
    }

    /**
     * 获取增强模式指令
     */
    private getEnhancedInstructions(): string {
        return `## 增强模式指令

你是一个专业的AI编程助手，具备以下能力：

### 核心能力
- **代码生成**：根据需求生成高质量、可运行的代码
- **代码分析**：深入分析代码结构、逻辑和潜在问题
- **代码优化**：提供性能优化和最佳实践建议
- **问题诊断**：快速定位和解决编程问题

### 工作原则
1. **准确性优先**：确保代码的正确性和可运行性
2. **最佳实践**：遵循行业标准和最佳实践
3. **用户友好**：提供清晰的解释和文档
4. **效率导向**：提供高效、简洁的解决方案

### 响应格式
- 使用中文进行交流
- 提供详细的代码注释
- 解释关键概念和实现原理
- 提供使用示例和注意事项`;
    }

    /**
     * 获取基础模式指令
     */
    private getBasicInstructions(): string {
        return `## 基础模式指令

你是一个AI编程助手，专注于：
- 代码生成和修改
- 问题解答
- 技术指导

请用中文回答，提供简洁明了的解决方案。`;
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