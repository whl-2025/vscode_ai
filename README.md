# GPT.CCDC - VS Code AI Assistant

一个集成在VS Code中的AI编程助手插件，支持代码生成、智能对话和代码重构。

## 功能特性

- 🤖 **AI代码生成**: 根据描述自动生成代码
- 💬 **智能对话**: 与AI助手进行编程相关对话
- ⚙️ **灵活配置**: 支持自定义AI服务URL、模型参数等
- 💾 **代码保存**: 一键保存AI生成的代码到文件
- 🎨 **现代界面**: 简洁美观的深色主题界面

## 安装方法

### 离线安装
1. 下载 `gpt-ccdc-0.0.1.vsix` 文件
2. 在VS Code中按 `Ctrl+Shift+P` 打开命令面板
3. 输入 "Extensions: Install from VSIX..."
4. 选择下载的 `.vsix` 文件进行安装

### 在线安装
```bash
code --install-extension ccdc-lab.gpt-ccdc
```

## 使用方法

### 1. 代码生成
- 选中代码或光标定位到插入位置
- 按 `Ctrl+Shift+P` 打开命令面板
- 输入 "Ccdc: Generate Code"
- 描述您想要生成的代码功能

### 2. AI对话
- 点击左侧活动栏的CCDC图标
- 在聊天界面中输入问题或需求
- 使用 `Enter` 发送消息，`Shift+Enter` 换行

### 3. 配置设置
- 在聊天界面点击右侧的⚙️配置按钮
- 或使用命令 "Ccdc: Open Configuration"
- 配置AI服务URL、模型参数等

## 配置选项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `baseUrl` | AI服务基础URL | `https://gpt.ccdc.com.cn` |
| `model` | 使用的模型名称 | `gpt-3.5-turbo` |
| `temperature` | 生成温度 (0-1) | `0.2` |
| `maxTokens` | 最大生成token数 | `512` |
| `systemPrompt` | 系统提示词 | 编程助手提示词 |
| `stream` | 是否启用流式输出 | `false` |
| `timeoutMs` | 请求超时时间(ms) | `60000` |
| `logLevel` | 日志级别 | `info` |

## 快捷键

- `Enter`: 发送消息
- `Shift+Enter`: 换行
- `Ctrl+Shift+P`: 打开命令面板

## 系统要求

- VS Code 1.90.0 或更高版本
- 支持的网络连接（用于AI服务调用）

## 许可证

本插件仅供学习和研究使用。

## 更新日志

### v0.0.1
- 初始版本发布
- 支持AI代码生成和对话
- 提供配置界面
- 支持代码保存功能
