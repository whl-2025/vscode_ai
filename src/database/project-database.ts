/**
 * 项目数据库管理器 - 管理单个项目的聊天数据
 * 负责管理指定项目的聊天会话、消息、生成文件等数据
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChatSession, ChatMessage, GeneratedFile, ContextFile, ProjectStats } from './types';

// SQLite相关代码已注释，使用JSON存储方案
// let Database: any = null;

// 在VS Code扩展环境中，原生SQLite模块不可用
// 使用JSON存储作为主要方案，保持SQLite API接口以便将来迁移
console.log('ProjectDatabase: Using JSON storage (VS Code extension environment)');

export class ProjectDatabase {
    private db: any;
    private dbPath: string;
    private jsonPath: string = '';
    private useSQLite: boolean = false;
    
    // 分文件存储路径
    private projectDir: string;
    private sessionsPath: string;
    private messagesPath: string;
    private filesPath: string;
    private contextPath: string;
    private statsPath: string;

    constructor(context: vscode.ExtensionContext, projectName: string) {
        const storageUri = context.globalStorageUri;
        
        // 清理项目名称，移除非法字符
        const cleanProjectName = this.sanitizeProjectName(projectName);
        this.dbPath = path.join(storageUri.fsPath, `project_${cleanProjectName}.sqlite`);
        
        // 分文件存储路径 - 使用项目名称作为目录名
        this.projectDir = path.join(storageUri.fsPath, 'projects', cleanProjectName);
        this.sessionsPath = path.join(this.projectDir, 'sessions.json');
        this.messagesPath = path.join(this.projectDir, 'messages.json');
        this.filesPath = path.join(this.projectDir, 'generated_files.json');
        this.contextPath = path.join(this.projectDir, 'context_files.json');
        this.statsPath = path.join(this.projectDir, 'stats.json');
        
        // 确保项目目录存在
        if (!fs.existsSync(this.projectDir)) {
            fs.mkdirSync(this.projectDir, { recursive: true });
        }
        
        // 在VS Code扩展环境中，直接使用分文件JSON存储
        console.log(`ProjectDatabase: Using 分文件存储 for project ${cleanProjectName}`);
        this.useSQLite = false;
        this.initializeJSON();
    }

    /**
     * 创建项目数据库表结构（SQLite版本 - 已注释）
     */
    // private createTables(): void {
    //     if (!this.useSQLite) return;
        
    //     this.db.exec(`
    //         -- 聊天会话表：存储聊天会话的基本信息
    //         CREATE TABLE IF NOT EXISTS chat_sessions (
    //             id TEXT PRIMARY KEY,                                    -- 会话ID，使用时间戳生成
    //             title TEXT NOT NULL,                                   -- 会话标题，用户可自定义
    //             created_at TEXT NOT NULL,                              -- 会话创建时间
    //             updated_at TEXT NOT NULL,                              -- 会话最后更新时间
    //             user_id TEXT DEFAULT 'default',                        -- 用户ID，默认为'default'
    //             metadata TEXT                                          -- 会话元数据，JSON格式存储额外信息
    //         );
    //
    //         -- 聊天消息表：存储所有聊天消息
    //         CREATE TABLE IF NOT EXISTS chat_messages (
    //             id INTEGER PRIMARY KEY AUTOINCREMENT,                  -- 消息ID，主键，自增
    //             session_id TEXT NOT NULL,                              -- 所属会话ID，外键关联chat_sessions.id
    //             role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')), -- 消息角色：user（用户）、assistant（AI助手）、system（系统）
    //             content TEXT NOT NULL,                                 -- 消息内容
    //             timestamp TEXT NOT NULL,                               -- 消息时间戳
    //             token_count INTEGER,                                   -- Token数量统计，用于成本计算
    //             metadata TEXT,                                         -- 消息元数据，JSON格式存储额外信息
    //             FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    //         );
    //
    //         -- 生成文件记录表：记录AI生成的文件
    //         CREATE TABLE IF NOT EXISTS generated_files (
    //             id INTEGER PRIMARY KEY AUTOINCREMENT,                  -- 文件记录ID，主键，自增
    //             session_id TEXT,                                       -- 所属会话ID，外键关联chat_sessions.id
    //             message_id INTEGER,                                    -- 所属消息ID，外键关联chat_messages.id
    //             file_name TEXT NOT NULL,                               -- 文件名
    //             file_path TEXT NOT NULL,                               -- 文件完整路径
    //             language TEXT NOT NULL,                                -- 编程语言类型
    //             original_code TEXT,                                    -- 原始生成的代码内容
    //             cleaned_code TEXT,                                     -- 清理后的代码内容
    //             created_at TEXT NOT NULL,                              -- 文件创建时间
    //             file_size INTEGER DEFAULT 0,                           -- 文件大小（字节）
    //             FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    //             FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
    //         );
    //
    //         -- 上下文文件表：记录聊天时使用的上下文文件
    //         CREATE TABLE IF NOT EXISTS context_files (
    //             id INTEGER PRIMARY KEY AUTOINCREMENT,                  -- 上下文文件ID，主键，自增
    //             message_id INTEGER NOT NULL,                           -- 所属消息ID，外键关联chat_messages.id
    //             file_path TEXT NOT NULL,                               -- 文件完整路径
    //             file_name TEXT NOT NULL,                               -- 文件名
    //             file_content TEXT,                                     -- 文件内容快照（可选，用于离线查看）
    //             file_type TEXT,                                        -- 文件类型（扩展名）
    //             created_at TEXT NOT NULL,                              -- 记录创建时间
    //             FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
    //         );
    //
    //         -- 项目统计信息表：存储当前项目的统计信息
    //         CREATE TABLE IF NOT EXISTS project_stats (
    //             id INTEGER PRIMARY KEY,                                -- 统计记录ID
    //             total_sessions INTEGER DEFAULT 0,                      -- 总会话数量
    //             total_messages INTEGER DEFAULT 0,                      -- 总消息数量
    //             total_files INTEGER DEFAULT 0,                         -- 总生成文件数量
    //             language_stats TEXT,                                   -- 编程语言统计，JSON格式：{"javascript": 5, "python": 3}
    //             last_updated TEXT NOT NULL                             -- 统计信息最后更新时间
    //         );
    //
    //         -- 创建索引以提高查询性能
    //         CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
    //         CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON chat_messages(timestamp);
    //         CREATE INDEX IF NOT EXISTS idx_files_session ON generated_files(session_id);
    //         CREATE INDEX IF NOT EXISTS idx_files_message ON generated_files(message_id);
    //         CREATE INDEX IF NOT EXISTS idx_context_message ON context_files(message_id);
    //
    //         -- 插入默认的项目统计记录
    //         INSERT OR IGNORE INTO project_stats (id, total_sessions, total_messages, total_files, language_stats, last_updated) 
    //         VALUES (1, 0, 0, 0, '{}', datetime('now'));
    //     `);
    // }

    /**
     * 初始化分文件存储方案
     * 创建项目数据库分文件结构，包含聊天会话、消息、文件等数据
     */
    private initializeJSON(): void {
        try {
            // 初始化会话文件 - 空数组
            if (!fs.existsSync(this.sessionsPath)) {
                const sessionsData: any[] = [];
                fs.writeFileSync(this.sessionsPath, JSON.stringify(sessionsData, null, 2));
            }

            // 初始化消息文件 - 空数组
            if (!fs.existsSync(this.messagesPath)) {
                const messagesData: any[] = [];
                fs.writeFileSync(this.messagesPath, JSON.stringify(messagesData, null, 2));
            }

            // 初始化生成文件记录 - 空数组
            if (!fs.existsSync(this.filesPath)) {
                const filesData: any[] = [];
                fs.writeFileSync(this.filesPath, JSON.stringify(filesData, null, 2));
            }

            // 初始化上下文文件记录 - 空数组
            if (!fs.existsSync(this.contextPath)) {
                const contextData: any[] = [];
                fs.writeFileSync(this.contextPath, JSON.stringify(contextData, null, 2));
            }

            // 初始化统计文件
            if (!fs.existsSync(this.statsPath)) {
                const statsData = {
                    id: 1,                              // 统计记录唯一标识符
                    total_sessions: 0,                  // 总会话数量
                    total_messages: 0,                  // 总消息数量
                    total_files: 0,                     // 总生成文件数量
                    language_stats: '{}',               // 编程语言统计，JSON格式：{"javascript": 5, "python": 3}
                    last_updated: new Date().toISOString()  // 统计信息最后更新时间，ISO格式
                };
                fs.writeFileSync(this.statsPath, JSON.stringify(statsData, null, 2));
            }

            console.log('ProjectDatabase: 分文件存储初始化成功 - 所有文件为空数组');
        } catch (err) {
            console.error('Failed to initialize JSON storage:', err);
        }
    }

    /**
     * 清理项目名称，移除非法字符，并添加哈希值确保唯一性
     */
    private sanitizeProjectName(projectName: string): string {
        // 移除或替换文件系统不允许的字符
        let cleanName = projectName
            .replace(/[<>:"/\\|?*]/g, '_')  // 替换非法字符为下划线
            .replace(/\s+/g, '_')           // 替换空格为下划线
            .replace(/_{2,}/g, '_')         // 合并多个下划线
            .replace(/^_|_$/g, '');         // 移除开头和结尾的下划线
        
        // 生成8位哈希值确保唯一性
        const hash = require('crypto').createHash('md5').update(projectName).digest('hex').substring(0, 8);
        
        // 组合名称和哈希值
        const finalName = `${cleanName}_${hash}`;
        
        // 限制总长度（Windows路径限制）
        if (finalName.length > 100) {
            const maxCleanNameLength = 100 - 9; // 减去 "_" + 8位哈希
            return `${cleanName.substring(0, maxCleanNameLength)}_${hash}`;
        }
        
        // 如果清理后为空，使用默认名称
        if (!cleanName) {
            return `default_project_${hash}`;
        }
        
        return finalName;
    }

    /**
     * 读取分文件数据
     */
    private readData(filePath: string): any {
        try {
            console.log(`ProjectDatabase: 尝试读取文件: ${filePath}`);
            console.log(`ProjectDatabase: 文件是否存在: ${fs.existsSync(filePath)}`);
            
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                console.log(`ProjectDatabase: 文件内容长度: ${data.length}`);
                console.log(`ProjectDatabase: 文件内容预览: ${data.substring(0, 200)}...`);
                
                const parsed = JSON.parse(data);
                console.log(`ProjectDatabase: 解析后的数据类型: ${Array.isArray(parsed) ? 'Array' : typeof parsed}`);
                console.log(`ProjectDatabase: 解析后的数据长度: ${Array.isArray(parsed) ? parsed.length : 'N/A'}`);
                
                return parsed;
            } else {
                console.log(`ProjectDatabase: 文件不存在，返回空数组`);
                return [];
            }
        } catch (error) {
            console.error(`ProjectDatabase: 读取文件失败 ${filePath}:`, error);
            return [];
        }
    }

    /**
     * 写入分文件数据
     */
    private writeData(filePath: string, data: any): void {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error writing ${filePath}:`, error);
        }
    }

    /**
     * 创建新的聊天会话
     */
    async createChatSession(title: string): Promise<ChatSession> {
        const session: ChatSession = {
            id: Date.now().toString(),
            title,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_id: 'default'
        };

        if (this.useSQLite) {
            const stmt = this.db.prepare(`
                INSERT INTO chat_sessions (id, title, created_at, updated_at, user_id)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(session.id, session.title, session.created_at, session.updated_at, session.user_id);
        } else {
            // 分文件存储
            const sessions = this.readData(this.sessionsPath);
            const stats = this.readData(this.statsPath);
            
            sessions.push(session);
            stats.total_sessions += 1;
            stats.last_updated = new Date().toISOString();
            
            this.writeData(this.sessionsPath, sessions);
            this.writeData(this.statsPath, stats);
        }

        return session;
    }

    /**
     * 获取所有聊天会话
     */
    async getChatSessions(): Promise<ChatSession[]> {
        console.log('ProjectDatabase: 获取聊天会话...');
        console.log('ProjectDatabase: 使用SQLite:', this.useSQLite);
        console.log('ProjectDatabase: 会话文件路径:', this.sessionsPath);
        
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM chat_sessions ORDER BY created_at DESC');
            return stmt.all();
        } else {
            // 分文件存储
            console.log('ProjectDatabase: 读取会话文件...');
            const sessions = this.readData(this.sessionsPath);
            console.log('ProjectDatabase: 原始会话数据:', sessions);
            
            const sortedSessions = sessions.sort((a: ChatSession, b: ChatSession) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            console.log('ProjectDatabase: 排序后的会话数据:', sortedSessions);
            
            return sortedSessions;
        }
    }

    /**
     * 更新聊天会话
     */
    async updateChatSession(sessionId: string, updates: Partial<ChatSession>): Promise<void> {
        const now = new Date().toISOString();
        
        if (this.useSQLite) {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(now, sessionId);
            
            const stmt = this.db.prepare(`
                UPDATE chat_sessions SET ${setClause}, updated_at = ? WHERE id = ?
            `);
            stmt.run(...values);
        } else {
            // 分文件存储
            const sessions = this.readData(this.sessionsPath);
            const session = sessions.find((s: ChatSession) => s.id === sessionId);
            if (session) {
                Object.assign(session, updates);
                session.updated_at = now;
                this.writeData(this.sessionsPath, sessions);
            }
        }
    }

    /**
     * 删除聊天会话
     */
    async deleteChatSession(sessionId: string): Promise<void> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
            stmt.run(sessionId);
        } else {
            // 分文件存储
            const sessions = this.readData(this.sessionsPath);
            const messages = this.readData(this.messagesPath);
            const files = this.readData(this.filesPath);
            const stats = this.readData(this.statsPath);
            
            // 删除会话
            const filteredSessions = sessions.filter((s: ChatSession) => s.id !== sessionId);
            const filteredMessages = messages.filter((m: ChatMessage) => m.session_id !== sessionId);
            const filteredFiles = files.filter((f: GeneratedFile) => f.session_id !== sessionId);
            
            // 更新统计
            (stats as any).total_sessions = filteredSessions.length;
            (stats as any).total_messages = filteredMessages.length;
            (stats as any).total_files = filteredFiles.length;
            (stats as any).last_updated = new Date().toISOString();
            
            this.writeData(this.sessionsPath, filteredSessions);
            this.writeData(this.messagesPath, filteredMessages);
            this.writeData(this.filesPath, filteredFiles);
            this.writeData(this.statsPath, stats);
        }
    }

    /**
     * 添加消息到会话
     */
    async addMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
        if (this.useSQLite) {
            const stmt = this.db.prepare(`
                INSERT INTO chat_messages (session_id, role, content, timestamp, token_count, metadata)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
                message.session_id,
                message.role,
                message.content,
                message.timestamp,
                message.token_count,
                message.metadata ? JSON.stringify(message.metadata) : null
            );
            return result.lastInsertRowid;
        } else {
            // 分文件存储
            const messages = this.readData(this.messagesPath);
            const stats = this.readData(this.statsPath);
            
            const newMessage: ChatMessage = {
                id: messages.length > 0 ? Math.max(...messages.map((m: ChatMessage) => m.id)) + 1 : 1,
                ...message
            };
            
            messages.push(newMessage);
            (stats as any).total_messages += 1;
            (stats as any).last_updated = new Date().toISOString();
            
            this.writeData(this.messagesPath, messages);
            this.writeData(this.statsPath, stats);
            
            return newMessage.id!;
        }
    }

    /**
     * 获取会话的所有消息
     */
    async getMessages(sessionId: string): Promise<ChatMessage[]> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC');
            return stmt.all(sessionId);
        } else {
            // 分文件存储
            const messages = this.readData(this.messagesPath);
            return messages
                .filter((m: ChatMessage) => m.session_id === sessionId)
                .sort((a: ChatMessage, b: ChatMessage) => 
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
        }
    }

    /**
     * 搜索消息内容
     */
    async searchMessages(query: string): Promise<ChatMessage[]> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM chat_messages WHERE content LIKE ? ORDER BY timestamp DESC');
            return stmt.all(`%${query}%`);
        } else {
            // 分文件存储
            const messages = this.readData(this.messagesPath);
            return messages
                .filter((m: ChatMessage) => m.content.toLowerCase().includes(query.toLowerCase()))
                .sort((a: ChatMessage, b: ChatMessage) => 
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );
        }
    }

    /**
     * 添加生成文件记录
     */
    async addGeneratedFile(file: Omit<GeneratedFile, 'id'>): Promise<void> {
        if (this.useSQLite) {
            const stmt = this.db.prepare(`
                INSERT INTO generated_files (session_id, message_id, file_name, file_path, language, original_code, cleaned_code, created_at, file_size)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                file.session_id,
                file.message_id,
                file.file_name,
                file.file_path,
                file.language,
                file.original_code,
                file.cleaned_code,
                file.created_at,
                file.file_size
            );
        } else {
            // 分文件存储
            const files = this.readData(this.filesPath);
            const stats = this.readData(this.statsPath);
            
            const newFile: GeneratedFile = {
                id: files.length > 0 ? Math.max(...files.map((f: GeneratedFile) => f.id)) + 1 : 1,
                ...file
            };
            
            files.push(newFile);
            (stats as any).total_files += 1;
            (stats as any).last_updated = new Date().toISOString();
            
            this.writeData(this.filesPath, files);
            this.writeData(this.statsPath, stats);
        }
    }

    /**
     * 获取生成文件记录
     */
    async getGeneratedFiles(sessionId?: string): Promise<GeneratedFile[]> {
        if (this.useSQLite) {
            if (sessionId) {
                const stmt = this.db.prepare('SELECT * FROM generated_files WHERE session_id = ? ORDER BY created_at DESC');
                return stmt.all(sessionId);
            } else {
                const stmt = this.db.prepare('SELECT * FROM generated_files ORDER BY created_at DESC');
                return stmt.all();
            }
        } else {
            // 分文件存储
            const files = this.readData(this.filesPath);
            let filteredFiles = files;
            if (sessionId) {
                filteredFiles = files.filter((f: GeneratedFile) => f.session_id === sessionId);
            }
            return filteredFiles.sort((a: GeneratedFile, b: GeneratedFile) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
        }
    }

    /**
     * 获取项目统计信息
     */
    async getProjectStats(): Promise<ProjectStats> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM project_stats WHERE id = 1');
            return stmt.get();
        } else {
            // 分文件存储
            return this.readData(this.statsPath);
        }
    }

    /**
     * 关闭数据库连接
     */
    close(): void {
        if (this.useSQLite && this.db) {
            this.db.close();
        }
    }
}
