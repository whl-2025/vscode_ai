/**
 * 上下文收集器 - 自动收集工作区上下文和历史上下文
 * 后台自动收集，无需用户操作
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DatabaseManager } from '../database/database-manager';

export interface WorkspaceContext {
    projectStructure: string;
    configFiles: Array<{ name: string; content: string }>;
    recentFiles: Array<{ name: string; path: string; modified: string }>;
}

export interface HistoryContext {
    currentSessionHistory: string;
    relatedSessions: Array<{ title: string; summary: string }>;
    generatedFiles: Array<{ name: string; path: string }>;
}

export interface ContextInfo {
    workspace?: WorkspaceContext;
    history?: HistoryContext;
}

export class ContextCollector {
    private static instance: ContextCollector;
    private workspaceContextCache: Map<string, { context: WorkspaceContext; timestamp: number }> = new Map();
    private historyContextCache: Map<string, { context: HistoryContext; timestamp: number }> = new Map();
    private cacheTimeout = 60000; // 缓存1分钟

    private constructor() {}

    public static getInstance(): ContextCollector {
        if (!ContextCollector.instance) {
            ContextCollector.instance = new ContextCollector();
        }
        return ContextCollector.instance;
    }

    /**
     * 收集完整上下文（工作区 + 历史）
     */
    public async collectFullContext(
        dbManager: DatabaseManager,
        sessionId?: string,
        config?: { workspaceEnabled?: boolean; historyEnabled?: boolean; maxHistoryMessages?: number }
    ): Promise<ContextInfo> {
        const workspaceEnabled = config?.workspaceEnabled !== false;
        const historyEnabled = config?.historyEnabled !== false;

        const [workspaceContext, historyContext] = await Promise.all([
            workspaceEnabled ? this.collectWorkspaceContext() : Promise.resolve(undefined),
            historyEnabled ? this.collectHistoryContext(dbManager, sessionId, config?.maxHistoryMessages || 10) : Promise.resolve(undefined)
        ]);

        return {
            workspace: workspaceContext,
            history: historyContext
        };
    }

    /**
     * 收集工作区上下文
     */
    public async collectWorkspaceContext(): Promise<WorkspaceContext | undefined> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const cacheKey = workspacePath;

        // 检查缓存
        const cached = this.workspaceContextCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.context;
        }

        try {
            const [projectStructure, configFiles, recentFiles] = await Promise.all([
                this.scanProjectStructure(workspacePath),
                this.collectConfigFiles(workspacePath),
                this.collectRecentFiles(workspacePath)
            ]);

            const context: WorkspaceContext = {
                projectStructure,
                configFiles,
                recentFiles
            };

            // 更新缓存
            this.workspaceContextCache.set(cacheKey, {
                context,
                timestamp: Date.now()
            });

            return context;
        } catch (error) {
            console.error('Error collecting workspace context:', error);
            return undefined;
        }
    }

    /**
     * 收集历史上下文
     */
    public async collectHistoryContext(
        dbManager: DatabaseManager,
        sessionId?: string,
        maxMessages: number = 10
    ): Promise<HistoryContext | undefined> {
        if (!sessionId) {
            return undefined;
        }

        const cacheKey = `${sessionId}_${maxMessages}`;

        // 检查缓存
        const cached = this.historyContextCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.context;
        }

        try {
            // 获取当前会话历史
            const currentMessages = await dbManager.getMessages(sessionId);
            const recentMessages = currentMessages.slice(-maxMessages);
            const currentSessionHistory = this.formatHistoryMessages(recentMessages);

            // 获取相关会话（简化版：同一项目的其他会话）
            const allSessions = await dbManager.getChatSessions();
            const relatedSessions = allSessions
                .filter(s => s.id !== sessionId)
                .slice(0, 2) // 最多2个相关会话
                .map(async (s) => {
                    const messages = await dbManager.getMessages(s.id);
                    const firstMessage = messages[0]?.content || '';
                    return {
                        title: s.title,
                        summary: firstMessage.substring(0, 100) + (firstMessage.length > 100 ? '...' : '')
                    };
                });

            const relatedSessionsData = await Promise.all(relatedSessions);

            // 获取生成文件历史
            const generatedFiles = await dbManager.getGeneratedFiles(sessionId);
            const filesList = generatedFiles.slice(-5).map(f => ({
                name: f.file_name,
                path: f.file_path
            }));

            const context: HistoryContext = {
                currentSessionHistory,
                relatedSessions: relatedSessionsData,
                generatedFiles: filesList
            };

            // 更新缓存
            this.historyContextCache.set(cacheKey, {
                context,
                timestamp: Date.now()
            });

            return context;
        } catch (error) {
            console.error('Error collecting history context:', error);
            return undefined;
        }
    }

    /**
     * 扫描项目结构
     */
    private async scanProjectStructure(workspacePath: string, maxDepth: number = 3): Promise<string> {
        const structure: string[] = [];
        const ignoredDirs = ['node_modules', '.git', '.vscode', 'out', 'dist', '.next', '.nuxt'];

        const scanDir = async (dir: string, prefix: string, depth: number): Promise<void> => {
            if (depth > maxDepth) return;

            try {
                const dirUri = vscode.Uri.file(dir);
                const entries = await vscode.workspace.fs.readDirectory(dirUri);
                const dirs: string[] = [];
                const files: string[] = [];

                for (const [name, type] of entries) {
                    if (ignoredDirs.includes(name)) continue;

                    if (type === vscode.FileType.Directory) {
                        dirs.push(name);
                    } else if (type === vscode.FileType.File) {
                        files.push(name);
                    }
                }

                // 排序：目录在前，文件名排序
                dirs.sort();
                files.sort();

                // 处理目录
                for (let i = 0; i < dirs.length; i++) {
                    const isLast = i === dirs.length - 1 && files.length === 0;
                    const currentPrefix = isLast ? '└── ' : '├── ';
                    const nextPrefix = isLast ? '    ' : '│   ';

                    structure.push(prefix + currentPrefix + dirs[i] + '/');
                    await scanDir(path.join(dir, dirs[i]), prefix + nextPrefix, depth + 1);
                }

                // 处理文件（最多显示10个）
                const filesToShow = files.slice(0, 10);
                for (let i = 0; i < filesToShow.length; i++) {
                    const isLast = i === filesToShow.length - 1;
                    const currentPrefix = isLast ? '└── ' : '├── ';
                    structure.push(prefix + currentPrefix + filesToShow[i]);
                }

                if (files.length > 10) {
                    structure.push(prefix + '└── ... (' + (files.length - 10) + ' more files)');
                }
            } catch (error) {
                // 忽略权限错误等
            }
        };

        const rootName = path.basename(workspacePath);
        structure.push(rootName + '/');
        await scanDir(workspacePath, '', 1);

        return structure.join('\n');
    }

    /**
     * 收集配置文件
     */
    private async collectConfigFiles(workspacePath: string): Promise<Array<{ name: string; content: string }>> {
        const configFileNames = [
            'package.json',
            'package-lock.json',
            'tsconfig.json',
            'jsconfig.json',
            'tsconfig.base.json',
            '.gitignore',
            'README.md',
            'README.txt'
        ];

        const configFiles: Array<{ name: string; content: string }> = [];

        for (const fileName of configFileNames) {
            const filePath = path.join(workspacePath, fileName);
            try {
                const fileUri = vscode.Uri.file(filePath);
                try {
                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                    const content = Buffer.from(fileData).toString('utf8');
                    // 限制文件大小（前2000字符）
                    const truncatedContent = content.length > 2000 
                        ? content.substring(0, 2000) + '\n... (truncated)'
                        : content;
                    configFiles.push({ name: fileName, content: truncatedContent });
                } catch {
                    // 文件不存在或读取失败，忽略
                }
            } catch (error) {
                // 忽略读取错误
            }
        }

        return configFiles;
    }

    /**
     * 收集最近修改的文件
     */
    private async collectRecentFiles(workspacePath: string, maxFiles: number = 5): Promise<Array<{ name: string; path: string; modified: string }>> {
        const recentFiles: Array<{ name: string; path: string; modified: string }> = [];
        const codeExtensions = ['.ts', '.js', '.tsx', '.jsx', '.vue', '.py', '.java', '.cpp', '.c', '.go', '.rs'];

        try {
            const files: Array<{ path: string; mtime: number }> = [];

            const scanForFiles = async (dir: string): Promise<void> => {
                const ignoredDirs = ['node_modules', '.git', '.vscode', 'out', 'dist', '.next', '.nuxt'];
                try {
                    const dirUri = vscode.Uri.file(dir);
                    const entries = await vscode.workspace.fs.readDirectory(dirUri);
                    for (const [name, type] of entries) {
                        const fullPath = path.join(dir, name);
                        if (ignoredDirs.includes(name)) continue;

                        if (type === vscode.FileType.Directory) {
                            await scanForFiles(fullPath);
                        } else if (type === vscode.FileType.File) {
                            const ext = path.extname(name).toLowerCase();
                            if (codeExtensions.includes(ext)) {
                                try {
                                    const fileUri = vscode.Uri.file(fullPath);
                                    const stat = await vscode.workspace.fs.stat(fileUri);
                                    // VSCode FileStat 包含 mtime（如果可用），否则使用 ctime
                                    const mtime = (stat as any).mtime || stat.ctime || Date.now();
                                    files.push({ path: fullPath, mtime: typeof mtime === 'number' ? mtime : Date.now() });
                                } catch {
                                    // 忽略权限错误
                                }
                            }
                        }
                    }
                } catch {
                    // 忽略扫描错误
                }
            };

            await scanForFiles(workspacePath);

            // 按修改时间排序，取最近的文件
            files.sort((a, b) => b.mtime - a.mtime);
            const recent = files.slice(0, maxFiles);

            for (const file of recent) {
                const relativePath = path.relative(workspacePath, file.path);
                recentFiles.push({
                    name: path.basename(file.path),
                    path: relativePath,
                    modified: new Date(file.mtime).toLocaleString('zh-CN', { hour12: false })
                });
            }
        } catch (error) {
            // 忽略错误
        }

        return recentFiles;
    }

    /**
     * 格式化历史消息（精简版）
     */
    private formatHistoryMessages(messages: Array<{ role: string; content: string; timestamp?: string }>): string {
        if (messages.length === 0) {
            return '';
        }

        // 只保留最近3轮对话，每轮只保留摘要
        const recentMessages = messages.slice(-6); // 最多3轮（每轮user+assistant）
        const formatted: string[] = [];

        for (const msg of recentMessages) {
            const role = msg.role === 'user' ? 'Q' : msg.role === 'assistant' ? 'A' : 'S';
            // 进一步精简：只保留前100字符
            const content = msg.content.length > 100 
                ? msg.content.substring(0, 100) + '...'
                : msg.content;
            formatted.push(`${role}:${content}`);
        }

        return formatted.join('\n');
    }

    /**
     * 格式化工作区上下文为系统提示词（精简版）
     */
    public formatWorkspaceContextForPrompt(context: WorkspaceContext): string {
        const parts: string[] = [];
        
        // 项目结构（简化）
        if (context.projectStructure) {
            parts.push(`项目结构:\n${context.projectStructure}`);
        }

        // 关键配置（只保留最重要的）
        if (context.configFiles.length > 0) {
            const importantConfigs = context.configFiles.filter(f => 
                ['package.json', 'tsconfig.json', 'jsconfig.json'].includes(f.name)
            );
            if (importantConfigs.length > 0) {
                parts.push('\n配置:');
                for (const configFile of importantConfigs.slice(0, 2)) { // 最多2个配置文件
                    parts.push(`${configFile.name}: ${configFile.content.substring(0, 500)}${configFile.content.length > 500 ? '...' : ''}`);
                }
            }
        }

        return parts.join('\n');
    }

    /**
     * 格式化历史上下文为用户消息补充（精简版）
     */
    public formatHistoryContextForPrompt(context: HistoryContext): string {
        if (!context.currentSessionHistory) {
            return '';
        }

        // 只保留最近3轮对话的摘要，去掉标签
        const lines = context.currentSessionHistory.split('\n');
        const recentLines = lines.slice(-6).join('\n'); // 保留最后6行（约3轮对话）
        
        return '\n\n历史上下文:' + recentLines;
    }

    /**
     * 清除缓存
     */
    public clearCache(workspacePath?: string): void {
        if (workspacePath) {
            this.workspaceContextCache.delete(workspacePath);
        } else {
            this.workspaceContextCache.clear();
        }
        this.historyContextCache.clear();
    }
}
