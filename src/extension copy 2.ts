import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as path from 'path';

type OpenAIResponse = {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: Array<{
        index?: number;
        message?: {
            role: string;
            content: string;
        };
        finish_reason?: string;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
};

type OpenAIChatResponse = {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: Array<{
        index?: number;
        delta?: {
            role?: string;
            content?: string;
        };
        finish_reason?: string;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
};

type LogLevel = 'none' | 'info' | 'debug';
const outputChannel = vscode.window.createOutputChannel('AI Autocomplete');
function log(level: LogLevel, message: string, details?: unknown) {
    const cfg = getConfiguration();
    const configured = cfg.logLevel;
    const order: Record<LogLevel, number> = { none: 0, info: 1, debug: 2 };
    if (order[level] <= order[configured]) {
        const time = new Date().toISOString();
        try {
            const detailsText = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
            outputChannel.appendLine(`[${time}] [${level.toUpperCase()}] ${message}${detailsText}`);
        } catch {
            outputChannel.appendLine(`[${time}] [${level.toUpperCase()}] ${message}`);
        }
    }
}

function getConfiguration() {
    const config = vscode.workspace.getConfiguration('ccdcCodeGen');
    return {
        baseUrl: config.get<string>('baseUrl', 'https://gpt.ccdc.com.cn'),
        apiKey: config.get<string>('apiKey', ''),
        model: config.get<string>('model', 'gpt-3.5-turbo'),
        temperature: config.get<number>('temperature', 0.1),
        maxTokens: config.get<number>('maxTokens', 2048),
        systemPrompt: config.get<string>('systemPrompt', '你是一个专业的代码分析助手。请用中文详细分析用户提供的文件内容。当看到文件内容时，请直接分析其结构、功能和作用，不要重复文件内容本身。对于Vue文件，分析组件结构和功能；对于JSON文件，分析配置项的作用。'),
        stream: config.get<boolean>('stream', false),
        timeoutMs: config.get<number>('timeoutMs', 120000),
        logLevel: (config.get<string>('logLevel', 'info') as LogLevel) || 'info',
    };
}

let warnedMissingApiKey = false;
function maybeWarnMissingApiKey() {
    if (!warnedMissingApiKey) {
        warnedMissingApiKey = true;
        vscode.window.showWarningMessage('API key is empty. Set "CCDC AI Configuration › Api Key" in Settings if your server requires Authorization.');
    }
}

async function callOpenAI(prompt: string, signal: AbortSignal): Promise<string> {
    const cfg = getConfiguration();
    const url = new URL('/v1/chat/completions', cfg.baseUrl);

    const messages = [
        { role: 'system', content: cfg.systemPrompt },
        { role: 'user', content: prompt }
    ];

    const payload = JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream: cfg.stream,
    });

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise<string>((resolve, reject) => {
        const started = Date.now();
        log('info', 'POST /v1/chat/completions', { url: url.toString(), model: cfg.model, stream: cfg.stream });
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload).toString(),
        };
        if (cfg.apiKey && cfg.apiKey.trim()) {
            headers['Authorization'] = `Bearer ${cfg.apiKey.trim()}`;
        } else {
            maybeWarnMissingApiKey();
        }
        const req = client.request(
            {
                method: 'POST',
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                headers,
                timeout: cfg.timeoutMs,
                signal,
            },
            (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    const err = new Error(`OpenAI HTTP ${res.statusCode}`);
                    log('info', 'OpenAI error response', { status: res.statusCode });
                    reject(err);
                    return;
                }

                const chunks: Buffer[] = [];
                res.on('data', (d: Buffer) => chunks.push(d));
                res.on('end', () => {
                    try {
                        const raw = Buffer.concat(chunks).toString('utf8');
                        if (cfg.stream) {
                            // streaming mode returns NDJSON, combine responses
                            const lines = raw
                                .split(/\r?\n/) 
                                .filter(Boolean);
                            const texts: string[] = [];
                            for (const line of lines) {
                                try {
                                    if (line.startsWith('data: ')) {
                                        const data = line.substring(6);
                                        if (data === '[DONE]') {
                                            continue;
                                        }
                                        const obj = JSON.parse(data) as OpenAIChatResponse;
                                        if (obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content) {
                                            texts.push(obj.choices[0].delta.content);
                                        }
                                    }
                                } catch {
                                    // ignore bad lines
                                }
                            }
                            const final = texts.join('');
                            log('debug', 'OpenAI streamed response (combined)', { ms: Date.now() - started, bytes: raw.length, length: final.length });
                            resolve(final);
                            return;
                        }
                        const obj = JSON.parse(raw) as OpenAIResponse;
                        const text = obj.choices && obj.choices[0] && obj.choices[0].message ? obj.choices[0].message.content : '';
                        log('debug', 'OpenAI response', { ms: Date.now() - started, bytes: raw.length, length: text.length });
                        resolve(text || '');
                    } catch (e) {
                        log('info', 'Failed to parse OpenAI response', { error: String((e as any)?.message || e) });
                        reject(e);
                    }
                });
            }
        );

        req.on('error', (err) => { log('info', 'HTTP request error', { error: String(err) }); reject(err); });
        req.write(payload);
        req.end();
    });
}

async function promptForInstruction(selectionText?: string): Promise<string | undefined> {
    const base = selectionText && selectionText.trim().length > 0
        ? `Given this context, continue or refactor the code.\n\n${selectionText}\n\n` 
        : '';
    const prompt = await vscode.window.showInputBox({
        prompt: 'Describe what you want to generate',
        placeHolder: 'e.g., Write a TypeScript function to parse query params',
        value: base,
        ignoreFocusOut: true,
    });
    return prompt ?? undefined;
}

async function generateAndInsert(editor: vscode.TextEditor) {
    const doc = editor.document;
    const selection = editor.selection;
    const selectedText = doc.getText(selection);
    const instruction = await promptForInstruction(selectedText);
    if (!instruction) {
        return;
    }

    const controller = new AbortController();
    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.token.onCancellationRequested(() => controller.abort());

    const progressTitle = 'Generating code...';
    try {
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: progressTitle,
                cancellable: true,
            },
            async (_progress, cancelToken) => {
                cancelToken.onCancellationRequested(() => controller.abort());
                const text = await callOpenAI(instruction, controller.signal);
                return text;
            }
        );

        await editor.edit((editBuilder) => {
            if (selection && !selection.isEmpty) {
                editBuilder.replace(selection, result);
            } else {
                editBuilder.insert(selection.active, result);
            }
        });
    } catch (err: any) {
        vscode.window.showErrorMessage(`AI request failed: ${err?.message ?? String(err)}`);
    } finally {
        tokenSource.dispose();
    }
}

export function activate(context: vscode.ExtensionContext) {
    const genDisposable = vscode.commands.registerTextEditorCommand('ccdc.generateCode', async (editor) => {
        await generateAndInsert(editor);
    });
    context.subscriptions.push(genDisposable);

    const chatDisposable = vscode.commands.registerCommand('ccdc.openChat', async () => {
        ChatPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(chatDisposable);

    const configDisposable = vscode.commands.registerCommand('ccdc.openConfig', async () => {
        await openConfigurationPanel(context.extensionUri);
    });
    context.subscriptions.push(configDisposable);

    const chatViewProvider = new ChatViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('ccdc.chatView', chatViewProvider, { 
        webviewOptions: { retainContextWhenHidden: true } 
    }));

    // 注册 saveCodeToFile 命令
    const saveCodeToFileCommand = vscode.commands.registerCommand('ccdc.saveCodeToFile', async (code: string, language: string) => {
        await saveCodeToFile(code, language);
    });
    context.subscriptions.push(saveCodeToFileCommand);
}

export function deactivate() {}

// ===== Configuration Panel =====
class ConfigurationPanel {
    public static currentPanel: ConfigurationPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static async createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (ConfigurationPanel.currentPanel) {
            ConfigurationPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'ccdcConfig',
            'CCDC Configuration',
            column ?? vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        ConfigurationPanel.currentPanel = new ConfigurationPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        this._panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'saveConfig') {
                try {
                    const config = vscode.workspace.getConfiguration('ccdcCodeGen');
                    await config.update('apiKey', msg.config.apiKey, vscode.ConfigurationTarget.Global);
                    await config.update('baseUrl', msg.config.baseUrl, vscode.ConfigurationTarget.Global);
                    await config.update('model', msg.config.model, vscode.ConfigurationTarget.Global);
                    await config.update('temperature', msg.config.temperature, vscode.ConfigurationTarget.Global);
                    await config.update('maxTokens', msg.config.maxTokens, vscode.ConfigurationTarget.Global);
                    await config.update('systemPrompt', msg.config.systemPrompt, vscode.ConfigurationTarget.Global);
                    await config.update('stream', msg.config.stream, vscode.ConfigurationTarget.Global);
                    await config.update('timeoutMs', msg.config.timeoutMs, vscode.ConfigurationTarget.Global);
                    await config.update('logLevel', msg.config.logLevel, vscode.ConfigurationTarget.Global);
                    
                    vscode.window.showInformationMessage('Configuration saved successfully!');
                    this._panel.webview.postMessage({ type: 'configSaved' });
                    log('info', 'Configuration saved', msg.config);
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Failed to save configuration: ${err?.message ?? String(err)}`);
                    this._panel.webview.postMessage({ type: 'configError', error: String(err?.message ?? err) });
                }
            }
        }, undefined, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        ConfigurationPanel.currentPanel = undefined;
        while (this._disposables.length) {
            const x = this._disposables.pop();
            try { x?.dispose(); } catch {}
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const cfg = getConfiguration();
        const style = `
            :root { --bg:#1e1e1e; --fg:#e5e5e5; --muted:#999; --b:#2a2a2a; --accent:#4e94ce; }
            body { margin:0; padding:20px; font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); }
            .container { max-width:600px; margin:0 auto; }
            .form-group { margin-bottom:20px; }
            label { display:block; margin-bottom:8px; font-weight:bold; }
            input, textarea, select { width:100%; padding:8px; border-radius:4px; border:1px solid #333; background:#111; color:var(--fg); box-sizing:border-box; }
            textarea { min-height:80px; resize:vertical; }
            button { background: var(--accent); color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; margin-right:10px; }
            button:hover { opacity:0.9; }
            .buttons { margin-top:30px; }
            .error { color:#ff6b6b; margin-top:10px; }
            .success { color:#51cf66; margin-top:10px; }
        `;

        const script = `
            const vscode = acquireVsCodeApi();
            
            // 加载当前配置
            const config = ${JSON.stringify(cfg)};
            
            // 填充表单
            document.getElementById('baseUrl').value = config.baseUrl;
            document.getElementById('apiKey').value = config.apiKey || '';
            document.getElementById('model').value = config.model;
            document.getElementById('temperature').value = config.temperature;
            document.getElementById('maxTokens').value = config.maxTokens;
            document.getElementById('systemPrompt').value = config.systemPrompt;
            document.getElementById('stream').checked = config.stream;
            document.getElementById('timeoutMs').value = config.timeoutMs;
            document.getElementById('logLevel').value = config.logLevel;
            
            document.getElementById('save').addEventListener('click', () => {
                const formData = {
                    baseUrl: document.getElementById('baseUrl').value,
                    apiKey: document.getElementById('apiKey').value,
                    model: document.getElementById('model').value,
                    temperature: parseFloat(document.getElementById('temperature').value),
                    maxTokens: parseInt(document.getElementById('maxTokens').value),
                    systemPrompt: document.getElementById('systemPrompt').value,
                    stream: document.getElementById('stream').checked,
                    timeoutMs: parseInt(document.getElementById('timeoutMs').value),
                    logLevel: document.getElementById('logLevel').value
                };
                
                vscode.postMessage({ type: 'saveConfig', config: formData });
            });
            
            document.getElementById('reset').addEventListener('click', () => {
                document.getElementById('baseUrl').value = config.baseUrl;
                document.getElementById('apiKey').value = config.apiKey || '';
                document.getElementById('model').value = config.model;
                document.getElementById('temperature').value = config.temperature;
                document.getElementById('maxTokens').value = config.maxTokens;
                document.getElementById('systemPrompt').value = config.systemPrompt;
                document.getElementById('stream').checked = config.stream;
                document.getElementById('timeoutMs').value = config.timeoutMs;
                document.getElementById('logLevel').value = config.logLevel;
            });
            
            window.addEventListener('message', (event) => {
                const msg = event.data || {};
                if (msg.type === 'configSaved') {
                    showMessage('Configuration saved successfully!', 'success');
                }
                if (msg.type === 'configError') {
                    showMessage('Error: ' + msg.error, 'error');
                }
            });
            
            function showMessage(text, type) {
                const msgEl = document.getElementById('message');
                msgEl.textContent = text;
                msgEl.className = type;
                setTimeout(() => msgEl.textContent = '', 3000);
            }
        `;

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' vscode-resource: https: http:; script-src 'nonce-${nonce}'; img-src https: http: data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CCDC Configuration</title>
                <style>${style}</style>
            </head>
            <body>
                <div class="container">
                    <h2>CCDC AI Configuration</h2>
                    <div id="message"></div>
                    
                    <div class="form-group">
                        <label for="apiKey">Api Key (optional):</label>
                        <input type="password" id="apiKey" placeholder="sk-...">
                    </div>

                    <div class="form-group">
                        <label for="baseUrl">Base URL:</label>
                        <input type="url" id="baseUrl" placeholder="https://gpt.ccdc.com.cn">
                    </div>
                    
                    <div class="form-group">
                        <label for="model">Model:</label>
                        <input type="text" id="model" placeholder="gpt-3.5-turbo">
                    </div>
                    
                    <div class="form-group">
                        <label for="temperature">Temperature:</label>
                        <input type="number" id="temperature" min="0" max="1" step="0.1" placeholder="0.2">
                    </div>
                    
                    <div class="form-group">
                        <label for="maxTokens">Max Tokens:</label>
                        <input type="number" id="maxTokens" min="1" placeholder="512">
                    </div>
                    
                    <div class="form-group">
                        <label for="systemPrompt">System Prompt:</label>
                        <textarea id="systemPrompt" placeholder="You are a helpful coding assistant..."></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="stream"> Enable Streaming
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label for="timeoutMs">Timeout (ms):</label>
                        <input type="number" id="timeoutMs" min="1000" placeholder="60000">
                    </div>
                    
                    <div class="form-group">
                        <label for="systemPrompt">Log Level:</label>
                        <select id="logLevel">
                            <option value="none">None</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                        </select>
                    </div>
                    
                    <div class="buttons">
                        <button id="save">Save Configuration</button>
                        <button id="reset">Reset to Default</button>
                    </div>
                </div>
                <script nonce="${nonce}">${script}</script>
            </body>
            </html>`;
    }
}

async function openConfigurationPanel(extensionUri: vscode.Uri) {
    await ConfigurationPanel.createOrShow(extensionUri);
}

// ===== Chat Webview =====
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function callOpenAIChat(messages: ChatMessage[], signal: AbortSignal, onChunk?: (chunk: string) => void): Promise<string> {
    const cfg = getConfiguration();
    const url = new URL('/v1/chat/completions', cfg.baseUrl);

    const payload = JSON.stringify({
        model: cfg.model,
        messages: messages,
        stream: cfg.stream,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
    });

    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise<string>((resolve, reject) => {
        const req = client.request(
            {
                method: 'POST',
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload).toString(),
                    ...(cfg.apiKey && cfg.apiKey.trim() ? { 'Authorization': `Bearer ${cfg.apiKey.trim()}` } : {}),
                },
                timeout: cfg.timeoutMs,
                signal,
            },
            (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`OpenAI HTTP ${res.statusCode}`));
                    return;
                }

                if (cfg.stream) {
                    let full = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk: string) => {
                        const lines = chunk.split(/\r?\n/).filter(Boolean);
                        for (const line of lines) {
                            try {
                                if (line.startsWith('data: ')) {
                                    const data = line.substring(6);
                                    if (data === '[DONE]') {
                                        continue;
                                    }
                                    const obj = JSON.parse(data) as OpenAIChatResponse;
                                    const piece: string | undefined = obj?.choices?.[0]?.delta?.content;
                                    if (piece) {
                                        full += piece;
                                        onChunk?.(piece);
                                    }
                                }
                                // do not early resolve; wait for 'end'
                            } catch {
                                // ignore bad lines
                            }
                        }
                    });
                    res.on('end', () => resolve(full));
                } else {
                    const chunks: Buffer[] = [];
                    res.on('data', (d: Buffer) => chunks.push(d));
                    res.on('end', () => {
                        try {
                            const raw = Buffer.concat(chunks).toString('utf8');
                            // Non-streaming chat: OpenAI returns a single JSON
                            const obj = JSON.parse(raw) as OpenAIResponse;
                            const text = obj?.choices?.[0]?.message?.content ?? '';
                            resolve(text);
                        } catch (e) {
                            reject(e);
                        }
                    });
                }
            }
        );

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
    });
}

async function saveCodeToFile(code: string, language: string): Promise<string> {
    let baseFileName = 'generated';
    let fileExtension = '';

    // 根据语言确定文件扩展名
    switch (language.toLowerCase()) {
        case 'vue':
            fileExtension = '.vue';
            break;
        case 'java':
            fileExtension = '.java';
            break;
        case 'python':
            fileExtension = '.py';
            break;
        case 'javascript':
            fileExtension = '.js';
            break;
        case 'typescript':
            fileExtension = '.ts';
            break;
        // 可以根据需要添加更多语言支持
        default:
            fileExtension = '.txt';
            break;
    }

    let fileName = baseFileName + fileExtension;
    let counter = 1;

    // 获取当前工作区的根路径
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('未找到工作区根目录');
        return '';
    }

    const basePath = workspaceFolder.uri.fsPath;

    // 检查文件是否已存在，如果存在则添加数字后缀
    while (true) {
        const filePath = path.join(basePath, fileName);
        if (!await fileExists(filePath)) {
            break;
        }
        fileName = `${baseFileName}_${counter++}${fileExtension}`;
    }

    const fileUri = vscode.Uri.file(path.join(basePath, fileName));

    // 写入文件
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(code, 'utf8'));
    return fileUri.fsPath;
}

// 辅助函数，检查文件是否存在
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
    } catch {
        return false;
    }
}


class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _messages: ChatMessage[] = [];
    

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor?.viewColumn;
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'ccdcChat',
            'AI Assistant',
            column ?? vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );
        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        let currentController: AbortController | null = null;
        
        this._panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'stop' && currentController) {
                // 处理停止生成的请求
                currentController.abort();
                currentController = null;
                this._panel.webview.postMessage({ type: 'stopGenerating' });
                return;
            }
            
            if (msg?.type === 'openConfig') {
                await openConfigurationPanel(extensionUri);
                return;
            }
            
            if (msg?.type === 'addContext') {
                // 获取最近打开的文件编辑器
                const recentFiles = vscode.window.tabGroups.all
                    .flatMap(tabGroup => tabGroup.tabs)
                    .filter(tab => tab.input instanceof vscode.TabInputText)
                    .map(tab => ({
                        label: (tab.input as vscode.TabInputText).uri.fsPath.split(/[\\/]/).pop() || '',
                        description: (tab.input as vscode.TabInputText).uri.fsPath,
                        uri: (tab.input as vscode.TabInputText).uri,
                        type: 'file'
                    }))
                    .filter(file => file.label)
                    .slice(0, 10); // 限制显示最多10个文件
                
                // 添加其他上下文类型
                const contextItems = [
                    { type: 'file', label: '文件', icon: '📄', items: recentFiles },
                    { type: 'folder', label: '文件夹', icon: '📁', items: [] },
                    { type: 'image', label: '图片', icon: '🖼️', items: [] },
                    { type: 'codeChanges', label: '代码变更', icon: '📝', items: [] },
                    { type: 'gitCommit', label: 'Git提交', icon: '🔀', items: [] },
                    { type: 'rule', label: '规则', icon: '📋', items: [] }
                ];
                
                this._panel.webview.postMessage({ type: 'showContextPanel', contextItems });
                return;
            }
            
            if (msg?.type === 'selectContext' && msg.contextType && msg.filePath) {
                try {
                    let content = '';
                    let fileName = '';
                    
                    if (msg.contextType === 'file') {
                        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.filePath));
                        content = document.getText();
                        fileName = msg.filePath.split(/[\\/]/).pop() || '';
                    }
                    
                    // 后台读取内容并传递给前端，供模型使用
                    this._panel.webview.postMessage({ 
                        type: 'contextSelected', 
                        contextType: msg.contextType,
                        fileName: fileName,
                        filePath: msg.filePath,
                        content: content, // 新增：提供文件内容给前端
                        hasContent: !!content
                    });
                } catch (err) {
                    vscode.window.showErrorMessage(`无法读取文件: ${err}`);
                }
                return;
            }
            
            // 修复：允许没有text但有fileContent的情况
            if (msg?.type === 'send' && (typeof msg.text === 'string' || msg.fileContent)) {
                const cfg = getConfiguration();
                
                // 验证文件内容是否有效
                if (msg.fileContent && msg.fileContent.trim().length === 0) {
                    log('info', '收到空文件内容', { fileName: msg.fileName });
                    this._panel.webview.postMessage({ 
                        type: 'error', 
                        text: '文件内容为空，请选择其他文件' 
                    });
                    return;
                }
                
                // 验证文件名
                if (msg.fileContent && !msg.fileName) {
                    log('info', '有文件内容但没有文件名');
                    msg.fileName = '未知文件';
                }
                
                const system = cfg.systemPrompt?.trim();
                
                // 调试：检查接收到的消息内容
                log('debug', '收到send消息', {
                    hasText: !!msg.text,
                    textLength: msg.text?.length || 0,
                    text: msg.text ? msg.text.substring(0, 100) + (msg.text.length > 100 ? '...' : '') : '无',
                    hasFileContent: !!msg.fileContent,
                    fileContentLength: msg.fileContent?.length || 0,
                    fileContent: msg.fileContent ? msg.fileContent.substring(0, 100) + (msg.fileContent.length > 100 ? '...' : '') : '无',
                    hasFileName: !!msg.fileName,
                    fileName: msg.fileName || 'none',
                    hasDisplayText: !!msg.displayText,
                    displayText: msg.displayText || 'none',
                    msgKeys: Object.keys(msg) // 查看所有接收到的字段
                });
                
                // 重新添加系统提示词以防止胡乱回答，但确保不会限制详细回答
                if (this._messages.length === 0 && system) {
                    this._messages.push({ role: 'system', content: system });
                    log('info', '系统提示词已设置 (防止胡乱回答)', { systemPrompt: system.substring(0, 150) + '...' });
                }
                
                // 处理文件内容拼接（在后端处理，避免前端JavaScript复杂性）
                const originalUserText = msg.text?.trim() || '';
                let userTextForModel = originalUserText;
                
                // 确保至少有一种内容
                if (!originalUserText && !msg.fileContent) {
                    log('info', '收到send消息但既无text也无fileContent', { msg });
                    return;
                }
                
                // 添加文件类型识别和针对性提示
                if (msg.fileContent && msg.fileName) {
                    let fileTypeHint = '';
                    const fileExt = msg.fileName.split('.').pop()?.toLowerCase();
                    
                    switch (fileExt) {
                        case 'vue':
                            fileTypeHint = '这是一个Vue组件文件，请分析其模板结构、组件功能和样式设计。';
                            break;
                        case 'json':
                            fileTypeHint = '这是一个JSON配置文件，请分析各个配置项的作用和含义。';
                            break;
                        case 'js':
                        case 'ts':
                            fileTypeHint = '这是一个JavaScript/TypeScript文件，请分析其代码结构、函数功能和逻辑流程。';
                            break;
                        case 'css':
                        case 'scss':
                        case 'less':
                            fileTypeHint = '这是一个样式文件，请分析其样式定义和设计意图。';
                            break;
                        case 'html':
                        case 'htm':
                            fileTypeHint = '这是一个HTML文件，请分析其结构和元素组成。';
                            break;
                        case 'md':
                        case 'markdown':
                            fileTypeHint = '这是一个Markdown文档，请分析其内容结构和文档信息。';
                            break;
                        default:
                            fileTypeHint = '请分析这个文件的内容、结构和功能。';
                    }
                    
                    // 最简单直接的文件内容格式
                    userTextForModel = `分析这个${fileExt}文件:

${msg.fileContent}

${originalUserText ? `问题: ${originalUserText}` : ''}`; 
                    
                    log('info', '构建文件分析提示', {
                        fileName: msg.fileName,
                        fileExt: fileExt || '未知',
                        contentLength: msg.fileContent.length,
                        originalQuestion: originalUserText || '默认文件分析问题',
                        hasContent: true
                    });
                } else {
                    log('info', '未收到文件内容，使用纯文本问题', {
                        hasFileContent: false,
                        hasFileName: !!msg.fileName,
                        messageKeys: Object.keys(msg)
                    });
                }
                
                // 显示连接信息
                log('info', '发送消息到AI服务', { 
                    url: cfg.baseUrl, 
                    model: cfg.model, 
                    temperature: cfg.temperature, 
                    maxTokens: cfg.maxTokens,
                    hasFileContent: !!(msg.fileContent && msg.fileName),
                    messageLength: userTextForModel.length,
                    hasSystemPrompt: !!(system)
                });
                
                // 如果没有原始文本且没有文件内容，则跳过
                if (!userTextForModel) {
                    log('info', '构建的userTextForModel为空', { originalUserText, fileContent: !!msg.fileContent });
                    return;
                }
                
                this._messages.push({ role: 'user', content: userTextForModel });
                
                // 调试信息：记录发送给AI的完整消息
                log('debug', '发送给AI的消息详细信息', { 
                    messagesCount: this._messages.length,
                    systemPrompt: this._messages.find(m => m.role === 'system')?.content?.substring(0, 100) + '...',
                    userMessage: userTextForModel.substring(0, 300) + (userTextForModel.length > 300 ? '...' : ''),
                    hasFileContent: !!(msg.fileContent && msg.fileName),
                    fileName: msg.fileName || 'none',
                    fileContentLength: msg.fileContent?.length || 0,
                    originalText: originalUserText,
                    msgKeys: Object.keys(msg)
                });
                
                // 前端显示简洁的提示或原始问题
                const displayText = msg.displayText || originalUserText || `[📄 分析文件: ${msg.fileName}]`;
                this._panel.webview.postMessage({ type: 'appendUser', text: displayText });

                currentController = new AbortController();
                this._panel.onDidDispose(() => {
                    if (currentController) {
                        currentController.abort();
                        currentController = null;
                    }
                });

                // 调试：记录最终发送给AI的消息结构
                log('debug', '最终发送给AI的消息结构', {
                    totalMessages: this._messages.length,
                    messageTypes: this._messages.map(m => m.role),
                    systemPrompt: this._messages.find(m => m.role === 'system')?.content,
                    userMessage: this._messages[this._messages.length - 1]?.content,
                    hasFileContent: !!(msg.fileContent && msg.fileName)
                });
                
                let assistantText = '';
                let gotStreamChunk = false;
                try {
                    const text = await callOpenAIChat(this._messages, currentController.signal, (chunk) => {
                        gotStreamChunk = true;
                        assistantText += chunk;
                        this._panel.webview.postMessage({ type: 'appendAssistantChunk', text: chunk });
                    });
                    assistantText = text || assistantText;
                    if (assistantText) {
                        if (!gotStreamChunk) {
                            // Non-streaming path: push the whole message once
                            this._panel.webview.postMessage({ type: 'appendAssistantChunk', text: assistantText });
                        }
                        this._messages.push({ role: 'assistant', content: assistantText });
                        this._panel.webview.postMessage({ type: 'finalizeAssistant' });
                        log('debug', 'Assistant message generated', { length: assistantText.length });
                    }
                } catch (err: any) {
                    if (err?.name !== 'AbortError') {
                        vscode.window.showErrorMessage(`AI Assistant failed: ${err?.message ?? String(err)}`);
                        this._panel.webview.postMessage({ type: 'error', text: String(err?.message ?? err) });
                        log('info', 'ChatPanel generation failed', { error: String(err?.message ?? err) });
                    }
                } finally {
                    currentController = null;
                }
            }
            if (msg?.type === 'clear') {
                this._messages = [];
                this._panel.webview.postMessage({ type: 'cleared' });
                log('debug', 'ChatPanel cleared');
            }
            if (msg?.type === 'closeWindow') {
                this._panel.dispose();
            }
            if (msg?.type === 'insertToEditor' && typeof msg.text === 'string') {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await editor.edit((editBuilder) => {
                        const selection = editor.selection;
                        if (selection && !selection.isEmpty) {
                            editBuilder.replace(selection, msg.text);
                        } else {
                            editBuilder.insert(selection.active, msg.text);
                        }
                    });
                    log('info', 'Inserted assistant text into editor', { length: msg.text.length });
                }
            }
        }, undefined, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        ChatPanel.currentPanel = undefined;
        while (this._disposables.length) {
            const x = this._disposables.pop();
            try { x?.dispose(); } catch {}
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const style = `
            :root { --bg:#1e1e1e; --fg:#e5e5e5; --muted:#999; --b:#2a2a2a; --accent:#4e94ce; }
            body { margin:0; padding:0; font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); }
            .container { display:flex; flex-direction:column; height:100vh; }
            .messages { flex:1; overflow:auto; padding:12px; }
            .msg { padding:8px 10px; border-radius:6px; margin-bottom:8px; white-space:pre-wrap; word-break:break-word; }
            .user { background: #2f3b4a; }
            .assistant { background: #2a2a2a; }
            .system { background: #262626; color: var(--muted); }
            .input-container { position: relative; border-top:1px solid #333; padding:8px; }
            .loading-indicator {
                display: none;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: #2a2a2a;
                border: 1px solid #4e94ce;
                border-radius: 4px;
                margin-bottom: 8px;
                font-size: 12px;
                color: #cccccc;
                position: absolute;
                top: -50px;
                left: 0;
                right: 0;
                z-index: 1000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            }
            .spinner {
                width: 16px;
                height: 16px;
                border: 2px solid #333;
                border-top: 2px solid #4e94ce;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .cancel-btn {
                background: #ff6b6b;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 3px;
                margin-left: auto;
            }
            .cancel-btn:hover {
                background: #e55a5a;
            }
            .input-field { 
                width: 100%; 
                min-height: 40px; 
                max-height: 160px; 
                padding: 8px 12px; 
                border-radius: 6px; 
                border: 1px solid #4e94ce; 
                background: #2a2a2a; 
                color: var(--fg); 
                font-family: var(--vscode-font-family);
                resize: vertical;
                outline: none;
                box-sizing: border-box;
            }
            .input-field::placeholder { color: #999; }
            .input-hints { 
                display: flex; 
                justify-content: space-between; 
                margin-top: 4px; 
                padding: 0 4px; 
                font-size: 12px; 
                color: #999; 
            }
            .placeholder-text { color: #999; }
            .keyboard-hint { color: #999; }
            .right-hints {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .config-btn {
                background: none;
                border: none;
                color: #999;
                cursor: pointer;
                font-size: 14px;
                padding: 2px;
                border-radius: 3px;
                transition: color 0.2s ease;
            }
            .config-btn:hover {
                color: #4e94ce;
            }
            .input-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            .context-btn {
                background: #3a3a3a;
                border: 1px solid #555;
                color: #fff;
                cursor: pointer;
                font-size: 12px;
                padding: 6px 12px;
                border-radius: 4px;
                transition: background-color 0.2s ease;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .context-btn:hover {
                background: #4a4a4a;
            }
            .file-panel {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                background: #252526;
                border: 1px solid #3e3e42;
                border-radius: 6px;
                max-height: 400px;
                overflow-y: auto;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                transform: translateY(-100%);
                margin-top: -8px;
            }
            .context-category {
                padding: 8px 12px;
                border-bottom: 1px solid #2d2d30;
                cursor: pointer;
                transition: background-color 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .context-category:hover {
                background: #2a2d2e;
            }
            .context-category.expanded {
                background: #094771;
            }
            .context-icon {
                font-size: 16px;
                width: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .context-label {
                font-size: 13px;
                color: #cccccc;
                flex: 1;
            }
            .context-items {
                background: #1e1e1e;
                max-height: 200px;
                overflow-y: auto;
            }
            .context-item {
                padding: 6px 40px;
                cursor: pointer;
                transition: background-color 0.2s ease;
                font-size: 12px;
                color: #cccccc;
            }
            .context-item:hover {
                background: #2a2d2e;
            }
            .context-item.selected {
                background: #094771;
            }
            .search-input {
                width: 100%;
                padding: 8px 12px;
                background: #3c3c3c;
                border: 1px solid #3e3e42;
                border-radius: 0;
                color: #cccccc;
                font-size: 13px;
                outline: none;
                box-sizing: border-box;
            }
            .search-input::placeholder {
                color: #858585;
            }
            .panel-header {
                padding: 8px 12px;
                background: #2d2d30;
                border-bottom: 1px solid #3e3e42;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .panel-title {
                font-size: 12px;
                color: #cccccc;
                font-weight: 500;
            }
            .selected-context {
                background: #0e293f;
                border: 1px solid #094771;
                border-radius: 4px;
                padding: 6px 8px;
                margin-bottom: 8px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .context-tag {
                background: #094771;
                color: #ffffff;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: 500;
            }
            .context-name {
                color: #cccccc;
                flex: 1;
            }
            .remove-context {
                background: none;
                border: none;
                color: #858585;
                cursor: pointer;
                padding: 2px;
                border-radius: 2px;
                font-size: 12px;
            }
            .remove-context:hover {
                background: #3e3e42;
                color: #cccccc;
            }
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #2d2d30;
                border-bottom: 1px solid #3e3e42;
            }
            .header-title {
                font-size: 14px;
                font-weight: 500;
                color: #cccccc;
            }
            .header-actions {
                display: flex;
                gap: 4px;
            }
            .header-btn {
                background: none;
                border: none;
                color: #cccccc;
                cursor: pointer;
                font-size: 16px;
                padding: 4px 8px;
                border-radius: 4px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
                height: 32px;
                marigin-left: -10px;
            }
            .header-btn:hover {
                background: #3e3e42;
                color: #ffffff;
            }
            .history-panel {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                background: #252526;
                border: 1px solid #3e3e42;
                border-radius: 6px;
                max-height: 400px;
                overflow-y: auto;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                transform: translateY(-100%);
                margin-top: -8px;
            }
            .history-item {
                padding: 12px;
                border-bottom: 1px solid var(--vscode-menu-separatorBackground);
                cursor: pointer;
                transition: background-color 0.2s ease;
                display: flex;
                flex-direction: column;
                gap: 4px;
                position: relative;
            }
            .history-delete-btn {
                background: none; 
                border: none;
                color: white;
            }
            .history-item:hover .history-delete-btn {
                opacity: 1;
            }
            .history-item:hover {
                background: #2a2d2e;
            }
            .history-item:last-child {
                border-bottom: none;
            }
            .history-title {
                font-size: 13px;
                color: #cccccc;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .history-time {
                font-size: 11px;
                color: #858585;
            }
            .history-preview {
                font-size: 12px;
                color: #999;
                white-space: nowrap;

                overflow: hidden;
                text-overflow: ellipsis;
                margin-top: 2px;
            }
            .history-header {
                padding: 8px 12px;
                background: #2d2d30;
                border-bottom: 1px solid #3e3e42;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .history-title-header {
                font-size: 12px;
                color: #cccccc;
                font-weight: 500;
            }
            .history-close {
                background: none;
                border: none;
                color: #858585;
                cursor: pointer;
                font-size: 14px;
                padding: 2px;
                border-radius: 2px;
            }
            .history-close:hover {
                background: #3e3e42;
                color: #cccccc;
            }
            .input-wrapper {
                position: relative;
            }
            .input-buttons {
                position: absolute;
                bottom: 8px;
                right: 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
        `;

        const script = `
            const vscode = acquireVsCodeApi();
            const messagesEl = document.getElementById('messages');
            const inputEl = document.getElementById('input');
            let assemblingAssistant = false;
            let lastAssistantEl = null;
            let isGenerating = false;
            let selectedContexts = [];
            const filePanelEl = document.getElementById('file-panel');
            const contextBtnEl = document.getElementById('context-btn');
            const loadingIndicatorEl = document.getElementById('loading-indicator');
            const cancelBtnEl = document.getElementById('cancel-btn');
            const historyPanelEl = document.getElementById('history-panel');
            const newChatBtnEl = document.getElementById('new-chat-btn');
            const historyBtnEl = document.getElementById('history-btn');
            const closeBtnEl = document.getElementById('close-btn');
            const sendBtnEl = document.getElementById('send-btn');
            const pauseBtnEl = document.getElementById('pause-btn');
            
            // 历史记录管理
            let chatHistory = JSON.parse(localStorage.getItem('ccdc_chat_history') || '[]');
            let currentChatId = null;

            // 保存聊天记录到本地存储
            function saveChatHistory() {
                localStorage.setItem('ccdc_chat_history', JSON.stringify(chatHistory));
            }

            // 创建新聊天
            function createNewChat() {
                currentChatId = Date.now().toString();
                const newChat = {
                    id: currentChatId,
                    title: '新对话',
                    messages: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                chatHistory.unshift(newChat);
                saveChatHistory();
                return newChat;
            }

            // 更新当前聊天标题
            function updateChatTitle(title) {
                if (currentChatId) {
                    const chat = chatHistory.find(c => c.id === currentChatId);
                    if (chat) {
                        chat.title = title;
                        chat.updatedAt = new Date().toISOString();
                        saveChatHistory();
                    }
                }
            }

            // 添加消息到当前聊天
            function addMessageToCurrentChat(role, content) {
                if (!currentChatId) {
                    createNewChat();
                }
                const chat = chatHistory.find(c => c.id === currentChatId);
                if (chat) {
                    chat.messages.push({ role, content, timestamp: new Date().toISOString() });
                    chat.updatedAt = new Date().toISOString();
                    saveChatHistory();
                }
            }

            // 渲染历史记录面板
            function renderHistoryPanel() {
                if (!historyPanelEl) return;
                
                let html = '<div class="history-header">' +
                    '<span class="history-title-header">历史对话</span>' +
                    '<button class="history-close" id="history-close">✕</button>' +
                    '</div>';
                
                // 过滤掉没有消息的对话
                const validChats = chatHistory.filter(chat => chat.messages && chat.messages.length > 0);
                
                if (validChats.length === 0) {
                    html += '<div class="history-item" style="text-align: center; color: #999; padding: 20px;">暂无历史对话</div>';
                } else {
                    validChats.forEach(chat => {
                        const time = new Date(chat.updatedAt).toLocaleString('zh-CN');
                        const preview = chat.messages[0].content.substring(0, 50) + (chat.messages[0].content.length > 50 ? '...' : '');
                        html += '<div class="history-item" data-chat-id="' + chat.id + '">' +
                            '<div class="history-content">' +
                                '<div class="history-title">' + chat.title + '</div>' +
                                '<div class="history-time">' + time + '</div>' +
                            '</div>' +
                            '<button class="history-delete-btn" data-chat-id="' + chat.id + '" title="删除对话">X</button>' +
                            '</div>';
                    });
                }
                
                historyPanelEl.innerHTML = html;
            }

            // 加载聊天记录
            function loadChat(chatId) {
                const chat = chatHistory.find(c => c.id === chatId);
                if (chat) {
                    currentChatId = chatId;
                    messagesEl.innerHTML = '';
                    chat.messages.forEach(msg => {
                        append(msg.role, msg.content);
                    });
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                }
            }

            // 删除聊天记录
            function deleteChat(chatId) {
                const index = chatHistory.findIndex(c => c.id === chatId);
                if (index !== -1) {
                    chatHistory.splice(index, 1);
                    saveChatHistory();
                    // 如果删除的是当前聊天，清空显示
                    if (currentChatId === chatId) {
                        currentChatId = null;
                        messagesEl.innerHTML = '';
                    }
                    // 重新渲染历史面板
                    renderHistoryPanel();
                }
            }

            function append(role, text) {
                const el = document.createElement('div');
                el.className = 'msg ' + role;
                el.textContent = text;
                messagesEl.appendChild(el);
                messagesEl.scrollTop = messagesEl.scrollHeight;
                return el;
            }

            function showLoading() {
                if (loadingIndicatorEl) {
                    loadingIndicatorEl.style.display = 'flex';
                }
                if (sendBtnEl) {
                    sendBtnEl.style.display = 'none';
                }
                if (pauseBtnEl) {
                    pauseBtnEl.style.display = 'flex';
                }
                isGenerating = true;
            }

            function hideLoading() {
                if (loadingIndicatorEl) {
                    loadingIndicatorEl.style.display = 'none';
                }
                if (sendBtnEl) {
                    sendBtnEl.style.display = 'flex';
                }
                if (pauseBtnEl) {
                    pauseBtnEl.style.display = 'none';
                }
                isGenerating = false;
            }

            function sendMessage() {
                if (isGenerating) {
                    return; // 如果正在生成，直接返回，不允许重复发送
                }
                
                let text = inputEl.value.trim();
                if (!text) return;
                
                // 检查是否有选中的文件内容
                let fileContent = null;
                let fileName = null;
                let displayText = text; // 前端显示的文本
                if (selectedContexts.length > 0) {
                    const fileContext = selectedContexts.find(ctx => ctx.contextType === 'file' && ctx.content);
                    if (fileContext) {
                        fileContent = fileContext.content;
                        fileName = fileContext.fileName;
                        // 在前端显示简洁的提示信息
                        displayText = '[📄 包含文件: ' + fileName + '] ' + text;
                    }
                }
                
                // 如果没有当前聊天，创建一个新的
                if (!currentChatId) {
                    createNewChat();
                }
                
                // 保存用户消息到历史记录
                addMessageToCurrentChat('user', displayText);
                
                // 更新聊天标题（使用第一条用户消息）
                if (chatHistory.find(c => c.id === currentChatId)?.messages.length === 1) {
                    const title = text.length > 20 ? text.substring(0, 20) + '...' : text;
                    updateChatTitle(title);
                }
                
                inputEl.value = '';
                showLoading();
                vscode.postMessage({ 
                    type: 'send', 
                    text: text, // 原始用户问题
                    displayText: displayText, // 前端显示的文本
                    fileContent: fileContent,
                    fileName: fileName
                });
            }

            function renderContextPanel(contextItems) {
                if (!filePanelEl) return;
                
                let html = '<div class="panel-header">' +
                    '<span class="panel-title">选择上下文类型</span>' +
                    '</div>' +
                    '<input type="text" class="search-input" placeholder="输入关键词搜索..." id="context-search">';
                
                contextItems.forEach(category => {
                    const hasItems = category.items && category.items.length > 0;
                    html += '<div class="context-category ' + (category.type === 'file' && hasItems ? 'expanded' : '') + '" data-type="' + category.type + '">' +
                        '<span class="context-icon">' + category.icon + '</span>' +
                        '<span class="context-label">@' + category.type + '</span>' +
                        '</div>';
                    
                    if (category.type === 'file' && hasItems) {
                        html += '<div class="context-items">';
                        category.items.forEach(item => {
                            html += '<div class="context-item" data-type="' + category.type + '" data-path="' + item.description + '" data-name="' + item.label + '">' +
                                item.label + 
                                '</div>';
                        });
                        html += '</div>';
                    }
                });
                
                filePanelEl.innerHTML = html;
                
                // 添加事件监听
                filePanelEl.querySelectorAll('.context-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const contextType = item.dataset.type;
                        const filePath = item.dataset.path;
                        const fileName = item.dataset.name;
                        vscode.postMessage({ type: 'selectContext', contextType, filePath, fileName });
                        filePanelEl.style.display = 'none';
                    });
                });
            }

            // 键盘事件处理
            if (inputEl) {
                inputEl.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                    }
                    if (event.key === 'Escape' && filePanelEl) {
                        filePanelEl.style.display = 'none';
                    }
                });
            }

            // 配置按钮事件处理
            const configBtn = document.getElementById('config-btn');
            if (configBtn) {
                configBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'openConfig' });
                });
            }

            // 添加上下文按钮事件处理
            if (contextBtnEl && filePanelEl) {
                contextBtnEl.addEventListener('click', () => {
                    if (filePanelEl.style.display === 'none' || !filePanelEl.style.display) {
                        vscode.postMessage({ type: 'addContext' });
                    } else {
                        filePanelEl.style.display = 'none';
                    }
                });
            }

            // 取消按钮事件处理
            if (cancelBtnEl) {
                cancelBtnEl.addEventListener('click', () => {
                    vscode.postMessage({ type: 'stop' });
                });
            }

            // 新对话按钮事件处理
            if (newChatBtnEl) {
                newChatBtnEl.addEventListener('click', () => {
                    // 清空当前消息显示
                    messagesEl.innerHTML = '';
                    // 创建新聊天
                    createNewChat();
                    // 隐藏历史面板
                    if (historyPanelEl) {
                        historyPanelEl.style.display = 'none';
                    }
                });
            }

            // 历史记录按钮事件处理
            if (historyBtnEl && historyPanelEl) {
                historyBtnEl.addEventListener('click', () => {
                    if (historyPanelEl.style.display === 'none' || !historyPanelEl.style.display) {
                        renderHistoryPanel();
                        historyPanelEl.style.display = 'block';
                    } else {
                        historyPanelEl.style.display = 'none';
                    }
                });
            }

            // 关闭窗口按钮事件处理
            if (closeBtnEl) {
                closeBtnEl.addEventListener('click', () => {
                    vscode.postMessage({ type: 'closeWindow' });
                });
            }

            // 发送按钮事件处理
            if (sendBtnEl) {
                sendBtnEl.addEventListener('click', () => {
                    sendMessage();
                });
            }

            // 暂停按钮事件处理
            if (pauseBtnEl) {
                pauseBtnEl.addEventListener('click', () => {
                    if (isGenerating) {
                        vscode.postMessage({ type: 'stop' });
                        hideLoading();
                    }
                });
            }

            // 点击其他地方关闭文件面板和历史面板
            document.addEventListener('click', (event) => {
                if (contextBtnEl && filePanelEl && 
                    !contextBtnEl.contains(event.target) && 
                    !filePanelEl.contains(event.target)) {
                    filePanelEl.style.display = 'none';
                }
                if (historyBtnEl && historyPanelEl && 
                    !historyBtnEl.contains(event.target) && 
                    !historyPanelEl.contains(event.target)) {
                    historyPanelEl.style.display = 'none';
                }
            });

            // 历史记录面板点击事件处理
            if (historyPanelEl) {
                historyPanelEl.addEventListener('click', (event) => {
                    const target = event.target;
                    const historyItem = target.closest('.history-item');
                    const historyClose = target.closest('#history-close');
                    const deleteBtn = target.closest('.history-delete-btn');
                    
                    if (historyClose) {
                        historyPanelEl.style.display = 'none';
                    } else if (deleteBtn) {
                        event.stopPropagation(); // 阻止事件冒泡
                        event.preventDefault(); // 阻止默认行为
                        const chatId = deleteBtn.dataset.chatId;
                        console.log('删除按钮被点击，chatId:', chatId);
                        if (chatId) {
                            deleteChat(chatId);
                        }
                    } else if (historyItem) {
                        const chatId = historyItem.dataset.chatId;
                        if (chatId) {
                            loadChat(chatId);
                            historyPanelEl.style.display = 'none';
                        }
                    }
                });
            }

            // 添加清除上下文的函数
            window.clearContexts = function() {
                selectedContexts = [];
                if (contextBtnEl) {
                    contextBtnEl.innerHTML = '<span>➕</span><span>添加上下文</span>';
                }
            };

            // 添加保存按钮到最后一条助手消息的右下角
            function addSaveButtonToLastMessage() {
                if (lastAssistantEl) {
                    const oldSaveBtn = document.getElementById('save');
                    if (oldSaveBtn) {
                        oldSaveBtn.remove();
                    }
                    
                    const saveBtn = document.createElement('button');
                    saveBtn.id = 'save';
                    saveBtn.className = 'secondary save-btn';
                    saveBtn.textContent = '保存到文件';
                    saveBtn.style.position = 'relative';
                    saveBtn.style.float = 'right';
                    saveBtn.style.marginTop = '8px';
                    
                    saveBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'saveToFile', text: lastAssistantEl.textContent || '' });
                    });
                    
                    lastAssistantEl.insertAdjacentElement('afterend', saveBtn);
                }
            }
            
            window.addEventListener('message', (event) => {
                const msg = event.data || {};
                if (msg.type === 'appendUser') {
                    append('user', msg.text || '');
                    lastAssistantEl = append('assistant', '');
                    assemblingAssistant = true;
                }
                if (msg.type === 'appendAssistantChunk' && assemblingAssistant && lastAssistantEl) {
                    lastAssistantEl.textContent = (lastAssistantEl.textContent || '') + (msg.text || '');
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                }
                if (msg.type === 'finalizeAssistant') {
                    assemblingAssistant = false;
                    hideLoading();
                    // 在模型生成完内容后添加保存按钮
                    addSaveButtonToLastMessage();
                    // 保存助手消息到历史记录
                    if (lastAssistantEl) {
                        addMessageToCurrentChat('assistant', lastAssistantEl.textContent || '');
                    }
                    // 注意：不清除上下文选择，保持用户选择的文件
                }
                if (msg.type === 'showContextPanel' && filePanelEl) {
                    renderContextPanel(msg.contextItems);
                    filePanelEl.style.display = 'block';
                }
                if (msg.type === 'contextSelected') {
                    selectedContexts.push({
                        contextType: msg.contextType,
                        fileName: msg.fileName,
                        filePath: msg.filePath,
                        content: msg.content, // 新增：存储文件内容
                        hasContent: msg.hasContent
                    });
                    
                    // 在按钮上显示选择的上下文数量和文件名
                    if (selectedContexts.length > 0 && contextBtnEl) {
                        const fileNames = selectedContexts.map(ctx => ctx.fileName).join(', ');
                        contextBtnEl.innerHTML = '<span>➕</span><span>添加上下文 (' + selectedContexts.length + '): ' + fileNames + '</span><button onclick="clearContexts()" style="margin-left:8px;background:red;color:white;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;">清除</button>';
                    }
                }
                if (msg.type === 'error') {
                    append('system', String(msg.text || 'Error'));
                    hideLoading();
                }
                if (msg.type === 'stopGenerating') {
                    hideLoading();
                }
            });
        `;

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' vscode-resource: https: http:; script-src 'nonce-${nonce}'; img-src https: http: data:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Assistant</title>
                <style>${style}</style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="header-title">AI Assistant</div>
                        <div class="header-actions">
                            <button id="new-chat-btn" class="header-btn" title="新对话">💬</button>
                            <button id="history-btn" class="header-btn" title="历史记录">🕒</button>
                            <button id="config-btn" class="header-btn" title="设置">⚙️</button>
                            <button id="close-btn" class="header-btn" title="关闭窗口">✕</button>
                        </div>
                    </div>
                    <div class="messages" id="messages"></div>
                    <div class="input-container">
                        <div id="loading-indicator" class="loading-indicator" style="display: none;">
                            <div class="spinner"></div>
                            <span>正在生成回复...</span>
                            <button id="cancel-btn" class="cancel-btn">取消</button>
                        </div>
                        <div class="input-actions">
                            <button id="context-btn" class="context-btn">
                                <span>➕</span>
                                <span>添加上下文</span>
                            </button>
                        </div>
                        <div id="file-panel" class="file-panel" style="display: none;"></div>
                        <div id="history-panel" class="history-panel" style="display: none;"></div>
                        <div class="input-wrapper">
                            <textarea id="input" class="input-field"></textarea>
                            <div class="input-buttons">
                                <button id="send-btn" class="send-btn" title="发送"></button>
                                <button id="pause-btn" class="pause-btn" title="暂停" style="display: none;"></button>
                            </div>
                        </div>
                        <div class="input-hints">
                            <span class="placeholder-text">to ask, code, and more</span>
                            <div class="right-hints">
                                <span class="keyboard-hint">Shift + ⏎ / Send</span>
                            </div>
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}">${script}</script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function detectLanguageFromCode(code: string): string {
    // 这里可以根据代码内容简单判断语言类型，实际使用时可以使用更复杂的逻辑
    if (code.includes('public class')) return 'java';
    if (code.includes('<template')) return 'vue';
    if (code.includes('def ')) return 'python';
    if (code.includes('function ')) return 'javascript';
    if (code.includes('interface ')) return 'typescript';
    return 'plaintext';
}
// ===== Chat View (Secondary Side Bar) =====
class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'ccdc.chatView';
    private _view?: vscode.WebviewView;
    private _messages: any[] = [];
    private _currentController: AbortController | null = null;

    constructor(private readonly _extensionUri: vscode.Uri) {}
    
    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;
        webviewView.webview.options = { 
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        
        // 设置完整的HTML内容，包含上下文标签功能
        webviewView.webview.html = this.getWebviewContent(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'addContext':
                    await this.handleAddContext();
                    break;
                case 'selectContext':
                    await this.handleSelectContext(message);
                    break;
                case 'removeContext':
                    await this.handleRemoveContext(message);
                    break;
                case 'addImage':
                    await this.handleAddImage(message);
                    break;
                case 'send':
                    // 修复：允许没有text但有fileContent的情况
                    if (typeof message.text === 'string' || message.fileContent) {
                        await this.handleSendMessage(message.text || '', message.fileContent, message.fileName, message.displayText);
                    } else {
                        log('info', 'ChatViewProvider: 收到send消息但既无text也无fileContent', { message });
                    }
                    break;
                case 'stop':
                    this.handleStop();
                    break;
                case 'clear':
                    this.clearMessages();
                    break;
                case 'openConfig':
                    await this.handleOpenConfig();
                    break;
                case 'saveToFile':
                    await this.handleSaveToFile(message.text);
                    break;
            }
        });
    }

    private async handleAddContext() {
        // 获取最近打开的文件
        const recentFiles = vscode.window.tabGroups.all
            .flatMap(tabGroup => tabGroup.tabs)
            .filter(tab => tab.input instanceof vscode.TabInputText)
            .map(tab => ({
                label: (tab.input as vscode.TabInputText).uri.fsPath.split(/[\\/]/).pop() || '',
                description: (tab.input as vscode.TabInputText).uri.fsPath,
                type: 'file'
            }))
            .filter(file => file.label)
            .slice(0, 10);
        
        // 发送文件列表到webview
        this._view?.webview.postMessage({ 
            type: 'showContextPanel', 
            contextItems: [{ 
                type: 'file', 
                label: '最近文件', 
                icon: '📄', 
                items: recentFiles 
            }]
        });
    }

    private async handleSelectContext(message: any) {
        if (message.contextType === 'file' && message.filePath) {
            try {
                // 读取文件内容
                const document = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
                const content = document.getText();
                const fileName = message.filePath.split(/[\\/]/).pop() || '';
                
                // 调试：记录文件读取信息
                log('debug', '文件内容读取成功', {
                    fileName: fileName,
                    filePath: message.filePath,
                    contentLength: content.length,
                    contentPreview: content.substring(0, 100) + '...'
                });
                
                // 发送选中的上下文到webview，包含完整的文件内容
                this._view?.webview.postMessage({ 
                    type: 'contextSelected', 
                    contextType: message.contextType,
                    fileName: fileName,
                    filePath: message.filePath,
                    content: content, // 新增：提供文件内容给前端
                    hasContent: !!content // 新增：标记是否有内容
                });
            } catch (err) {
                vscode.window.showErrorMessage(`无法读取文件: ${err}`);
            }
        }
    }

    private async handleRemoveContext(message: any) {
        this._view?.webview.postMessage({ 
            type: 'contextRemoved', 
            index: message.index, 
            contextType: message.contextType 
        });
    }

    private async handleAddImage(message: any) {
        this._view?.webview.postMessage({ 
            type: 'imageAdded', 
            imageData: message.imageData,
            imageName: message.imageName || 'pasted-image.png'
        });
    }

    private async handleSendMessage(text: string, fileContent?: string, fileName?: string, displayText?: string) {
        // 验证文件内容是否有效
        if (fileContent && fileContent.trim().length === 0) {
            log('info', 'ChatViewProvider: 收到空文件内容', { fileName: fileName });
            this._view?.webview.postMessage({ 
                type: 'error', 
                text: '文件内容为空，请选择其他文件' 
            });
            return;
        }
        
        // 验证文件名
        if (fileContent && !fileName) {
            log('info', 'ChatViewProvider: 有文件内容但没有文件名');
            fileName = '未知文件';
        }
        
        // 调试：记录接收到的参数
        log('debug', 'ChatViewProvider: 收到handleSendMessage调用', {
            hasText: !!text,
            textLength: text?.length || 0,
            text: text ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : '无',
            hasFileContent: !!fileContent,
            fileContentLength: fileContent?.length || 0,
            fileContent: fileContent ? fileContent.substring(0, 100) + (fileContent.length > 100 ? '...' : '') : '无',
            hasFileName: !!fileName,
            fileName: fileName || 'none',
            hasDisplayText: !!displayText,
            displayText: displayText || 'none'
        });
        
        // 确保至少有一种内容
        if (!text?.trim() && !fileContent) {
            log('info', 'ChatViewProvider: 既无text也无fileContent', { text, fileContent });
            return;
        }
        
        const cfg = getConfiguration();
        const system = cfg.systemPrompt?.trim();
        // 重新添加系统提示词以防止胡乱回答，但确保不会限制详细回答
        if (this._messages.length === 0 && system) {
            this._messages.push({ role: 'system', content: system });
            log('info', '系统提示词已设置 (ChatViewProvider - 防止胡乱回答)', { systemPrompt: system.substring(0, 150) + '...' });
        }
        
        // 处理文件内容拼接
        const originalUserText = text?.trim() || '';
        let userTextForModel = originalUserText;
        
        // 添加文件类型识别和针对性提示
        if (fileContent && fileName) {
            let fileTypeHint = '';
            const fileExt = fileName.split('.').pop()?.toLowerCase();
            
            switch (fileExt) {
                case 'vue':
                    fileTypeHint = '这是一个Vue组件文件，请分析其模板结构、组件功能和样式设计。';
                    break;
                case 'json':
                    fileTypeHint = '这是一个JSON配置文件，请分析各个配置项的作用和含义。';
                    break;
                case 'js':
                case 'ts':
                    fileTypeHint = '这是一个JavaScript/TypeScript文件，请分析其代码结构、函数功能和逻辑流程。';
                    break;
                case 'css':
                case 'scss':
                case 'less':
                    fileTypeHint = '这是一个样式文件，请分析其样式定义和设计意图。';
                    break;
                case 'html':
                case 'htm':
                    fileTypeHint = '这是一个HTML文件，请分析其结构和元素组成。';
                    break;
                case 'md':
                case 'markdown':
                    fileTypeHint = '这是一个Markdown文档，请分析其内容结构和文档信息。';
                    break;
                default:
                    fileTypeHint = '请分析这个文件的内容、结构和功能。';
            }
            
            // 最简单直接的文件内容格式
            userTextForModel = `分析这个${fileExt}文件:

${fileContent}

${originalUserText ? `问题: ${originalUserText}` : ''}`;
            
            log('info', 'ChatViewProvider: 构建文件分析提示', {
                fileName: fileName,
                fileExt: fileExt || '未知',
                contentLength: fileContent.length,
                originalQuestion: originalUserText || '默认文件分析问题',
                hasContent: true
            });
        } else {
            log('info', 'ChatViewProvider: 未收到文件内容，使用纯文本问题', {
                hasFileContent: false,
                hasFileName: !!fileName,
                textLength: originalUserText.length
            });
        }
        
        // 确保有内容可发送
        if (!userTextForModel) {
            log('info', 'ChatViewProvider: 构建的userTextForModel为空', { originalUserText, fileContent: !!fileContent });
            return;
        }
        
        // 显示连接信息
        log('info', 'ChatViewProvider: 发送消息到AI服务', { 
            url: cfg.baseUrl, 
            model: cfg.model, 
            temperature: cfg.temperature, 
            maxTokens: cfg.maxTokens,
            hasFileContent: !!(fileContent && fileName),
            messageLength: userTextForModel.length,
            hasSystemPrompt: !!(system)
        });
        
        this._messages.push({ role: 'user', content: userTextForModel });
        
        // 调试信息：记录发送给AI的完整消息
        log('debug', 'ChatViewProvider: 发送给AI的消息详细信息', { 
            messagesCount: this._messages.length,
            lastMessage: userTextForModel.substring(0, 200) + (userTextForModel.length > 200 ? '...' : ''),
            hasFileContent: !!(fileContent && fileName),
            originalText: originalUserText,
            hasSystemPrompt: this._messages.some(m => m.role === 'system')
        });
        
        // 前端显示简洁的提示或原始问题
        const textToDisplay = displayText || originalUserText || `[📄 分析文件: ${fileName}]`;
        this._view?.webview.postMessage({ type: 'appendUser', text: textToDisplay });
        
        // 调用真实的AI API
        this._currentController = new AbortController();
        let assistantText = '';
        let gotStreamChunk = false;
        
        try {
            const response = await callOpenAIChat(this._messages, this._currentController.signal, (chunk) => {
                gotStreamChunk = true;
                assistantText += chunk;
                this._view?.webview.postMessage({ type: 'appendAssistantChunk', text: chunk });
            });
            
            assistantText = response || assistantText;
            if (assistantText) {
                if (!gotStreamChunk) {
                    // Non-streaming path: push the whole message once
                    this._view?.webview.postMessage({ type: 'appendAssistantChunk', text: assistantText });
                }
                this._messages.push({ role: 'assistant', content: assistantText });
                this._view?.webview.postMessage({ type: 'finalizeAssistant' });

                // 自动保存生成的代码为文件
                const language = detectLanguageFromCode(assistantText);
                await saveCodeToFile(assistantText, language);
                log('debug', 'ChatViewProvider: Assistant message generated', { length: assistantText.length });
            }
        } catch (err: any) {
            if (err?.name !== 'AbortError') {
                vscode.window.showErrorMessage(`AI Assistant failed: ${err?.message ?? String(err)}`);
                this._view?.webview.postMessage({ type: 'error', text: String(err?.message ?? err) });
                log('info', 'ChatViewProvider generation failed', { error: String(err?.message ?? err) });
            }
        } finally {
            this._currentController = null;
        }
    }

    private async handleOpenConfig() {
        await openConfigurationPanel(this._extensionUri);
    }

    private async handleSaveToFile(text: string) {
        if (!text?.trim()) return;
        
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('ai-response.md'),
                filters: {
                    'Markdown': ['md'],
                    'Text': ['txt'],
                    'All Files': ['*']
                }
            });
            
            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
                vscode.window.showInformationMessage(`文件已保存到: ${uri.fsPath}`);
            }
        } catch (err) {
            vscode.window.showErrorMessage(`保存文件失败: ${err}`);
        }
    }

    private handleStop() {
        if (this._currentController) {
            this._currentController.abort();
            this._currentController = null;
            this._view?.webview.postMessage({ type: 'stopGenerating' });
        }
    }

    private clearMessages() {
        this._messages = [];
        this._view?.webview.postMessage({ type: 'cleared' });
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Assistant</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: var(--vscode-panel-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .header-title {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--vscode-foreground);
                }
                .header-actions {
                    display: flex;
                    gap: 4px;
                }
                .header-btn {
                    background: none;
                    border: none;
                    color: #cccccc;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 32px;
                    height: 32px;
                    marigin-left: -10px;
                }
                .header-btn:hover {
                    background: #3e3e42;
                    color: #ffffff;
                }
                .history-panel {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: var(--vscode-dropdown-background);
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 4px;
                    max-height: 300px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                }
                .history-item {
                    padding: 12px;
                    border-bottom: 1px solid var(--vscode-menu-separatorBackground);
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                    display: flex;
                    // flex-direction: column;
                    justify-content: space-between;
                    // gap: 4px;
                }
                .history-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .history-item:last-child {
                    border-bottom: none;
                }
                .history-title {
                    font-size: 13px;
                    color: var(--vscode-foreground);
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .history-time {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                .history-preview {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-top: 2px;
                }
                .history-delete-btn {
                    background: none;
                    border: none;
                    color: white;
                }
                .history-header {
                    padding: 8px 12px;
                    background: var(--vscode-panel-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .history-title-header {
                    font-size: 12px;
                    color: var(--vscode-foreground);
                    font-weight: 500;
                }
                .history-close {
                    background: none;
                    border: none;
                    color: var(--vscode-descriptionForeground);
                    cursor: pointer;
                    font-size: 14px;
                    padding: 2px;
                    border-radius: 2px;
                }
                .history-close:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .messages {
                    flex: 1;
                    overflow-y: auto;
                    margin-bottom: 10px;
                    padding: 4px;
                }
                .message {
                    margin: 8px 0;
                    padding: 8px;
                    border-radius: 6px;
                    word-wrap: break-word;
                }
                .user {
                    background: rgba(0, 120, 215, 0.1);
                    border-left: 3px solid #0078d4;
                }
                .assistant {
                    background: rgba(40, 40, 40, 0.3);
                    border-left: 3px solid #666;
                }
                .input-section {
                    border-top: 1px solid var(--vscode-panel-border);
                    padding-top: 8px;
                }
                .context-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 8px;
                }
                .context-btn {
                    background: #2d2d30;
                    border: 1px solid #3e3e42;
                    color: #cccccc;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 6px 12px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .context-btn:hover {
                    background: #37373d;
                    border-color: #007acc;
                    color: #ffffff;
                }
                .context-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    margin-bottom: 8px;
                    min-height: 0;
                }
                .context-tag {
                    display: flex;
                    align-items: center;
                    background: #0078d4;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 12px;
                    font-size: 11px;
                    gap: 4px;
                    max-width: 150px;
                }
                .context-tag.file {
                    background: #0078d4;
                }
                .context-tag.image {
                    background: #8a2be2;
                }
                .context-tag-text {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    flex: 1;
                }
                .context-tag-remove {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 0 2px;
                    opacity: 0.8;
                }
                .context-tag-remove:hover {
                    opacity: 1;
                }
                .file-panel {
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    right: 0;
                    background: var(--vscode-dropdown-background);
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 4px;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                }
                .file-item {
                    padding: 6px 12px;
                    cursor: pointer;
                    border-bottom: 1px solid var(--vscode-menu-separatorBackground);
                }
                .file-item:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .input-area {
                    position: relative;
                }
                textarea {
                    width: 100%;
                    min-height: 60px;
                    max-height: 120px;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: var(--vscode-font-family);
                    resize: vertical;
                    outline: none;
                    box-sizing: border-box;
                }
                textarea:focus {
                    border-color: var(--vscode-focusBorder);
                }
                .input-hints {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 4px;
                    padding: 0 4px;
                    font-size: 12px;
                    color: #999;
                }
                .placeholder-text {
                    color: #999;
                }
                .keyboard-hint {
                    color: #999;
                }
                .right-hints {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .config-btn {
                    background: none;
                    border: none;
                    color: #999;
                    cursor: pointer;
                    font-size: 14px;
                    padding: 2px;
                    border-radius: 3px;
                    transition: color 0.2s ease;
                }
                .config-btn:hover {
                    color: #0078d4;
                }
                .loading-indicator {
                    display: none;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background: var(--vscode-panel-background);
                    border: 1px solid #0078d4;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    font-size: 12px;
                    color: var(--vscode-foreground);
                    position: absolute;
                    top: -50px;
                    left: 0;
                    right: 0;
                    z-index: 1000;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #333;
                    border-top: 2px solid #0078d4;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .cancel-btn {
                    background: #ff6b6b;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 3px;
                    margin-left: auto;
                }
                .cancel-btn:hover {
                    background: #e55a5a;
                }
                .input-wrapper {
                    position: relative;
                }
                .input-buttons {
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .send-btn, .pause-btn {
                    background: #333; // 深色背景
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 15px;
                    padding: 6px;
                    border-radius: 50%; // 圆形按钮
                    transition: all 0.2s ease;
                    width: 25px;
                    height: 25px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .send-btn::before {
                    content: '⬆'; // 简单箭头图标
                }

                .pause-btn::before {
                    content: '■'; // 简单正方形图标
                }

                .send-btn:hover {
                    background: #555; // 悬停时稍微亮一点
                }

                .pause-btn:hover {
                    background: #555; // 悬停时稍微亮一点
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-title">AI Assistant</div>
                    <div class="header-actions">
                        <button id="new-chat-btn" class="header-btn" title="新对话">💬</button>
                        <button id="history-btn" class="header-btn" title="历史记录">🕒</button>
                        <button id="config-btn" class="header-btn" title="设置">⚙️</button>
                    </div>
                </div>
                <div class="messages" id="messages"></div>
                
                <div class="input-section">
                    <div id="loading-indicator" class="loading-indicator" style="display: none;">
                        <div class="spinner"></div>
                        <span>正在生成回复...</span>
                        <button id="cancel-btn" class="cancel-btn">取消</button>
                    </div>
                    <div class="context-actions">
                        <button class="context-btn" id="context-btn">
                            ➕ 添加上下文
                        </button>
                    </div>
                    
                    <div class="context-tags" id="context-tags"></div>
                    
                    <div class="input-area">
                        <div class="file-panel" id="file-panel"></div>
                        <div class="history-panel" id="history-panel"></div>
                        <div class="input-wrapper">
                            <textarea id="input" placeholder="输入您的问题..." rows="3"></textarea>
                            <div class="input-buttons">
                                <button id="send-btn" class="send-btn" title="发送"></button>
                                <button id="pause-btn" class="pause-btn" title="暂停" style="display: none;"></button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="input-hints">
                        <span class="placeholder-text">to ask, code, and more</span>
                        <div class="right-hints">
                            <span class="keyboard-hint">Shift + ⏎ / Send</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <script nonce="${nonce}">
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // 状态管理
                    let selectedContexts = [];
                    let contextImages = [];
                    let assemblingAssistant = false;
                    let lastAssistantEl = null;
                    let isGenerating = false;
                    
                    // 历史记录管理
                    let chatHistory = JSON.parse(localStorage.getItem('ccdc_chat_history') || '[]');
                    let currentChatId = null;
                    
                    // DOM 元素
                    const messagesEl = document.getElementById('messages');
                    const inputEl = document.getElementById('input');
                    const contextBtn = document.getElementById('context-btn');
                    const contextTags = document.getElementById('context-tags');
                    const filePanel = document.getElementById('file-panel');
                    const historyPanel = document.getElementById('history-panel');
                    const newChatBtn = document.getElementById('new-chat-btn');
                    const historyBtn = document.getElementById('history-btn');
                    const configBtn = document.getElementById('config-btn');
                    const sendBtn = document.getElementById('send-btn');
                    const pauseBtn = document.getElementById('pause-btn');
                    
                    // 历史记录管理函数
                    function saveChatHistory() {
                        localStorage.setItem('ccdc_chat_history', JSON.stringify(chatHistory));
                    }

                    function createNewChat() {
                        currentChatId = Date.now().toString();
                        const newChat = {
                            id: currentChatId,
                            title: '新对话',
                            messages: [],
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };
                        chatHistory.unshift(newChat);
                        saveChatHistory();
                        return newChat;
                    }

                    function updateChatTitle(title) {
                        if (currentChatId) {
                            const chat = chatHistory.find(c => c.id === currentChatId);
                            if (chat) {
                                chat.title = title;
                                chat.updatedAt = new Date().toISOString();
                                saveChatHistory();
                            }
                        }
                    }

                    function addMessageToCurrentChat(role, content) {
                        if (!currentChatId) {
                            createNewChat();
                        }
                        const chat = chatHistory.find(c => c.id === currentChatId);
                        if (chat) {
                            chat.messages.push({ role, content, timestamp: new Date().toISOString() });
                            chat.updatedAt = new Date().toISOString();
                            saveChatHistory();
                        }
                    }

                    function renderHistoryPanel() {
                        if (!historyPanel) return;
                        
                        let html = '<div class="history-header">' +
                            '<span class="history-title-header">历史对话</span>' +
                            '<button class="history-close" id="history-close">✕</button>' +
                            '</div>';
                        
                        // 过滤掉没有消息的对话
                        const validChats = chatHistory.filter(chat => chat.messages && chat.messages.length > 0);
                        
                        if (validChats.length === 0) {
                            html += '<div class="history-item" style="text-align: center; color: #999; padding: 20px;">暂无历史对话</div>';
                        } else {
                            validChats.forEach(chat => {
                                const time = new Date(chat.updatedAt).toLocaleString('zh-CN');
                                const preview = chat.messages[0].content.substring(0, 50) + (chat.messages[0].content.length > 50 ? '...' : '');
                                html += '<div class="history-item" data-chat-id="' + chat.id + '">' +
                                    '<div class="history-content">' +
                                        '<div class="history-title">' + chat.title + '</div>' +
                                        '<div class="history-time">' + time + '</div>' +
                                        // '<div class="history-preview">' + preview + '</div>' +
                                    '</div>' +
                                    '<button class="history-delete-btn" data-chat-id="' + chat.id + '" title="删除对话">✕</button>' +
                                    '</div>';
                            });
                        }
                        
                        historyPanel.innerHTML = html;
                    }

                    function loadChat(chatId) {
                        const chat = chatHistory.find(c => c.id === chatId);
                        if (chat) {
                            currentChatId = chatId;
                            messagesEl.innerHTML = '';
                            chat.messages.forEach(msg => {
                                addMessage(msg.role, msg.content);
                            });
                            messagesEl.scrollTop = messagesEl.scrollHeight;
                        }
                    }
                    
                    // 删除聊天记录
                    function deleteChat(chatId) {
                        const index = chatHistory.findIndex(c => c.id === chatId);
                        if (index !== -1) {
                            chatHistory.splice(index, 1);
                            saveChatHistory();
                            // 如果删除的是当前聊天，清空显示
                            if (currentChatId === chatId) {
                                currentChatId = null;
                                messagesEl.innerHTML = '';
                            }
                            // 重新渲染历史面板
                            renderHistoryPanel();
                        }
                    }
                    
                    // 控制按钮显示状态
                    function showLoading() {
                        if (sendBtn) {
                            sendBtn.style.display = 'none';
                        }
                        if (pauseBtn) {
                            pauseBtn.style.display = 'flex';
                        }
                        // 显示加载指示器
                        const loadingEl = document.getElementById('loading-indicator');
                        if (loadingEl) {
                            loadingEl.style.display = 'flex';
                        }
                        isGenerating = true;
                    }
                    
                    function hideLoading() {
                        if (sendBtn) {
                            sendBtn.style.display = 'flex';
                        }
                        if (pauseBtn) {
                            pauseBtn.style.display = 'none';
                        }
                        // 隐藏加载指示器
                        const loadingEl = document.getElementById('loading-indicator');
                        if (loadingEl) {
                            loadingEl.style.display = 'none';
                        }
                        isGenerating = false;
                    }
                    
                    // 渲染上下文标签
                    function renderContextTags() {
                        contextTags.innerHTML = '';
                        
                        // 渲染文件标签
                        selectedContexts.forEach((ctx, index) => {
                            const tag = document.createElement('div');
                            tag.className = 'context-tag file';
                            tag.innerHTML = '<span class="context-tag-icon">📄</span>' +
                                '<span class="context-tag-text">' + (ctx.fileName || 'Untitled') + '</span>' +
                                '<button class="context-tag-remove" data-index="' + index + '" data-type="file">×</button>';
                            contextTags.appendChild(tag);
                        });
                        
                        // 渲染图片标签
                        contextImages.forEach((img, index) => {
                            const tag = document.createElement('div');
                            tag.className = 'context-tag image';
                            tag.innerHTML = '<span class="context-tag-icon">🖼️</span>' +
                                '<span class="context-tag-text">' + (img.name || 'image.png') + '</span>' +
                                '<button class="context-tag-remove" data-index="' + index + '" data-type="image">×</button>';
                            contextTags.appendChild(tag);
                        });
                    }
                    
                    // 添加消息到聊天区域
                    function addMessage(type, text) {
                        const messageEl = document.createElement('div');
                        messageEl.className = 'message ' + type;
                        messageEl.textContent = text;
                        messagesEl.appendChild(messageEl);
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                        return messageEl;
                    }
                    
                    // 发送消息
                    function sendMessage() {
                        // 检查是否正在生成
                        if (isGenerating) {
                            return; // 如果正在生成，直接返回，不允许重复发送
                        }
                        
                        let text = inputEl.value.trim();
                        
                        // 检查是否有选中的文件内容
                        let fileContent = null;
                        let fileName = null;
                        let displayText = text; // 前端显示的文本
                        
                        console.log('ChatViewProvider: 检查上下文:', {
                            selectedContexts: selectedContexts,
                            hasContent: selectedContexts.some(ctx => ctx.content),
                            selectedContextsLength: selectedContexts.length
                        });
                        
                        if (selectedContexts.length > 0) {
                            const fileContext = selectedContexts.find(ctx => ctx.contextType === 'file' && ctx.content);
                            if (fileContext) {
                                fileContent = fileContext.content;
                                fileName = fileContext.fileName;
                                // 在前端显示简洁的提示信息
                                displayText = '[📄 包含文件: ' + fileName + '] ' + text;
                                
                                console.log('ChatViewProvider: 找到文件内容:', {
                                    fileName: fileName,
                                    contentLength: fileContent.length,
                                    contentPreview: fileContent.substring(0, 50) + '...'
                                });
                            } else {
                                console.log('ChatViewProvider: 未找到文件内容:', {
                                    selectedContexts: selectedContexts
                                });
                            }
                        }
                        
                        // 如果没有文本内容也没有文件内容，则不发送
                        if (!text && !fileContent) {
                            console.log('ChatViewProvider: 既无文本也无文件内容，取消发送');
                            return;
                        }
                        
                        // 如果没有当前聊天，创建一个新的
                        if (!currentChatId) {
                            createNewChat();
                        }
                        
                        // 保存用户消息到历史记录
                        addMessageToCurrentChat('user', displayText);
                        
                        // 更新聊天标题（使用第一条用户消息）
                        if (chatHistory.find(c => c.id === currentChatId)?.messages.length === 1) {
                            const title = text.length > 20 ? text.substring(0, 20) + '...' : text;
                            updateChatTitle(title);
                        }
                        
                        inputEl.value = '';
                        showLoading(); // 显示加载状态
                        
                        console.log('ChatViewProvider: 最终发送的消息:', {
                            text: text,
                            displayText: displayText,
                            fileName: fileName,
                            hasFileContent: !!fileContent,
                            fileContentLength: fileContent ? fileContent.length : 0
                        });
                        
                        vscode.postMessage({ 
                            type: 'send', 
                            text: text, // 原始用户问题
                            displayText: displayText, // 前端显示的文本
                            fileContent: fileContent,
                            fileName: fileName
                        });
                    }
                    
                    // 添加保存按钮
                    function addSaveButtonToLastMessage() {
                        if (lastAssistantEl) {
                            const oldSaveBtn = document.getElementById('save');
                            if (oldSaveBtn) {
                                oldSaveBtn.remove();
                            }
                            
                            const saveBtn = document.createElement('button');
                            saveBtn.id = 'save';
                            saveBtn.textContent = '保存到文件';
                            saveBtn.style.cssText = 'position: relative; float: right; margin-top: 8px; padding: 4px 8px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;';
                            
                            saveBtn.addEventListener('click', () => {
                                vscode.postMessage({ type: 'saveToFile', text: lastAssistantEl.textContent || '' });
                            });
                            
                            lastAssistantEl.insertAdjacentElement('afterend', saveBtn);
                        }
                    }
                    
                    // 事件监听器
                    contextBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'addContext' });
                    });
                    
                    // 新对话按钮事件
                    if (newChatBtn) {
                        newChatBtn.addEventListener('click', () => {
                            // 清空当前消息显示
                            messagesEl.innerHTML = '';
                            // 创建新聊天
                            createNewChat();
                            // 隐藏历史面板
                            if (historyPanel) {
                                historyPanel.style.display = 'none';
                            }
                        });
                    }
                    
                    // 历史记录按钮事件
                    if (historyBtn && historyPanel) {
                        historyBtn.addEventListener('click', () => {
                            if (historyPanel.style.display === 'none' || !historyPanel.style.display) {
                                renderHistoryPanel();
                                historyPanel.style.display = 'block';
                            } else {
                                historyPanel.style.display = 'none';
                            }
                        });
                    }
                    
                    // 配置按钮事件
                    configBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'openConfig' });
                    });
                    
                    // 发送按钮事件
                    if (sendBtn) {
                        sendBtn.addEventListener('click', () => {
                            sendMessage();
                        });
                    }
                    
                    // 暂停按钮事件
                    if (pauseBtn) {
                        pauseBtn.addEventListener('click', () => {
                            if (isGenerating) {
                                vscode.postMessage({ type: 'stop' });
                                hideLoading();
                            }
                        });
                    }
                    
                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    });
                    
                    // 使用事件委托处理标签删除
                    contextTags.addEventListener('click', (e) => {
                        if (e.target.classList.contains('context-tag-remove')) {
                            const index = parseInt(e.target.dataset.index);
                            const type = e.target.dataset.type;
                            vscode.postMessage({ 
                                type: 'removeContext', 
                                index, 
                                contextType: type 
                            });
                        }
                    });
                    
                    // 图片粘贴功能
                    document.addEventListener('paste', (e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        
                        for (let item of items) {
                            if (item.type.startsWith('image/')) {
                                e.preventDefault();
                                const file = item.getAsFile();
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (event) => {
                                        vscode.postMessage({
                                            type: 'addImage',
                                            imageData: event.target.result,
                                            imageName: file.name || 'pasted-image.png'
                                        });
                                    };
                                    reader.readAsDataURL(file);
                                }
                                break;
                            }
                        }
                    });
                    
                    // 处理来自扩展的消息
                    window.addEventListener('message', (event) => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'showContextPanel':
                                showContextPanel(message.contextItems);
                                break;
                            case 'contextSelected':
                                console.log('ChatViewProvider: 收到contextSelected消息', message);
                                selectedContexts.push(message);
                                renderContextTags();
                                hideFilePanel();
                                console.log('ChatViewProvider: 更新后的selectedContexts', selectedContexts);
                                break;
                            case 'contextRemoved':
                                if (message.contextType === 'file') {
                                    selectedContexts.splice(message.index, 1);
                                } else if (message.contextType === 'image') {
                                    contextImages.splice(message.index, 1);
                                }
                                renderContextTags();
                                break;
                            case 'imageAdded':
                                contextImages.push({
                                    data: message.imageData,
                                    name: message.imageName
                                });
                                renderContextTags();
                                break;
                            case 'appendUser':
                                addMessage('user', message.text);
                                lastAssistantEl = addMessage('assistant', '');
                                assemblingAssistant = true;
                                break;
                            case 'appendAssistantChunk':
                                if (assemblingAssistant && lastAssistantEl) {
                                    lastAssistantEl.textContent = (lastAssistantEl.textContent || '') + (message.text || '');
                                    messagesEl.scrollTop = messagesEl.scrollHeight;
                                }
                                break;
                            case 'finalizeAssistant':
                                assemblingAssistant = false;
                                addSaveButtonToLastMessage();
                                hideLoading(); // 隐藏加载状态
                                // 保存助手消息到历史记录
                                if (lastAssistantEl) {
                                    addMessageToCurrentChat('assistant', lastAssistantEl.textContent || '');
                                }
                                break;
                            case 'appendAssistant':
                                addMessage('assistant', message.text);
                                break;
                            case 'error':
                                addMessage('system', String(message.text || 'Error'));
                                hideLoading(); // 隐藏加载状态
                                break;
                            case 'cleared':
                                messagesEl.innerHTML = '';
                                selectedContexts = [];
                                contextImages = [];
                                renderContextTags();
                                lastAssistantEl = null;
                                assemblingAssistant = false;
                                break;
                        }
                    });
                    
                    function showContextPanel(contextItems) {
                        const items = contextItems[0]?.items || [];
                        filePanel.innerHTML = items.map(item => 
                            '<div class="file-item" data-path="' + item.description + '" data-name="' + item.label + '">' +
                                '📄 ' + item.label +
                             '</div>'
                        ).join('');
                        
                        // 为每个文件项添加点击事件
                        filePanel.querySelectorAll('.file-item').forEach(item => {
                            item.addEventListener('click', () => {
                                console.log('ChatViewProvider: 点击文件', {
                                    fileName: item.dataset.name,
                                    filePath: item.dataset.path
                                });
                                vscode.postMessage({
                                    type: 'selectContext',
                                    contextType: 'file',
                                    filePath: item.dataset.path,
                                    fileName: item.dataset.name
                                });
                                hideFilePanel();
                            });
                        });
                        
                        filePanel.style.display = 'block';
                    }
                    
                    function hideFilePanel() {
                        filePanel.style.display = 'none';
                    }
                    
                    // 点击其他地方时隐藏文件面板和历史面板
                    document.addEventListener('click', (e) => {
                        if (!contextBtn.contains(e.target) && !filePanel.contains(e.target)) {
                            hideFilePanel();
                        }
                        if (historyBtn && historyPanel && 
                            !historyBtn.contains(e.target) && 
                            !historyPanel.contains(e.target)) {
                            historyPanel.style.display = 'none';
                        }
                    });
                    
                    // 历史记录面板点击事件处理
                    if (historyPanel) {
                        historyPanel.addEventListener('click', (event) => {
                            const target = event.target;
                            const historyItem = target.closest('.history-item');
                            const historyClose = target.closest('#history-close');
                            const deleteBtn = target.closest('.history-delete-btn');
                            
                            if (historyClose) {
                                historyPanel.style.display = 'none';
                            } else if (deleteBtn) {
                                event.stopPropagation(); // 阻止事件冒泡
                                event.preventDefault(); // 阻止默认行为
                                const chatId = deleteBtn.dataset.chatId;
                                console.log('ChatViewProvider 删除按钮被点击，chatId:', chatId);
                                if (chatId) {
                                    deleteChat(chatId);
                                }
                            } else if (historyItem) {
                                const chatId = historyItem.dataset.chatId;
                                if (chatId) {
                                    loadChat(chatId);
                                    historyPanel.style.display = 'none';
                                }
                            }
                        });
                    }
                })();
            </script>
        </body>
        </html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}

