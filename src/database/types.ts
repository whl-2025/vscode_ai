/**
 * 数据库类型定义
 * 定义所有数据库相关的接口和类型
 */

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

export interface ProjectInfo {
    id: number;
    project_name: string;
    project_path: string;
    db_file_name: string;
    created_at: string;
    updated_at: string;
    last_used_at: string;
    is_active: boolean;
    metadata?: any;
}

export interface GlobalStats {
    id: number;
    total_projects: number;
    total_sessions: number;
    total_messages: number;
    total_files: number;
    last_updated: string;
}

export interface ProjectStats {
    id: number;
    total_sessions: number;
    total_messages: number;
    total_files: number;
    language_stats: string; // JSON string
    last_updated: string;
}

export interface CrossProjectSearchResult {
    project_name: string;
    project_path: string;
    session_id: string;
    message_id: number;
    content: string;
    timestamp: string;
    match_count: number;
}

export interface ExportData {
    sessions: ChatSession[];
    messages: ChatMessage[];
    generated_files: GeneratedFile[];
    context_files: ContextFile[];
}

export interface ImportData {
    sessions: ChatSession[];
    messages: ChatMessage[];
    generated_files: GeneratedFile[];
    context_files: ContextFile[];
}
