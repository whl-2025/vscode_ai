# JSON存储方案实现说明

## 📋 概述

本VS Code扩展采用**分文件JSON存储方案**，为每个项目创建独立的数据目录，将不同类型的数据分别存储在不同的JSON文件中，提供更好的性能和维护性。

## 🏗️ 存储架构

### 整体结构
```
globalStorage/
├── main_database.json              # 主数据库（项目注册表）
└── projects/                       # 项目数据目录
    └── [project_name]/            # 项目名称目录（清理后的名称）
        ├── sessions.json          # 会话列表（空数组）
        ├── messages.json          # 消息列表（空数组）
        ├── generated_files.json   # 生成文件记录（空数组）
        ├── context_files.json     # 上下文文件（空数组）
        └── stats.json             # 项目统计
```

### 项目名称处理规则
- 使用项目名称作为目录名（清理后的名称+哈希值）
- 移除文件系统不允许的特殊字符
- 替换空格为下划线，添加8位MD5哈希值确保唯一性
- 限制总长度在100字符内，格式：`项目名称_哈希值`
- 确保目录名的唯一性和兼容性

## 📁 文件详细说明

### 1. 主数据库文件 (`main_database.json`)

**位置**: `globalStorage/main_database.json`

**作用**: 管理所有项目的注册信息和全局统计

**结构**:
```json
{
  "projects": [
    {
      "id": "项目名称_哈希值",
      "project_name": "项目名称",
      "project_path": "项目完整路径",
      "db_file_name": "projects/项目名称_哈希值/",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "last_used_at": "2024-01-01T00:00:00.000Z",
      "is_active": true,
      "metadata": "{}"
    }
  ],
  "global_stats": {
    "id": 1,
    "total_projects": 0,
    "total_sessions": 0,
    "total_messages": 0,
    "total_files": 0,
    "last_updated": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. 项目数据文件

#### 会话列表 (`sessions.json`)
**位置**: `globalStorage/projects/[project_name]/sessions.json`

**作用**: 存储项目的所有聊天会话（初始为空数组）

**结构**:
```json
[]
```

#### 消息列表 (`messages.json`)
**位置**: `globalStorage/projects/[project_name]/messages.json`

**作用**: 存储项目的所有聊天消息（初始为空数组）

**结构**:
```json
[]
```

#### 生成文件记录 (`generated_files.json`)
**位置**: `globalStorage/projects/[project_name]/generated_files.json`

**作用**: 记录AI生成的文件信息（初始为空数组）

**结构**:
```json
[]
```

#### 上下文文件 (`context_files.json`)
**位置**: `globalStorage/projects/[project_name]/context_files.json`

**作用**: 记录聊天时使用的上下文文件（初始为空数组）

**结构**:
```json
[]
```

#### 项目统计 (`stats.json`)
**位置**: `globalStorage/projects/[project_name]/stats.json`

**作用**: 存储项目的统计信息

**结构**:
```json
{
  "id": 1,
  "total_sessions": 5,
  "total_messages": 50,
  "total_files": 10,
  "language_stats": "{\"javascript\": 5, \"python\": 3}",
  "last_updated": "2024-01-01T00:00:00.000Z"
}
```

## 🔧 技术实现

### 核心类

#### 1. MainDatabase
- **文件**: `src/database/main-database.ts`
- **作用**: 管理主数据库和项目注册
- **存储**: `main_database.json`

#### 2. ProjectDatabase
- **文件**: `src/database/project-database.ts`
- **作用**: 管理单个项目的数据
- **存储**: `projects/[project_id]/` 目录下的分文件

#### 3. DatabaseManager
- **文件**: `src/database/database-manager.ts`
- **作用**: 统一管理主数据库和项目数据库
- **功能**: 项目切换、数据操作接口

### 关键方法

#### 数据读取
```typescript
private readData(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}
```

#### 数据写入
```typescript
private writeData(filePath: string, data: any): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
  }
}
```

## 🚀 使用方法

### VS Code命令

#### 1. 检查存储状态
- **命令**: `Ccdc: Check Storage Status`
- **功能**: 显示当前存储类型和SQLite可用性

#### 2. 详细存储状态
- **命令**: `Ccdc: Check Storage Status (Detailed)`
- **功能**: 显示详细的存储信息，包括文件数量等

#### 3. 查看数据库
- **命令**: `Ccdc: Show Main Database`
- **功能**: 查看主数据库内容

- **命令**: `Ccdc: Show Project Database`
- **功能**: 查看当前项目数据库内容

### 编程接口

#### 创建会话
```typescript
const session = await dbManager.createChatSession("新会话");
```

#### 添加消息
```typescript
const message = await dbManager.addMessage({
  session_id: session.id,
  role: 'user',
  content: 'Hello',
  timestamp: new Date().toISOString(),
  token_count: 5
});
```

#### 获取会话列表
```typescript
const sessions = await dbManager.getChatSessions();
```

## 📊 性能优势

### 1. 文件分离
- **优势**: 不同类型数据独立存储，减少单文件大小
- **效果**: 提高读写性能，减少内存占用

### 2. 按需加载
- **优势**: 只加载需要的数据类型
- **效果**: 减少启动时间，提高响应速度

### 3. 并发安全
- **优势**: 不同数据类型可以独立操作
- **效果**: 减少文件锁定冲突

## 🔒 数据安全

### 1. 自动备份
- 每次操作前自动检查文件完整性
- 错误时提供降级处理

### 2. 数据验证
- JSON格式验证
- 数据类型检查
- 必填字段验证

### 3. 错误恢复
- 文件损坏时自动重建
- 提供详细错误日志

## 🛠️ 维护指南

### 1. 数据清理
- 定期清理过期数据
- 压缩JSON文件格式
- 移除无效记录

### 2. 性能监控
- 监控文件大小增长
- 检查读写性能
- 分析存储使用情况

### 3. 故障排除
- 检查文件权限
- 验证JSON格式
- 查看控制台日志

## 📈 扩展性

### 1. 新数据类型
- 在项目目录中添加新的JSON文件
- 更新ProjectDatabase类添加相应方法
- 修改统计信息结构

### 2. 数据迁移
- 支持从旧格式迁移到新格式
- 提供数据转换工具
- 保持向后兼容性

### 3. 存储优化
- 支持数据压缩
- 实现增量更新
- 添加缓存机制

## 🔍 调试信息

### 控制台日志
- 数据库初始化状态
- 文件读写操作
- 错误和警告信息

### 存储路径
- Windows: `%APPDATA%\Code\User\globalStorage\[extension-id]\`
- macOS: `~/Library/Application Support/Code/User/globalStorage/[extension-id]/`
- Linux: `~/.config/Code/User/globalStorage/[extension-id]/`

## 📝 注意事项

1. **文件权限**: 确保扩展有读写权限
2. **路径长度**: Windows系统注意路径长度限制
3. **编码格式**: 所有文件使用UTF-8编码
4. **并发访问**: 避免同时修改同一文件
5. **备份策略**: 定期备份重要数据

## 🎯 总结

分文件JSON存储方案提供了：
- ✅ 更好的性能和维护性
- ✅ 清晰的数据结构
- ✅ 易于扩展和调试
- ✅ 跨平台兼容性
- ✅ 数据安全性保障

这种存储方案既保持了JSON的简单性，又通过文件分离提供了更好的可维护性和性能。