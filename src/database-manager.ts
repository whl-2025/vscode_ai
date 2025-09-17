// SQLite数据库管理器 - 存储聊天历史和文件生成记录
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// 数据接口定义
export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    user_id: string;
    metadata?: any;
}

export interface ChatMessage {
    id?: number;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    token_count?: number;
    metadata?: any;
}

export interface GeneratedFile {
    id?: number;
    session_id?: string;
    message_id?: number;
    file_name: string;
    file_path: string;
    language: string;
    original_code: string;
    cleaned_code: string;
    created_at: string;
    file_size: number;
}

export interface ContextFile {
    id?: number;
    message_id: number;
    file_path: string;
    file_name: string;
    file_content?: string;
    file_type?: string;
    created_at: string;
}

// 简化的SQLite实现（使用JSON文件模拟，避免依赖问题）
export class DatabaseManager {
    private dbPath: string;
    private data: {
        sessions: ChatSession[];
        messages: ChatMessage[];
        generated_files: GeneratedFile[];
        context_files: ContextFile[];
    };

    constructor(context: vscode.ExtensionContext, storageStrategy: 'workspace' | 'global' = 'global') {
        // 默认使用全局存储，确保稳定性
        const storageUri = context.globalStorageUri;
        console.log('DatabaseManager: 使用全局存储路径:', storageUri.fsPath);
        
        this.dbPath = path.join(storageUri.fsPath, 'chat_database.json');
        console.log('DatabaseManager: 最终数据库路径:', this.dbPath);
        
        // 初始化数据结构
        this.data = {
            sessions: [],
            messages: [],
            generated_files: [],
            context_files: []
        };
    }

    async initialize(): Promise<void> {
        try {
            // 确保存储目录存在
            const storageDir = path.dirname(this.dbPath);
            if (!fs.existsSync(storageDir)) {
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(storageDir));
            }

            // 加载现有数据
            await this.loadData();
            console.log(`Database initialized at: ${this.dbPath}`);
        } catch (error) {
            console.error('Database initialization failed:', error);
            // 如果加载失败，使用空数据结构
            await this.saveData();
        }
    }

    private async loadData(): Promise<void> {
        try {
            if (fs.existsSync(this.dbPath)) {
                const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(this.dbPath));
                const jsonData = JSON.parse(fileContent.toString());
                this.data = { ...this.data, ...jsonData };
            }
        } catch (error) {
            console.error('Failed to load database:', error);
        }
    }

    private async saveData(): Promise<void> {
        try {
            const jsonData = JSON.stringify(this.data, null, 2);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(this.dbPath), Buffer.from(jsonData, 'utf8'));
        } catch (error) {
            console.error('Failed to save database:', error);
        }
    }

    // 聊天会话管理
    async createChatSession(title: string): Promise<ChatSession> {
        const session: ChatSession = {
            id: Date.now().toString(),
            title,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'default'
        };

        this.data.sessions.unshift(session);
        await this.saveData();
        
        console.log(`Chat session created: ${session.id} - ${title}`);
        console.log(`Database path: ${this.dbPath}`);
        console.log(`Total sessions: ${this.data.sessions.length}`);
        
        return session;
    }

    async getChatSessions(): Promise<ChatSession[]> {
        return [...this.data.sessions].sort((a, b) => 
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
    }

    async updateChatSession(sessionId: string, updates: Partial<ChatSession>): Promise<void> {
        const sessionIndex = this.data.sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            this.data.sessions[sessionIndex] = {
                ...this.data.sessions[sessionIndex],
                ...updates,
                updated_at: new Date().toISOString()
            };
            await this.saveData();
        }
    }

    async deleteChatSession(sessionId: string): Promise<void> {
        // 删除会话
        this.data.sessions = this.data.sessions.filter(s => s.id !== sessionId);
        // 删除相关消息
        this.data.messages = this.data.messages.filter(m => m.session_id !== sessionId);
        // 删除相关上下文文件
        const messageIds = this.data.messages.filter(m => m.session_id === sessionId).map(m => m.id!);
        this.data.context_files = this.data.context_files.filter(f => !messageIds.includes(f.message_id));
        
        await this.saveData();
    }

    // 消息管理
    async addMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
        const newMessage: ChatMessage = {
            ...message,
            id: Date.now() + Math.random(), // 简单的ID生成
            timestamp: message.timestamp || new Date().toISOString()
        };

        this.data.messages.push(newMessage);
        
        // 更新会话的最后更新时间
        await this.updateChatSession(message.session_id, {});
        
        await this.saveData();
        
        console.log(`Message added: ${message.role} - ${message.content.substring(0, 50)}...`);
        console.log(`Session: ${message.session_id}, Total messages: ${this.data.messages.length}`);
        
        return newMessage.id!;
    }

    async getMessages(sessionId: string): Promise<ChatMessage[]> {
        return this.data.messages
            .filter(m => m.session_id === sessionId)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    async searchMessages(query: string): Promise<ChatMessage[]> {
        return this.data.messages
            .filter(m => m.content.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 50);
    }

    // 生成文件管理
    async addGeneratedFile(file: Omit<GeneratedFile, 'id' | 'created_at'>): Promise<number> {
        const newFile: GeneratedFile = {
            ...file,
            id: Date.now() + Math.random(),
            created_at: new Date().toISOString()
        };

        this.data.generated_files.push(newFile);
        await this.saveData();
        return newFile.id!;
    }

    async getGeneratedFiles(sessionId?: string): Promise<GeneratedFile[]> {
        let files = [...this.data.generated_files];
        
        if (sessionId) {
            files = files.filter(f => f.session_id === sessionId);
        }
        
        return files.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    async getGeneratedFilesByLanguage(language: string): Promise<GeneratedFile[]> {
        return this.data.generated_files
            .filter(f => f.language === language)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // 上下文文件管理
    async addContextFile(file: Omit<ContextFile, 'id' | 'created_at'>): Promise<number> {
        const newFile: ContextFile = {
            ...file,
            id: Date.now() + Math.random(),
            created_at: new Date().toISOString()
        };

        this.data.context_files.push(newFile);
        await this.saveData();
        return newFile.id!;
    }

    async getContextFiles(messageId: number): Promise<ContextFile[]> {
        return this.data.context_files.filter(f => f.message_id === messageId);
    }

    // 数据统计
    async getStats(): Promise<{
        totalSessions: number;
        totalMessages: number;
        totalGeneratedFiles: number;
        dbSize: number;
        languageStats: { [key: string]: number };
    }> {
        const languageStats: { [key: string]: number } = {};
        
        this.data.generated_files.forEach(file => {
            languageStats[file.language] = (languageStats[file.language] || 0) + 1;
        });

        let dbSize = 0;
        try {
            if (fs.existsSync(this.dbPath)) {
                const stats = fs.statSync(this.dbPath);
                dbSize = stats.size;
            }
        } catch (error) {
            console.error('Failed to get database size:', error);
        }

        return {
            totalSessions: this.data.sessions.length,
            totalMessages: this.data.messages.length,
            totalGeneratedFiles: this.data.generated_files.length,
            dbSize,
            languageStats
        };
    }

    // 数据清理
    async cleanupOldData(daysToKeep: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffTimestamp = cutoffDate.toISOString();

        // 清理旧会话
        const oldSessions = this.data.sessions.filter(s => s.updated_at < cutoffTimestamp);
        const oldSessionIds = oldSessions.map(s => s.id);
        
        this.data.sessions = this.data.sessions.filter(s => s.updated_at >= cutoffTimestamp);
        
        // 清理相关消息
        this.data.messages = this.data.messages.filter(m => !oldSessionIds.includes(m.session_id));
        
        // 清理相关生成文件记录
        this.data.generated_files = this.data.generated_files.filter(f => 
            !f.session_id || !oldSessionIds.includes(f.session_id)
        );

        await this.saveData();
        return oldSessions.length;
    }

    // 数据导出
    async exportData(): Promise<any> {
        return {
            ...this.data,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
    }

    // 数据导入
    async importData(importData: any): Promise<void> {
        if (importData.sessions) this.data.sessions = importData.sessions;
        if (importData.messages) this.data.messages = importData.messages;
        if (importData.generated_files) this.data.generated_files = importData.generated_files;
        if (importData.context_files) this.data.context_files = importData.context_files;
        
        await this.saveData();
    }

    // 迁移localStorage数据
    async migrateFromLocalStorage(localStorageData: any[]): Promise<void> {
        try {
            for (const oldChat of localStorageData) {
                // 创建会话
                const session: ChatSession = {
                    id: oldChat.id || Date.now().toString(),
                    title: oldChat.title || '未命名对话',
                    created_at: oldChat.createdAt || new Date().toISOString(),
                    updated_at: oldChat.updatedAt || new Date().toISOString(),
                    user_id: 'default'
                };
                
                this.data.sessions.push(session);

                // 迁移消息
                if (oldChat.messages && Array.isArray(oldChat.messages)) {
                    for (const oldMessage of oldChat.messages) {
                        const message: ChatMessage = {
                            id: Date.now() + Math.random(),
                            session_id: session.id,
                            role: oldMessage.role || 'user',
                            content: oldMessage.content || '',
                            timestamp: oldMessage.timestamp || new Date().toISOString()
                        };
                        
                        this.data.messages.push(message);
                    }
                }
            }

            await this.saveData();
            console.log('Successfully migrated localStorage data to database');
        } catch (error) {
            console.error('Failed to migrate localStorage data:', error);
            throw error;
        }
    }

    async close(): Promise<void> {
        // JSON文件数据库不需要显式关闭
        console.log('Database connection closed');
    }
}
