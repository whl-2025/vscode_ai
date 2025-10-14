/**
 * 数据库管理器 - 向后兼容层
 * 将原有的JSON文件实现替换为新的SQLite混合方案
 */

// 重新导出新的数据库管理器
export { DatabaseManager } from './database/database-manager';

// 重新导出类型定义，保持向后兼容
export type {
    ChatSession,
    ChatMessage,
    GeneratedFile,
    ContextFile,
    ProjectInfo
} from './database/database-manager';

