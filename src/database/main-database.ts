/**
 * 主数据库管理器 - 管理项目注册表和全局统计
 * 负责管理所有项目的基本信息和全局统计
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { ProjectInfo, GlobalStats } from './types';

// SQLite相关代码已注释，使用JSON存储方案
// let sqlite3: any = null;
// let sqliteAvailable = false;

// 在VS Code扩展环境中，原生SQLite模块不可用
// 使用JSON存储作为主要方案，保持SQLite API接口以便将来迁移
console.log('MainDatabase: Using JSON storage (VS Code extension environment)');
const sqliteAvailable = false;

export class MainDatabase {
    private db: any;
    private dbPath: string;
    private jsonPath: string;
    private useSQLite: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        const storageUri = context.globalStorageUri;
        this.dbPath = path.join(storageUri.fsPath, 'main_database.sqlite');
        this.jsonPath = path.join(storageUri.fsPath, 'main_database.json');
        
        // 在VS Code扩展环境中，直接使用JSON存储
        console.log('MainDatabase: Using JSON storage (VS Code extension environment)');
        this.useSQLite = false;
        this.initializeJSON();
    }

    /**
     * 创建主数据库表结构（SQLite版本 - 已注释）
     * 包含项目注册表和全局统计表
     */
    // private createTables(): void {
    //     if (!this.useSQLite) return;
    //     
    //     const createTablesSQL = `
    //         -- 项目信息表：存储所有项目的基本信息
    //         CREATE TABLE IF NOT EXISTS projects (
    //             id INTEGER PRIMARY KEY AUTOINCREMENT,                    -- 项目ID，主键，自增
    //             project_name TEXT NOT NULL,                             -- 项目名称，从项目路径中提取
    //             project_path TEXT UNIQUE NOT NULL,                      -- 项目完整路径，唯一标识
    //             db_file_name TEXT UNIQUE NOT NULL,                      -- 项目数据库文件名，用于存储该项目的聊天数据
    //             created_at TEXT NOT NULL,                               -- 项目创建时间
    //             updated_at TEXT NOT NULL,                               -- 项目信息最后更新时间
    //             last_used_at TEXT,                                      -- 项目最后使用时间，用于排序
    //             is_active BOOLEAN DEFAULT 0,                            -- 是否为当前活跃项目（0或1）
    //             metadata TEXT                                           -- 项目元数据，JSON格式存储额外信息
    //         );
    //
    //         -- 全局统计信息表：存储所有项目的汇总统计
    //         CREATE TABLE IF NOT EXISTS global_stats (
    //             id INTEGER PRIMARY KEY,                                 -- 统计记录ID
    //             total_projects INTEGER DEFAULT 0,                       -- 总项目数量
    //             total_sessions INTEGER DEFAULT 0,                       -- 总会话数量（所有项目）
    //             total_messages INTEGER DEFAULT 0,                       -- 总消息数量（所有项目）
    //             total_files INTEGER DEFAULT 0,                          -- 总生成文件数量（所有项目）
    //             last_updated TEXT NOT NULL                              -- 统计信息最后更新时间
    //         );
    //
    //         -- 创建索引以提高查询性能
    //         CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(project_path);
    //         CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
    //         CREATE INDEX IF NOT EXISTS idx_projects_last_used ON projects(last_used_at);
    //
    //         -- 插入默认的全局统计记录
    //         INSERT OR IGNORE INTO global_stats (id, total_projects, total_sessions, total_messages, total_files, last_updated) 
    //         VALUES (1, 0, 0, 0, 0, datetime('now')            );
    //     `;
    //     
    //     this.db.transaction((tx: any) => {
    //         tx.executeSql(createTablesSQL, [], () => {
    //             console.log('MainDatabase: Tables created successfully');
    //         }, (err: any) => {
    //             console.error('Error creating tables:', err);
    //         });
    //     });
    // }

    /**
     * 初始化分文件存储方案
     */
    private initializeJSON(): void {
        try {
            if (!fs.existsSync(this.jsonPath)) {
                const initialData = {
                    // 项目注册表：存储所有项目的基本信息
                    projects: [
                        // 每个项目包含以下字段：
                        // {
                        //     id: number,                    // 项目唯一标识符，自增ID
                        //     project_name: string,          // 项目名称，从项目路径中提取
                        //     project_path: string,          // 项目完整路径，唯一标识
                        //     db_file_name: string,          // 项目数据库文件名，用于存储该项目的聊天数据
                        //     created_at: string,            // 项目创建时间，ISO格式
                        //     updated_at: string,            // 项目信息最后更新时间，ISO格式
                        //     last_used_at: string,          // 项目最后使用时间，用于排序，ISO格式
                        //     is_active: boolean,            // 是否为当前活跃项目
                        //     metadata: string               // 项目元数据，JSON格式存储额外信息
                        // }
                    ],
                    // 全局统计信息：存储所有项目的汇总统计
                    global_stats: {
                        id: 1,                              // 统计记录唯一标识符
                        total_projects: 0,                  // 总项目数量
                        total_sessions: 0,                  // 总会话数量（所有项目）
                        total_messages: 0,                  // 总消息数量（所有项目）
                        total_files: 0,                     // 总生成文件数量（所有项目）
                        last_updated: new Date().toISOString()  // 统计信息最后更新时间，ISO格式
                    }
                };
                fs.writeFileSync(this.jsonPath, JSON.stringify(initialData, null, 2));
                console.log('MainDatabase: 分文件存储主数据库初始化成功');
            }
        } catch (err) {
            console.error('Failed to initialize JSON storage:', err);
        }
    }

    /**
     * 注册新项目
     */
    async registerProject(projectPath: string): Promise<ProjectInfo> {
        const projectName = path.basename(projectPath);
        const cleanProjectName = this.sanitizeProjectName(projectName);
        const dbFileName = `projects/${cleanProjectName}/`;  // 指向项目目录
        const now = new Date().toISOString();

        if (this.useSQLite) {
            const stmt = this.db.prepare(`
                INSERT INTO projects (project_name, project_path, db_file_name, created_at, updated_at, last_used_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `);
            
            const result = stmt.run(projectName, projectPath, dbFileName, now, now, now);
            return {
                id: result.lastInsertRowid,
                project_name: projectName,
                project_path: projectPath,
                db_file_name: dbFileName,
                created_at: now,
                updated_at: now,
                last_used_at: now,
                is_active: true
            };
        } else {
            // JSON fallback
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            const newProject: ProjectInfo = {
                id: cleanProjectName as any,  // 使用清理后的项目名称作为ID
                project_name: projectName,
                project_path: projectPath,
                db_file_name: dbFileName,
                created_at: now,
                updated_at: now,
                last_used_at: now,
                is_active: true
            };
            data.projects.push(newProject);
            fs.writeFileSync(this.jsonPath, JSON.stringify(data, null, 2));
            return newProject;
        }
    }

    /**
     * 获取当前活跃项目
     */
    async getCurrentActiveProject(): Promise<ProjectInfo | null> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM projects WHERE is_active = 1 LIMIT 1');
            return stmt.get() || null;
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            return data.projects.find((p: ProjectInfo) => p.is_active) || null;
        }
    }

    /**
     * 根据路径获取项目信息
     */
    async getProjectByPath(projectPath: string): Promise<ProjectInfo | null> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM projects WHERE project_path = ?');
            return stmt.get(projectPath) || null;
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            return data.projects.find((p: ProjectInfo) => p.project_path === projectPath) || null;
        }
    }

    /**
     * 获取所有项目
     */
    async getAllProjects(): Promise<ProjectInfo[]> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM projects ORDER BY last_used_at DESC');
            return stmt.all();
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            return data.projects.sort((a: ProjectInfo, b: ProjectInfo) => 
                new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
            );
        }
    }

    /**
     * 切换到指定项目
     */
    async switchToProject(projectPath: string): Promise<ProjectInfo | null> {
        let project = await this.getProjectByPath(projectPath);
        
        if (!project) {
            project = await this.registerProject(projectPath);
        }

        // 设置所有项目为非活跃状态
        await this.setAllProjectsInactive();
        
        // 设置当前项目为活跃状态
        await this.setProjectActive(project.id);
        
        // 更新最后使用时间
        await this.updateProjectLastUsed(project.id);

        return project;
    }

    /**
     * 生成数据库文件名
     */
    private generateDbFileName(projectName: string): string {
        const hash = crypto.createHash('md5').update(projectName).digest('hex').substring(0, 8);
        return `${projectName}_${hash}.sqlite`;
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
     * 设置所有项目为非活跃状态
     */
    private async setAllProjectsInactive(): Promise<void> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('UPDATE projects SET is_active = 0');
            stmt.run();
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            data.projects.forEach((p: ProjectInfo) => p.is_active = false);
            fs.writeFileSync(this.jsonPath, JSON.stringify(data, null, 2));
        }
    }

    /**
     * 设置指定项目为活跃状态
     */
    private async setProjectActive(projectId: number): Promise<void> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('UPDATE projects SET is_active = 1 WHERE id = ?');
            stmt.run(projectId);
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            const project = data.projects.find((p: ProjectInfo) => p.id === projectId);
            if (project) project.is_active = true;
            fs.writeFileSync(this.jsonPath, JSON.stringify(data, null, 2));
        }
    }

    /**
     * 更新项目最后使用时间
     */
    private async updateProjectLastUsed(projectId: number): Promise<void> {
        const now = new Date().toISOString();
        if (this.useSQLite) {
            const stmt = this.db.prepare('UPDATE projects SET last_used_at = ? WHERE id = ?');
            stmt.run(now, projectId);
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            const project = data.projects.find((p: ProjectInfo) => p.id === projectId);
            if (project) project.last_used_at = now;
            fs.writeFileSync(this.jsonPath, JSON.stringify(data, null, 2));
        }
    }

    /**
     * 获取全局统计信息
     */
    async getGlobalStats(): Promise<GlobalStats> {
        if (this.useSQLite) {
            const stmt = this.db.prepare('SELECT * FROM global_stats WHERE id = 1');
            return stmt.get();
        } else {
            const data = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
            return data.global_stats;
        }
    }

    /**
     * 获取存储类型
     */
    getStorageType(): 'sqlite' | 'json' {
        return this.useSQLite ? 'sqlite' : 'json';
    }

    /**
     * 检查SQLite是否可用
     */
    isSQLiteAvailable(): boolean {
        return sqliteAvailable;
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
