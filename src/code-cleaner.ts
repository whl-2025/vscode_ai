// 代码清理模块 - 根据VSCode注释规则清理AI回答
export interface CodeBlock {
    language: string;
    code: string;
    startLine: number;
    endLine: number;
}

export interface CleanedCode {
    originalText: string;
    cleanedCode: string;
    language: string;
    hasCodeBlocks: boolean;
    codeBlocks: CodeBlock[];
}

// 不同语言的注释规则
const COMMENT_RULES: { [key: string]: { single: string; multi: { start: string; end: string } } } = {
    'python': {
        single: '# ',
        multi: { start: '"""', end: '"""' }
    },
    'javascript': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'typescript': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'java': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'csharp': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'cpp': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'c': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'go': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'rust': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'php': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'ruby': {
        single: '# ',
        multi: { start: '=begin', end: '=end' }
    },
    'swift': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'kotlin': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'html': {
        single: '<!-- ',
        multi: { start: '<!--', end: '-->' }
    },
    'css': {
        single: '/* ',
        multi: { start: '/*', end: '*/' }
    },
    'sql': {
        single: '-- ',
        multi: { start: '/*', end: '*/' }
    },
    'bash': {
        single: '# ',
        multi: { start: ': <<\'EOF\'', end: 'EOF' }
    },
    'shell': {
        single: '# ',
        multi: { start: ': <<\'EOF\'', end: 'EOF' }
    },
    'yaml': {
        single: '# ',
        multi: { start: '#', end: '#' }
    },
    'xml': {
        single: '<!-- ',
        multi: { start: '<!--', end: '-->' }
    },
    'markdown': {
        single: '<!-- ',
        multi: { start: '<!--', end: '-->' }
    },
    'json': {
        single: '// ',
        multi: { start: '/*', end: '*/' }
    },
    'plaintext': {
        single: '# ',
        multi: { start: '#', end: '#' }
    }
};

/**
 * 清理AI回答，将非代码部分注释掉
 * @param text AI回答的原始文本
 * @param detectedLanguage 检测到的编程语言
 * @returns 清理后的代码
 */
export function cleanAICodeResponse(text: string, detectedLanguage: string): CleanedCode {
    if (!text || typeof text !== 'string') {
        return {
            originalText: text,
            cleanedCode: text,
            language: detectedLanguage,
            hasCodeBlocks: false,
            codeBlocks: []
        };
    }

    const lines = text.split('\n');
    const cleanedLines: string[] = [];
    const commentRule = COMMENT_RULES[detectedLanguage.toLowerCase()] || COMMENT_RULES['plaintext'];
    
    // 跟踪多行字符串状态
    let inMultiLineString = false;
    let multiLineStringType = '';
    let multiLineStringIndent = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // 空行直接保留
        if (!trimmedLine) {
            cleanedLines.push(line);
            continue;
        }

        // 检查是否为代码块标记
        if (trimmedLine.startsWith('```')) {
            const commentedLine = addComment(line, commentRule);
            cleanedLines.push(commentedLine);
            continue;
        }

        // 检查多行字符串的开始和结束
        const multiLineStringMatch = detectMultiLineString(trimmedLine, detectedLanguage);
        if (multiLineStringMatch) {
            if (!inMultiLineString) {
                // 开始多行字符串 - 注释掉开始标记
                inMultiLineString = true;
                multiLineStringType = multiLineStringMatch.type;
                multiLineStringIndent = line.match(/^(\s*)/)?.[1] || '';
                const commentedLine = addComment(line, commentRule);
                cleanedLines.push(commentedLine);
                continue;
            } else if (multiLineStringMatch.isEnd) {
                // 结束多行字符串 - 注释掉结束标记
                inMultiLineString = false;
                multiLineStringType = '';
                multiLineStringIndent = '';
                const commentedLine = addComment(line, commentRule);
                cleanedLines.push(commentedLine);
                continue;
            }
        }

        // 如果在多行字符串内部
        if (inMultiLineString) {
            // 多行字符串内的所有内容都注释掉
            const commentedLine = addComment(line, commentRule);
            cleanedLines.push(commentedLine);
        } else {
            // 不在多行字符串中，正常处理
            const isNonCodeLine = isNonCodeLineSimple(trimmedLine, detectedLanguage);
            if (isNonCodeLine) {
                const commentedLine = addComment(line, commentRule);
                cleanedLines.push(commentedLine);
            } else {
                cleanedLines.push(line);
            }
        }
    }

    return {
        originalText: text,
        cleanedCode: cleanedLines.join('\n'),
        language: detectedLanguage,
        hasCodeBlocks: false,
        codeBlocks: []
    };
}

/**
 * 检测多行字符串的开始和结束
 * @param line 文本行
 * @param language 编程语言
 * @returns 多行字符串信息或null
 */
function detectMultiLineString(line: string, language: string): { type: string; isEnd: boolean } | null {
    const trimmedLine = line.trim();
    
    // Python的三引号字符串
    if (language.toLowerCase() === 'python') {
        // 检查是否包含三引号（开始或结束）
        if (trimmedLine.includes('"""')) {
            if (trimmedLine === '"""') {
                // 纯三引号标记，需要根据上下文判断是开始还是结束
                // 这里我们假设是结束标记，因为通常开始标记会有内容
                return { type: 'triple_quote', isEnd: true };
            }
            if (trimmedLine.startsWith('"""') && trimmedLine.endsWith('"""') && trimmedLine.length > 3) {
                // 单行多行字符串，同时是开始和结束
                return { type: 'triple_quote', isEnd: true };
            }
            if (trimmedLine.startsWith('"""')) {
                return { type: 'triple_quote', isEnd: false };
            }
            if (trimmedLine.endsWith('"""') && !trimmedLine.startsWith('"""')) {
                return { type: 'triple_quote', isEnd: true };
            }
        }
    }
    
    // JavaScript/TypeScript的模板字符串
    if (['javascript', 'typescript'].includes(language.toLowerCase())) {
        if (trimmedLine.startsWith('`') && trimmedLine.endsWith('`') && trimmedLine.length > 1) {
            return { type: 'template', isEnd: true };
        }
        if (trimmedLine.startsWith('`')) {
            return { type: 'template', isEnd: false };
        }
        if (trimmedLine.endsWith('`')) {
            return { type: 'template', isEnd: true };
        }
    }
    
    // 其他语言的多行注释
    if (['java', 'csharp', 'cpp', 'c', 'go'].includes(language.toLowerCase())) {
        if (trimmedLine.startsWith('/*') && trimmedLine.endsWith('*/') && trimmedLine.length > 4) {
            return { type: 'comment', isEnd: true };
        }
        if (trimmedLine.startsWith('/*')) {
            return { type: 'comment', isEnd: false };
        }
        if (trimmedLine.endsWith('*/')) {
            return { type: 'comment', isEnd: true };
        }
    }
    
    return null;
}

// 简化的非代码行判断
function isNonCodeLineSimple(line: string, language: string): boolean {
    // 纯中文描述（不包含代码特征）
    if (/^[^a-zA-Z0-9_#\s]*[\u4e00-\u9fa5][^a-zA-Z0-9_#\s]*$/.test(line)) {
        return true;
    }
    
    // 列表项（数字开头或符号开头）
    if (/^[\d\-\*\+]\s/.test(line)) {
        return true;
    }
    
    // 纯中文标题
    if (/^[^a-zA-Z0-9_#\s]*[\u4e00-\u9fa5][^a-zA-Z0-9_#\s]*[：:]\s*$/.test(line)) {
        return true;
    }
    
    // 纯中文描述后跟冒号
    if (/^[^a-zA-Z0-9_#\s]*[\u4e00-\u9fa5][^a-zA-Z0-9_#\s]*[：:]\s*[^a-zA-Z0-9_#\s]*$/.test(line)) {
        return true;
    }
    
    // 包含中文的描述性文字（即使有英文单词）
    if (/[\u4e00-\u9fa5]/.test(line) && !isCodeLine(line, language)) {
        return true;
    }
    
    return false;
}

/**
 * 判断一行是否为代码行
 * @param line 文本行
 * @param language 编程语言
 * @returns 是否为代码行
 */
function isCodeLine(line: string, language: string): boolean {
    const trimmedLine = line.trim();
    
    // 空行不算代码行
    if (!trimmedLine) return false;
    
    // 根据语言判断代码特征
    switch (language.toLowerCase()) {
        case 'python':
            return isPythonCodeLine(trimmedLine);
        case 'javascript':
        case 'typescript':
            return isJavaScriptCodeLine(trimmedLine);
        case 'java':
        case 'csharp':
            return isJavaCodeLine(trimmedLine);
        case 'html':
            return isHtmlCodeLine(trimmedLine);
        case 'css':
            return isCssCodeLine(trimmedLine);
        case 'sql':
            return isSqlCodeLine(trimmedLine);
        case 'bash':
        case 'shell':
            return isBashCodeLine(trimmedLine);
        case 'yaml':
            return isYamlCodeLine(trimmedLine);
        case 'xml':
            return isXmlCodeLine(trimmedLine);
        case 'json':
            return isJsonCodeLine(trimmedLine);
        default:
            return isGenericCodeLine(trimmedLine);
    }
}

/**
 * Python代码行判断
 */
function isPythonCodeLine(line: string): boolean {
    const trimmedLine = line.trim();
    
    // 空行不算代码行
    if (!trimmedLine) return false;
    
    // Python代码特征
    const codePatterns = [
        /^(def|class|import|from|if|elif|else|for|while|try|except|finally|with|as|return|yield|lambda)\s/,
        /^\s*(def|class|if|elif|else|for|while|try|except|finally|with|as|return|yield|lambda)\s/,
        /^\s+[a-zA-Z_][a-zA-Z0-9_]*\s*[=:]/,
        /^\s*#/,
        /^\s*"""/,
        /^\s*'''/,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /^\s*print\s*\(/,
        /^\s*raise\s/,
        /^\s*assert\s/,
        /^\s*pass\s*$/,
        /^\s*break\s*$/,
        /^\s*continue\s*$/,
        /^\s*del\s/,
        /^\s*global\s/,
        /^\s*nonlocal\s/,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\[/,  // 列表访问
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\./,  // 方法调用
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\+/,  // 运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*-/,   // 运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\*/,  // 运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\//,  // 运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*%/,   // 运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*==/,  // 比较运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*!=/,  // 比较运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*<=/,  // 比较运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*>=/,  // 比较运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*</,   // 比较运算符
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*>/    // 比较运算符
    ];
    
    // 排除明显的非代码行
    const nonCodePatterns = [
        /^[^a-zA-Z_#\s]/,  // 不以字母、下划线、#或空格开头
        /^[a-zA-Z][^a-zA-Z0-9_\s]*$/,  // 纯中文或特殊字符
        /^[0-9]/,  // 以数字开头
        /^[a-zA-Z][^a-zA-Z0-9_\s]*[：:]\s*$/,  // 中文冒号结尾
        /^[a-zA-Z][^a-zA-Z0-9_\s]*[：:]\s*[0-9]/,  // 中文冒号后跟数字
        /^[a-zA-Z][^a-zA-Z0-9_\s]*[：:]\s*[a-zA-Z]/,  // 中文冒号后跟字母
        /^[a-zA-Z][^a-zA-Z0-9_\s]*[：:]\s*[-•·]/,  // 中文冒号后跟列表符号
        /^[a-zA-Z][^a-zA-Z0-9_\s]*[：:]\s*[a-zA-Z][^a-zA-Z0-9_\s]*$/,  // 纯中文描述
        /^[a-zA-Z][^a-zA-Z0-9_\s]*[：:]\s*[a-zA-Z][^a-zA-Z0-9_\s]*[：:]/  // 中文描述后跟冒号
    ];
    
    // 如果是明显的非代码行，直接返回false
    if (nonCodePatterns.some(pattern => pattern.test(line))) {
        return false;
    }
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * JavaScript/TypeScript代码行判断
 */
function isJavaScriptCodeLine(line: string): boolean {
    const codePatterns = [
        /^(function|class|const|let|var|if|else|for|while|do|switch|case|default|try|catch|finally|return|throw|import|export|from|async|await)\s/,
        /^\s*(function|class|const|let|var|if|else|for|while|do|switch|case|default|try|catch|finally|return|throw|import|export|from|async|await)\s/,
        /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[=:]/,
        /^\s*\/\//,
        /^\s*\/\*/,
        /^\s*\*\//,
        /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/,
        /^\s*console\./,
        /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>/,
        /^\s*[{}();]/,
        /^\s*\/\*.*\*\//,
        /^\s*\/\/.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * Java/C#代码行判断
 */
function isJavaCodeLine(line: string): boolean {
    const codePatterns = [
        /^(public|private|protected|static|final|abstract|class|interface|enum|package|import|if|else|for|while|do|switch|case|default|try|catch|finally|return|throw|new|this|super)\s/,
        /^\s*(public|private|protected|static|final|abstract|class|interface|enum|package|import|if|else|for|while|do|switch|case|default|try|catch|finally|return|throw|new|this|super)\s/,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*[=:]/,
        /^\s*\/\//,
        /^\s*\/\*/,
        /^\s*\*\//,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /^\s*System\./,
        /^\s*[{}();]/,
        /^\s*@\w+/,
        /^\s*\/\*.*\*\//,
        /^\s*\/\/.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * HTML代码行判断
 */
function isHtmlCodeLine(line: string): boolean {
    const codePatterns = [
        /^<[a-zA-Z][a-zA-Z0-9]*[^>]*>/,
        /^<\/[a-zA-Z][a-zA-Z0-9]*>/,
        /^<[a-zA-Z][a-zA-Z0-9]*\s*\/>/,
        /^<!DOCTYPE/,
        /^<\?xml/,
        /^<!--/,
        /^-->/,
        /^<!\[CDATA\[/,
        /^\]\]>/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * CSS代码行判断
 */
function isCssCodeLine(line: string): boolean {
    const codePatterns = [
        /^\s*[.#]?[a-zA-Z][a-zA-Z0-9_-]*\s*{/,
        /^\s*@[a-zA-Z-]+/,
        /^\s*[a-zA-Z-]+\s*:/,
        /^\s*[{}();]/,
        /^\s*\/\*/,
        /^\s*\*\//,
        /^\s*\/\*.*\*\//,
        /^\s*\/\/.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * SQL代码行判断
 */
function isSqlCodeLine(line: string): boolean {
    const codePatterns = [
        /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|ROLLBACK|BEGIN|END|IF|ELSE|WHILE|FOR|CASE|WHEN|THEN|ELSE|END|DECLARE|SET|EXEC|EXECUTE)\s/i,
        /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|ROLLBACK|BEGIN|END|IF|ELSE|WHILE|FOR|CASE|WHEN|THEN|ELSE|END|DECLARE|SET|EXEC|EXECUTE)\s/i,
        /^\s*--/,
        /^\s*\/\*/,
        /^\s*\*\//,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=/,
        /^\s*[{}();]/,
        /^\s*\/\*.*\*\//,
        /^\s*--.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * Bash/Shell代码行判断
 */
function isBashCodeLine(line: string): boolean {
    const codePatterns = [
        /^#!/,
        /^(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|alias|declare|local|readonly)\s/,
        /^\s*(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|alias|declare|local|readonly)\s/,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=/,
        /^\s*#/,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /^\s*echo\s/,
        /^\s*printf\s/,
        /^\s*[{}();]/,
        /^\s*#.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * YAML代码行判断
 */
function isYamlCodeLine(line: string): boolean {
    const codePatterns = [
        /^\s*[a-zA-Z_][a-zA-Z0-9_-]*\s*:/,
        /^\s*-\s+/,
        /^\s*#/,
        /^\s*---/,
        /^\s*\.\.\./,
        /^\s*&/,
        /^\s*\*/,
        /^\s*\|/,
        /^\s*>/,
        /^\s*on:/,
        /^\s*off:/,
        /^\s*true:/,
        /^\s*false:/,
        /^\s*#.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * XML代码行判断
 */
function isXmlCodeLine(line: string): boolean {
    const codePatterns = [
        /^<\?xml/,
        /^<[a-zA-Z][a-zA-Z0-9]*[^>]*>/,
        /^<\/[a-zA-Z][a-zA-Z0-9]*>/,
        /^<[a-zA-Z][a-zA-Z0-9]*\s*\/>/,
        /^<!--/,
        /^-->/,
        /^<!DOCTYPE/,
        /^<!\[CDATA\[/,
        /^\]\]>/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * JSON代码行判断
 */
function isJsonCodeLine(line: string): boolean {
    const codePatterns = [
        /^\s*[{}[\]]/,
        /^\s*"[^"]*"\s*:/,
        /^\s*:\s*"[^"]*"/,
        /^\s*:\s*\d+/,
        /^\s*:\s*(true|false|null)/,
        /^\s*,/,
        /^\s*\/\//,
        /^\s*\/\*/,
        /^\s*\*\//,
        /^\s*\/\*.*\*\//,
        /^\s*\/\/.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * 通用代码行判断
 */
function isGenericCodeLine(line: string): boolean {
    const codePatterns = [
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*[=:]/,
        /^\s*[{}();]/,
        /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
        /^\s*\/\//,
        /^\s*#/,
        /^\s*\/\*/,
        /^\s*\*\//,
        /^\s*\/\*.*\*\//,
        /^\s*\/\/.*$/,
        /^\s*#.*$/
    ];
    
    return codePatterns.some(pattern => pattern.test(line));
}

/**
 * 为行添加注释
 * @param line 文本行
 * @param commentRule 注释规则
 * @returns 添加注释后的行
 */
function addComment(line: string, commentRule: { single: string; multi: { start: string; end: string } }): string {
    const trimmedLine = line.trim();
    
    // 空行直接返回
    if (!trimmedLine) return line;
    
    // 如果已经有注释，直接返回
    if (isAlreadyCommented(line, commentRule)) {
        return line;
    }
    
    // 添加单行注释
    const indent = line.match(/^\s*/)?.[0] || '';
    return indent + commentRule.single + trimmedLine;
}

/**
 * 检查行是否已经有注释
 * @param line 文本行
 * @param commentRule 注释规则
 * @returns 是否已有注释
 */
function isAlreadyCommented(line: string, commentRule: { single: string; multi: { start: string; end: string } }): boolean {
    const trimmedLine = line.trim();
    
    // 检查单行注释
    if (commentRule.single && trimmedLine.startsWith(commentRule.single.trim())) {
        return true;
    }
    
    // 检查多行注释开始
    if (commentRule.multi.start && trimmedLine.startsWith(commentRule.multi.start)) {
        return true;
    }
    
    return false;
}

/**
 * 提取纯净的代码（移除所有注释和解释文字）
 * @param text AI回答的原始文本
 * @param detectedLanguage 检测到的编程语言
 * @returns 纯净的代码
 */
export function extractPureCode(text: string, detectedLanguage: string): string {
    const cleaned = cleanAICodeResponse(text, detectedLanguage);
    
    if (cleaned.hasCodeBlocks) {
        // 如果有代码块，提取代码块内容
        return cleaned.codeBlocks.map(block => block.code.trim()).join('\n\n');
    } else {
        // 如果没有代码块，提取未注释的代码行
        const lines = cleaned.cleanedCode.split('\n');
        const codeLines = lines.filter(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return false;
            
            const commentRule = COMMENT_RULES[detectedLanguage.toLowerCase()] || COMMENT_RULES['plaintext'];
            return !isAlreadyCommented(line, commentRule);
        });
        
        return codeLines.join('\n');
    }
}
