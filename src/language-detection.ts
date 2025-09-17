// 增强的语言检测模块
export function detectLanguageFromCode(code: string): string {
    if (!code || typeof code !== 'string') return 'plaintext';
    
    const trimmedCode = code.trim();
    const lines = trimmedCode.split('\n');
    const firstLine = lines[0]?.trim() || '';
    
    // 语言检测规则，按优先级排序
    const languagePatterns = [
        // Python 检测 - 提高优先级
        {
            language: 'python',
            patterns: [
                /def\s+\w+\s*\(/,
                /import\s+\w+/,
                /from\s+\w+\s+import/,
                /if\s+__name__\s*==\s*['"]__main__['"]/,
                /class\s+\w+.*:/,
                /print\s*\(/,
                /#.*/,
                /""".*"""/,
                /'''.*'''/,
                /self\./,
                /lambda\s+/,
                /return\s+/,
                /:\s*$/,
                /^\s+[a-zA-Z_][a-zA-Z0-9_]*\s*=/
            ],
            keywords: ['def ', 'import ', 'from ', 'if __name__', 'print(', 'class ', 'self.', 'return ', ':', '=']
        },
        
        // Java 检测
        {
            language: 'java',
            patterns: [
                /public\s+class\s+\w+/,
                /import\s+java\./,
                /@Override/,
                /@Component/,
                /@Service/,
                /@Repository/,
                /@Controller/,
                /@RestController/,
                /private\s+\w+\s+\w+;/,
                /public\s+\w+\s+\w+\s*\(/,
                /System\.out\.print/,
                /package\s+\w+/
            ],
            keywords: ['public class', 'import java', '@Override', 'System.out', 'package ']
        },
        
        // C# 检测
        {
            language: 'csharp',
            patterns: [
                /using\s+System/,
                /namespace\s+\w+/,
                /public\s+class\s+\w+/,
                /Console\.WriteLine/,
                /\[.*\]/,
                /get\s*;\s*set\s*;/
            ],
            keywords: ['using System', 'namespace ', 'Console.WriteLine', 'get; set;']
        },
        
        // JavaScript 检测
        {
            language: 'javascript',
            patterns: [
                /function\s+\w+\s*\(/,
                /const\s+\w+\s*=/,
                /let\s+\w+\s*=/,
                /var\s+\w+\s*=/,
                /console\.log/,
                /=>\s*{?/,
                /require\s*\(/,
                /module\.exports/,
                /export\s+/,
                /import\s+.*\s+from/,
                /document\./,
                /window\./,
                /\.addEventListener/,
                /JSON\./
            ],
            keywords: ['function ', 'const ', 'let ', 'var ', 'console.log', '=>', 'require(', 'module.exports']
        },
        
        // TypeScript 检测
        {
            language: 'typescript',
            patterns: [
                /interface\s+\w+/,
                /type\s+\w+\s*=/,
                /:\s*\w+(\[\])?/,
                /:\s*{.*}/,
                /:\s*\(.*\)\s*=>/,
                /enum\s+\w+/,
                /public\s+\w+:/,
                /private\s+\w+:/,
                /protected\s+\w+:/,
                /readonly\s+\w+:/,
                /as\s+\w+/,
                /<.*>/,
                /import\s+.*\s+from/,
                /export\s+interface/,
                /export\s+type/,
                /export\s+enum/
            ],
            keywords: ['interface ', 'type ', 'enum ', 'public ', 'private ', 'protected ', 'readonly ', 'as ']
        },
        
        // Vue 检测
        {
            language: 'vue',
            patterns: [
                /<template/,
                /<script/,
                /<style/,
                /export\s+default/,
                /<div/,
                /<span/,
                /<button/,
                /<input/,
                /<form/,
                /v-if/,
                /v-for/,
                /v-model/,
                /@click/,
                /@input/,
                /:class/,
                /:style/,
                /computed:/,
                /methods:/,
                /data\s*\(\s*\)\s*{/
            ],
            keywords: ['<template', '<script', '<style', 'export default', 'v-if', 'v-for', 'v-model', '@click']
        },
        
        // React 检测
        {
            language: 'jsx',
            patterns: [
                /import\s+React/,
                /from\s+['"]react['"]/,
                /<[A-Z]\w*[^>]*>/,
                /className=/,
                /onClick=/,
                /onChange=/,
                /useState/,
                /useEffect/,
                /useContext/,
                /useReducer/,
                /useMemo/,
                /useCallback/,
                /export\s+default/,
                /const\s+\w+\s*=\s*\(/,
                /return\s*\(/,
                /<Fragment>/
            ],
            keywords: ['import React', 'from "react"', 'className=', 'onClick=', 'useState', 'useEffect']
        },
        
        // HTML 检测
        {
            language: 'html',
            patterns: [
                /<!DOCTYPE\s+html>/i,
                /<html/,
                /<head/,
                /<body/,
                /<div/,
                /<span/,
                /<p/,
                /<h[1-6]/,
                /<a\s+href/,
                /<img\s+src/,
                /<ul/,
                /<ol/,
                /<li/,
                /<table/,
                /<form/,
                /<input/,
                /<button/,
                /<script/,
                /<style/
            ],
            keywords: ['<!DOCTYPE html>', '<html', '<head', '<body', '<div', '<span', '<p', '<h1', '<h2', '<h3']
        },
        
        // CSS 检测
        {
            language: 'css',
            patterns: [
                /\.\w+\s*{/,
                /#\w+\s*{/,
                /@media/,
                /@keyframes/,
                /@import/,
                /:\w+/,
                /::\w+/,
                /margin:/,
                /padding:/,
                /color:/,
                /background:/,
                /font-/,
                /border:/,
                /width:/,
                /height:/,
                /display:/,
                /position:/
            ],
            keywords: ['.', '#', '@media', '@keyframes', 'margin:', 'padding:', 'color:', 'background:']
        },
        
        // SQL 检测
        {
            language: 'sql',
            patterns: [
                /SELECT\s+.*\s+FROM/i,
                /INSERT\s+INTO/i,
                /UPDATE\s+.*\s+SET/i,
                /DELETE\s+FROM/i,
                /CREATE\s+TABLE/i,
                /ALTER\s+TABLE/i,
                /DROP\s+TABLE/i,
                /WHERE\s+/i,
                /ORDER\s+BY/i,
                /GROUP\s+BY/i,
                /HAVING\s+/i,
                /JOIN\s+/i,
                /INNER\s+JOIN/i,
                /LEFT\s+JOIN/i,
                /RIGHT\s+JOIN/i,
                /UNION\s+/i
            ],
            keywords: ['SELECT', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'WHERE', 'ORDER BY']
        },
        
        // Go 检测
        {
            language: 'go',
            patterns: [
                /package\s+\w+/,
                /import\s+\(/,
                /func\s+\w+\s*\(/,
                /var\s+\w+\s+\w+/,
                /const\s+\w+/,
                /type\s+\w+\s+\w+/,
                /interface\s*{/,
                /struct\s*{/,
                /if\s+err\s*!=/,
                /fmt\.Print/,
                /os\./,
                /time\./,
                /sync\./,
                /goroutine/,
                /channel/,
                /defer\s+/
            ],
            keywords: ['package ', 'import (', 'func ', 'var ', 'const ', 'type ', 'interface{', 'struct{']
        },
        
        // Rust 检测
        {
            language: 'rust',
            patterns: [
                /fn\s+\w+\s*\(/,
                /let\s+mut\s+\w+/,
                /let\s+\w+/,
                /use\s+std::/,
                /println!/,
                /vec!\[/,
                /Option::/,
                /Result::/,
                /match\s+/,
                /if\s+let/,
                /while\s+let/,
                /for\s+\w+\s+in/,
                /impl\s+\w+/,
                /trait\s+\w+/,
                /struct\s+\w+/,
                /enum\s+\w+/,
                /mod\s+\w+/
            ],
            keywords: ['fn ', 'let mut', 'let ', 'use std::', 'println!', 'vec![', 'Option::', 'Result::']
        },
        
        // PHP 检测
        {
            language: 'php',
            patterns: [
                /<\?php/,
                /<\?=/,
                /\$\w+/,
                /echo\s+/,
                /print\s+/,
                /function\s+\w+\s*\(/,
                /class\s+\w+/,
                /namespace\s+\w+/,
                /use\s+\w+\\/,
                /public\s+function/,
                /private\s+function/,
                /protected\s+function/,
                /array\s*\(/,
                /\[\s*\]/,
                /->\w+/
            ],
            keywords: ['<?php', '<?=', '$', 'echo ', 'print ', 'function ', 'class ', 'namespace ']
        },
        
        // Ruby 检测
        {
            language: 'ruby',
            patterns: [
                /def\s+\w+/,
                /class\s+\w+/,
                /module\s+\w+/,
                /puts\s+/,
                /p\s+/,
                /require\s+['"]/,
                /@\w+/,
                /@@\w+/,
                /:\w+/,
                /do\s*\|/,
                /end\s*$/,
                /if\s+.*\s+then/,
                /unless\s+/,
                /case\s+/,
                /when\s+/,
                /yield/
            ],
            keywords: ['def ', 'class ', 'module ', 'puts ', 'require ', '@', 'do |', 'end']
        },
        
        // Swift 检测
        {
            language: 'swift',
            patterns: [
                /import\s+Foundation/,
                /import\s+UIKit/,
                /func\s+\w+/,
                /class\s+\w+/,
                /struct\s+\w+/,
                /enum\s+\w+/,
                /protocol\s+\w+/,
                /var\s+\w+/,
                /let\s+\w+/,
                /print\s*\(/,
                /if\s+let/,
                /guard\s+let/,
                /for\s+\w+\s+in/,
                /while\s+/,
                /switch\s+/,
                /case\s+/
            ],
            keywords: ['import Foundation', 'import UIKit', 'func ', 'class ', 'struct ', 'enum ', 'protocol ']
        },
        
        // Kotlin 检测
        {
            language: 'kotlin',
            patterns: [
                /fun\s+\w+/,
                /class\s+\w+/,
                /data\s+class/,
                /object\s+\w+/,
                /interface\s+\w+/,
                /enum\s+class/,
                /val\s+\w+/,
                /var\s+\w+/,
                /println\s*\(/,
                /when\s*\(/,
                /is\s+\w+/,
                /as\s+\w+/,
                /package\s+\w+/,
                /import\s+\w+/,
                /companion\s+object/,
                /sealed\s+class/
            ],
            keywords: ['fun ', 'class ', 'data class', 'object ', 'interface ', 'val ', 'var ', 'println(']
        },
        
        // C/C++ 检测
        {
            language: 'cpp',
            patterns: [
                /#include\s+<.*>/,
                /#include\s+".*"/,
                /int\s+main\s*\(/,
                /printf\s*\(/,
                /cout\s*<</,
                /cin\s*>>/,
                /std::/,
                /namespace\s+\w+/,
                /class\s+\w+/,
                /struct\s+\w+/,
                /template\s*</,
                /#define/,
                /#ifdef/,
                /#ifndef/,
                /#endif/,
                /->/,
                /::/
            ],
            keywords: ['#include', 'int main(', 'printf(', 'cout <<', 'cin >>', 'std::', 'namespace ']
        },
        
        // Shell/Bash 检测
        {
            language: 'bash',
            patterns: [
                /#!\/bin\/bash/,
                /#!\/bin\/sh/,
                /#!\/usr\/bin\/env\s+bash/,
                /echo\s+/,
                /if\s+\[/,
                /then\s*$/,
                /fi\s*$/,
                /for\s+\w+\s+in/,
                /while\s+\[/,
                /do\s*$/,
                /done\s*$/,
                /case\s+\w+\s+in/,
                /esac\s*$/,
                /\$\w+/,
                /export\s+\w+/,
                /source\s+/,
                /\.\s+\w+/
            ],
            keywords: ['#!/bin/bash', '#!/bin/sh', 'echo ', 'if [', 'then', 'fi', 'for ', 'while [']
        },
        
        // JSON 检测
        {
            language: 'json',
            patterns: [
                /^\s*\{/,
                /^\s*\[/,
                /"[\w\s]+"\s*:/,
                /:\s*"[^"]*"/,
                /:\s*\d+/,
                /:\s*true/,
                /:\s*false/,
                /:\s*null/,
                /,\s*$/
            ],
            keywords: ['{', '[', '":', 'true', 'false', 'null']
        },
        
        // YAML 检测
        {
            language: 'yaml',
            patterns: [
                /^\s*\w+:/,
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
                /^\s*false:/
            ],
            keywords: [':', '- ', '#', '---', '...', '&', '*', '|', '>']
        },
        
        // XML 检测
        {
            language: 'xml',
            patterns: [
                /<\?xml/,
                /<[A-Za-z][A-Za-z0-9]*[^>]*>/,
                /<\/[A-Za-z][A-Za-z0-9]*>/,
                /<[A-Za-z][A-Za-z0-9]*\s*\/>/,
                /<!--.*-->/,
                /<!DOCTYPE/,
                /<!\[CDATA\[/,
                /\]\]>/
            ],
            keywords: ['<?xml', '<!DOCTYPE', '<!--', '<![CDATA[']
        },
        
        // Markdown 检测 - 降低优先级，避免误识别代码
        {
            language: 'markdown',
            patterns: [
                /^#\s+/,
                /^##\s+/,
                /^###\s+/,
                /^\*\s+/,
                /^-\s+/,
                /^\+\s+/,
                /^\d+\.\s+/,
                /\[.*\]\(.*\)/,
                /!\[.*\]\(.*\)/,
                /^\s*\|/,
                /^---+$/,
                /^\*\*\*+$/,
                /^___+$/
            ],
            keywords: ['# ', '## ', '### ', '* ', '- ', '+ ', '1. ', '[', '](', '![']
        }
    ];
    
    // 特殊处理：检查代码块标记
    const codeBlockMatch = trimmedCode.match(/```(\w+)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
        const blockLanguage = codeBlockMatch[1];
        const blockContent = codeBlockMatch[2];
        
        if (blockLanguage) {
            // 如果代码块指定了语言，直接返回
            return blockLanguage.toLowerCase();
        } else {
            // 如果代码块没有指定语言，检测代码块内容
            return detectLanguageFromCode(blockContent);
        }
    }
    
    // 特殊处理：检查是否包含代码块但没有完整的三重反引号
    if (trimmedCode.includes('```')) {
        // 提取代码块内容进行检测
        const codeBlockContent = trimmedCode.replace(/```\w*\s*\n?/g, '').replace(/\n?```/g, '');
        if (codeBlockContent.trim()) {
            return detectLanguageFromCode(codeBlockContent);
        }
    }
    
    // 计算每种语言的匹配分数
    const languageScores: { [key: string]: number } = {};
    
    for (const lang of languagePatterns) {
        let score = 0;
        
        // 检查模式匹配
        for (const pattern of lang.patterns) {
            if (pattern.test(trimmedCode)) {
                score += 2; // 模式匹配权重更高
            }
        }
        
        // 检查关键词匹配
        for (const keyword of lang.keywords) {
            const keywordCount = (trimmedCode.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
            score += keywordCount;
        }
        
        // 检查第一行特殊模式（如shebang）
        if (firstLine.match(/^#!/)) {
            if (lang.language === 'bash' && firstLine.includes('bash')) {
                score += 5;
            } else if (lang.language === 'bash' && firstLine.includes('sh')) {
                score += 3;
            }
        }
        
        // 检查代码块标记
        if (trimmedCode.includes('```' + lang.language) || trimmedCode.includes('```' + lang.language.split('_')[0])) {
            score += 3;
        }
        
        if (score > 0) {
            languageScores[lang.language] = score;
        }
    }
    
    // 返回得分最高的语言，如果没有匹配则返回 plaintext
    const sortedLanguages = Object.entries(languageScores)
        .sort(([,a], [,b]) => b - a);
    
    if (sortedLanguages.length > 0 && sortedLanguages[0][1] > 0) {
        return sortedLanguages[0][0];
    }
    
    // 特殊处理：如果代码很短且没有明显特征，尝试基于内容长度判断
    if (trimmedCode.length < 50) {
        // 检查是否包含明显的代码特征
        const hasCodeFeatures = /[{}();]/.test(trimmedCode) || 
                               /[=<>!&|]/.test(trimmedCode) ||
                               /^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[=:]/.test(trimmedCode);
        
        if (hasCodeFeatures) {
            return 'javascript'; // 默认为 JavaScript
        }
    }
    
    return 'plaintext';
}

// 获取语言对应的文件扩展名
export function getFileExtension(language: string): string {
    const extensionMap: { [key: string]: string } = {
        'java': '.java',
        'csharp': '.cs',
        'python': '.py',
        'javascript': '.js',
        'typescript': '.ts',
        'vue': '.vue',
        'jsx': '.jsx',
        'tsx': '.tsx',
        'html': '.html',
        'css': '.css',
        'sql': '.sql',
        'go': '.go',
        'rust': '.rs',
        'php': '.php',
        'ruby': '.rb',
        'swift': '.swift',
        'kotlin': '.kt',
        'cpp': '.cpp',
        'c': '.c',
        'bash': '.sh',
        'shell': '.sh',
        'json': '.json',
        'yaml': '.yml',
        'xml': '.xml',
        'markdown': '.md',
        'plaintext': '.txt'
    };
    
    return extensionMap[language.toLowerCase()] || '.txt';
}
