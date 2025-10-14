/**
 * 统一数据库管理器 - 混合方案实现
 * 管理主数据库和项目数据库，提供统一的API接口
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { MainDatabase } from './main-database';
import { ProjectDatabase } from './project-database';
import { 
    ProjectInfo, 
    ChatSession, 
    ChatMessage, 
    GeneratedFile, 
    ContextFile,
    CrossProjectSearchResult,
    ExportData,
    ImportData,
    GlobalStats,
    ProjectStats
} from './types';

export class DatabaseManager {
    private mainDb: MainDatabase;
    private currentProjectDb: ProjectDatabase | null = null;
    private currentProject: ProjectInfo | null = null;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.mainDb = new MainDatabase(context);
        this.initializeCurrentProject();
        console.log('DatabaseManager: 使用分文件存储方案');
    }

    /**
     * 初始化当前项目
     * 根据VS Code工作区自动检测并切换到对应项目
     */
    private initializeCurrentProject(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const currentPath = workspaceFolders[0].uri.fsPath;
            this.switchToProject(currentPath);
        } else {
            console.log('DatabaseManager: 未检测到工作区，等待项目切换');
        }
    }

    /**
     * 切换到指定项目
     * @param projectPath 项目路径
     * @returns 是否切换成功
     */
    async switchToProject(projectPath: string): Promise<boolean> {
        try {
            // 关闭当前项目数据库
            if (this.currentProjectDb) {
                this.currentProjectDb.close();
                this.currentProjectDb = null;
            }

            // 从主数据库获取或注册项目信息
            this.currentProject = await this.mainDb.switchToProject(projectPath);
            if (!this.currentProject) {
                console.error('Failed to switch to project:', projectPath);
                return false;
            }

            // 使用项目名称而不是ID
            const projectName = this.currentProject.project_name;
            
            // 打开项目数据库（使用分文件存储）
            this.currentProjectDb = new ProjectDatabase(this.context, projectName);
            
            console.log(`DatabaseManager: 已切换到项目 ${projectName}`);
            return true;
        } catch (error) {
            console.error('Error switching to project:', error);
            return false;
        }
    }

    /**
     * 获取当前项目信息
     */
    getCurrentProject(): ProjectInfo | null {
        return this.currentProject;
    }

    /**
     * 获取所有项目列表
     */
    async getAllProjects(): Promise<ProjectInfo[]> {
        return await this.mainDb.getAllProjects();
    }

    /**
     * 创建新的聊天会话
     */
    async createChatSession(title: string): Promise<ChatSession> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }
        return await this.currentProjectDb.createChatSession(title);
    }

    /**
     * 获取当前项目的所有聊天会话
     */
    async getChatSessions(): Promise<ChatSession[]> {
        if (!this.currentProjectDb) {
            return [];
        }
        return await this.currentProjectDb.getChatSessions();
    }

    /**
     * 更新聊天会话
     */
    async updateChatSession(sessionId: string, updates: Partial<ChatSession>): Promise<void> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }
        return await this.currentProjectDb.updateChatSession(sessionId, updates);
    }

    /**
     * 删除聊天会话
     */
    async deleteChatSession(sessionId: string): Promise<void> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }
        return await this.currentProjectDb.deleteChatSession(sessionId);
    }

    /**
     * 添加消息到当前会话
     */
    async addMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }
        return await this.currentProjectDb.addMessage(message);
    }

    /**
     * 获取会话的所有消息
     */
    async getMessages(sessionId: string): Promise<ChatMessage[]> {
        if (!this.currentProjectDb) {
            return [];
        }
        return await this.currentProjectDb.getMessages(sessionId);
    }

    /**
     * 在当前项目中搜索消息
     */
    async searchMessages(query: string): Promise<ChatMessage[]> {
        if (!this.currentProjectDb) {
            return [];
        }
        return await this.currentProjectDb.searchMessages(query);
    }

    /**
     * 跨项目搜索消息
     */
    async searchAcrossProjects(query: string): Promise<CrossProjectSearchResult[]> {
        const allProjects = await this.getAllProjects();
        const results: CrossProjectSearchResult[] = [];

        for (const project of allProjects) {
            try {
                const projectDb = new ProjectDatabase(this.context, project.db_file_name);
                const messages = await projectDb.searchMessages(query);
                
                for (const message of messages) {
                    results.push({
                        project_name: project.project_name,
                        project_path: project.project_path,
                        session_id: message.session_id,
                        message_id: message.id!,
                        content: message.content,
                        timestamp: message.timestamp,
                        match_count: (message.content.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length
                    });
                }
                
                projectDb.close();
            } catch (error) {
                console.error(`Error searching in project ${project.project_name}:`, error);
            }
        }

        // 按匹配数量排序
        return results.sort((a, b) => b.match_count - a.match_count);
    }

    /**
     * 添加生成文件记录
     */
    async addGeneratedFile(file: Omit<GeneratedFile, 'id'>): Promise<void> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }
        return await this.currentProjectDb.addGeneratedFile(file);
    }

    /**
     * 获取生成文件记录
     */
    async getGeneratedFiles(sessionId?: string): Promise<GeneratedFile[]> {
        if (!this.currentProjectDb) {
            return [];
        }
        return await this.currentProjectDb.getGeneratedFiles(sessionId);
    }

    /**
     * 获取全局统计信息
     */
    async getGlobalStats(): Promise<GlobalStats> {
        return await this.mainDb.getGlobalStats();
    }

    /**
     * 获取当前项目统计信息
     */
    async getProjectStats(): Promise<ProjectStats> {
        if (!this.currentProjectDb) {
            return {
                id: 1,
                total_sessions: 0,
                total_messages: 0,
                total_files: 0,
                language_stats: '{}',
                last_updated: new Date().toISOString()
            };
        }
        return await this.currentProjectDb.getProjectStats();
    }

    /**
     * 导出当前项目数据
     */
    async exportProjectData(): Promise<ExportData> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }

        const sessions = await this.getChatSessions();
        const messages: ChatMessage[] = [];
        const generatedFiles: GeneratedFile[] = [];
        const contextFiles: ContextFile[] = [];

        for (const session of sessions) {
            const sessionMessages = await this.getMessages(session.id);
            messages.push(...sessionMessages);
        }

        const files = await this.getGeneratedFiles();
        generatedFiles.push(...files);

        return {
            sessions,
            messages,
            generated_files: generatedFiles,
            context_files: contextFiles
        };
    }

    /**
     * 导入项目数据
     */
    async importProjectData(data: ImportData): Promise<void> {
        if (!this.currentProjectDb) {
            throw new Error('No active project database');
        }

        // 导入会话
        for (const session of data.sessions) {
            await this.createChatSession(session.title);
            await this.updateChatSession(session.id, session);
        }

        // 导入消息
        for (const message of data.messages) {
            await this.addMessage(message);
        }

        // 导入生成文件
        for (const file of data.generated_files) {
            await this.addGeneratedFile(file);
        }
    }

    /**
     * 获取存储类型
     */
    getStorageType(): 'sqlite' | 'json' {
        return this.mainDb.getStorageType();
    }

    /**
     * 检查SQLite是否可用
     */
    isSQLiteAvailable(): boolean {
        return this.mainDb.isSQLiteAvailable();
    }

    /**
     * 关闭所有数据库连接
     */
    async close(): Promise<void> {
        if (this.currentProjectDb) {
            this.currentProjectDb.close();
            this.currentProjectDb = null;
        }
        this.mainDb.close();
        this.currentProject = null;
    }
}

// 导出类型以供外部使用
export {
    ProjectInfo,
    ChatSession,
    ChatMessage,
    GeneratedFile,
    ContextFile,
    CrossProjectSearchResult,
    ExportData,
    ImportData,
    GlobalStats,
    ProjectStats
};
