/**
 * 数据库查看工具
 * 用于查看和调试SQLite数据库内容
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DatabaseManager } from '../database/database-manager';

export class DatabaseViewer {
    private dbManager: DatabaseManager;

    constructor(context: vscode.ExtensionContext) {
        this.dbManager = new DatabaseManager(context);
    }

    /**
     * 显示主数据库信息
     */
    async showMainDatabaseInfo(): Promise<void> {
        try {
            const globalStats = await this.dbManager.getGlobalStats();
            const allProjects = await this.dbManager.getAllProjects();
            
            const info = `
📊 主数据库信息

全局统计：
• 总项目数: ${globalStats.total_projects}
• 总会话数: ${globalStats.total_sessions}
• 总消息数: ${globalStats.total_messages}
• 总文件数: ${globalStats.total_files}
• 最后更新: ${globalStats.last_updated}

项目列表：
${allProjects.map(p => `• ${p.project_name} (${p.project_path})`).join('\n')}
            `;
            
            vscode.window.showInformationMessage(info);
        } catch (error) {
            vscode.window.showErrorMessage(`查看主数据库信息失败: ${error}`);
        }
    }

    /**
     * 显示当前项目数据库信息
     */
    async showCurrentProjectInfo(): Promise<void> {
        try {
            const currentProject = this.dbManager.getCurrentProject();
            if (!currentProject) {
                vscode.window.showInformationMessage('当前没有活跃的项目');
                return;
            }

            const sessions = await this.dbManager.getChatSessions();
            const projectStats = await this.dbManager.getProjectStats();
            
            const info = `
📁 当前项目: ${currentProject.project_name}

项目信息：
• 路径: ${currentProject.project_path}
• 数据库文件: ${currentProject.db_file_name}
• 创建时间: ${currentProject.created_at}
• 最后使用: ${currentProject.last_used_at}

统计数据：
• 会话数: ${projectStats.total_sessions}
• 消息数: ${projectStats.total_messages}
• 文件数: ${projectStats.total_files}
• 语言统计: ${projectStats.language_stats}

最近会话：
${sessions.slice(0, 5).map(s => `• ${s.title} (${s.created_at})`).join('\n')}
            `;
            
            vscode.window.showInformationMessage(info);
        } catch (error) {
            vscode.window.showErrorMessage(`查看项目信息失败: ${error}`);
        }
    }

    /**
     * 显示会话详情
     */
    async showSessionDetails(sessionId?: string): Promise<void> {
        try {
            const sessions = await this.dbManager.getChatSessions();
            if (sessions.length === 0) {
                vscode.window.showInformationMessage('没有找到任何会话');
                return;
            }

            if (!sessionId) {
                // 显示会话列表
                const sessionList = sessions.map((s, index) => `${index + 1}. ${s.title}`).join('\n');
                vscode.window.showInformationMessage(`会话列表：\n${sessionList}`);
                return;
            }

            const messages = await this.dbManager.getMessages(sessionId);
            const session = sessions.find(s => s.id === sessionId);
            
            if (!session) {
                vscode.window.showErrorMessage('会话不存在');
                return;
            }

            const details = `
💬 会话详情: ${session.title}

基本信息：
• 创建时间: ${session.created_at}
• 更新时间: ${session.updated_at}
• 消息数量: ${messages.length}

消息列表：
${messages.map((m, index) => 
    `${index + 1}. [${m.role}] ${m.content.substring(0, 50)}...`
).join('\n')}
            `;
            
            vscode.window.showInformationMessage(details);
        } catch (error) {
            vscode.window.showErrorMessage(`查看会话详情失败: ${error}`);
        }
    }

    /**
     * 显示生成文件列表
     */
    async showGeneratedFiles(): Promise<void> {
        try {
            const files = await this.dbManager.getGeneratedFiles();
            
            if (files.length === 0) {
                vscode.window.showInformationMessage('没有找到任何生成的文件');
                return;
            }

            const fileList = files.map((f, index) => 
                `${index + 1}. ${f.file_name} (${f.language}) - ${f.created_at}`
            ).join('\n');
            
            vscode.window.showInformationMessage(`生成的文件：\n${fileList}`);
        } catch (error) {
            vscode.window.showErrorMessage(`查看生成文件失败: ${error}`);
        }
    }

    /**
     * 搜索消息内容
     */
    async searchMessages(): Promise<void> {
        try {
            const query = await vscode.window.showInputBox({
                prompt: '请输入搜索关键词',
                placeHolder: '搜索消息内容...'
            });

            if (!query) return;

            const results = await this.dbManager.searchMessages(query);
            
            if (results.length === 0) {
                vscode.window.showInformationMessage(`没有找到包含 "${query}" 的消息`);
                return;
            }

            const resultList = results.map((m, index) => 
                `${index + 1}. [${m.role}] ${m.content.substring(0, 100)}...`
            ).join('\n');
            
            vscode.window.showInformationMessage(`搜索结果 (${results.length}条)：\n${resultList}`);
        } catch (error) {
            vscode.window.showErrorMessage(`搜索消息失败: ${error}`);
        }
    }

    /**
     * 关闭数据库连接
     */
    async close(): Promise<void> {
        await this.dbManager.close();
    }
}
