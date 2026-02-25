#!/usr/bin/env bun
/**
 * Markdown文章智能标注器
 * 根据laodazi-history-writer的格式规则自动标注markdown文章
 */

import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * 安全读取文件内容（使用 Buffer + TextDecoder）
 * 确保UTF-8编码正确处理中文内容和中文符号
 */
function readFileSafe(filePath: string): string {
  try {
    // 使用 Buffer 读取原始字节，然后用 TextDecoder 解码
    // 这样可以确保正确处理 UTF-8 编码的中文和中文标点符号
    const buffer = readFileSync(filePath);
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    const content = decoder.decode(buffer);

    return content;
  } catch (error) {
    console.error('读取文件失败:', error);
    throw error;
  }
}

/**
 * 验证文件内容是否正确读取（检查中文编码）
 */
function validateChineseContent(content: string): boolean {
  // 检查是否包含常见的中文字符
  const hasChinese = /[\u4e00-\u9fa5]/.test(content);
  return hasChinese;
}

interface MarkupConfig {
  rule?: 'basic' | 'comprehensive' | 'conservative';
  preview?: boolean;
  colors?: {
    red: string;
    purple: string;  // 替换橙色
    green: string;
    blue: string;
  };
}

interface Sentence {
  text: string;
  type: 'core' | 'question' | 'positive' | 'explanation' | 'normal';
}

/**
 * 分析段落类型
 */
function analyzeParagraph(text: string): 'core' | 'question' | 'positive' | 'explanation' | 'normal' {
  // 关键问题（橙色）
  if (text.includes('？') || text.includes('?') || text.includes('为什么') || text.includes('怎么') || text.includes('难道')) {
    return 'question';
  }

  // 核心观点（红色）
  if (text.includes('不是...而是') || text.includes('本质') || text.includes('核心') || text.includes('关键') || text.includes('真正的')) {
    return 'core';
  }

  // 正面价值（绿色）
  if (text.includes('成功') || text.includes('提升') || text.includes('进步') || text.includes('觉醒') || text.includes('越来越') || text.includes('毒了')) {
    return 'positive';
  }

  // 补充说明（蓝色）
  if (text.includes('这是') || text.includes('这是指') || text.includes('实际上') || text.includes('换句话说') || text.includes('也就是说')) {
    return 'explanation';
  }

  return 'normal';
}

/**
 * 提取文本中的字体大小
 */
function extractFontSize(text: string): string | null {
  // 匹配 font-size: XXpx 或 font-size: XXpt
  const sizeMatch = text.match(/font-size:\s*(\d+(?:\.\d+)?)(px|pt)/i);
  if (sizeMatch) {
    return `${sizeMatch[1]}${sizeMatch[2]}`;
  }
  return null;
}

/**
 * 检测文本中原有的字体大小
 */
function detectOriginalFontSize(text: string): string {
  // 检查是否包含font标签，如果有则提取字体大小
  const fontTagMatch = text.match(/<font[^>]*style="([^"]*)"[^>]*>/);
  if (fontTagMatch) {
    const style = fontTagMatch[1];
    const sizeMatch = style.match(/font-size:\s*(\d+(?:\.\d+)?)(px|pt)/i);
    if (sizeMatch) {
      return `${sizeMatch[1]}${sizeMatch[2]}`;
    }
  }
  return '17px'; // 默认字体大小
}

/**
 * 标注段落（保持字体大小一致）
 */
function markupParagraphText(text: string, type: string, config: MarkupConfig): string {
  const colors = config.colors || {
    red: '#DF2A3F',
    purple: '#9254DE',  // 紫色替换橙色
    green: '#52C41A',
    blue: '#1677FF',
  };

  // 检测原文的字体大小
  const originalFontSize = detectOriginalFontSize(text);

  // 生成标注样式（添加字间距和行高，让文字更舒展）
  const markupStyle = (color: string) =>
    `color:${color};font-size:${originalFontSize};letter-spacing:1px;line-height:1.8;`;

  // 保守模式：只标注核心观点和关键问题，添加加粗
  if (config.rule === 'conservative') {
    if (type === 'core') {
      return `**<font style="${markupStyle(colors.red)}">${text.replace(/<font[^>]*>(.*?)<\/font>/g, '$1')}</font>**`;
    }
    if (type === 'question') {
      return `**<font style="${markupStyle(colors.purple)}">${text.replace(/<font[^>]*>(.*?)<\/font>/g, '$1')}</font>**`;
    }
    return text;
  }

  // 基础模式：只标注，添加加粗
  if (config.rule === 'basic') {
    if (type === 'core' || type === 'question' || type === 'positive') {
      return `**<font style="${markupStyle(colors.red)}">${text.replace(/<font[^>]*>(.*?)<\/font>/g, '$1')}</font>**`;
    }
    return text;
  }

  // 全面模式（默认）：统一使用红色标注，添加加粗
  if (type === 'core' || type === 'question' || type === 'positive' || type === 'explanation') {
    return `**<font style="${markupStyle(colors.red)}">${text.replace(/<font[^>]*>(.*?)<\/font>/g, '$1')}</font>**`;
  }

  // 普通内容：不标注
  return text;
}

/**
 * 标注段落（标记整个段落，而不是段落中的句子）
 * 控制标注比例约5%
 */
function markupParagraph(text: string, config: MarkupConfig): string {
  // 分析整个段落的类型
  const type = analyzeParagraph(text);

  // 调试输出：显示段落内容和分析结果
  console.log('\n=== 分析段落 ===');
  console.log('段落内容:', text);
  console.log('段落长度:', text.length);
  console.log('段落类型:', type);

  // 如果段落太短（少于20字），不标注
  if (text.length < 20) {
    console.log('❌ 段落太短（<20字），不标注');
    return text;
  }

  // 给段落打分
  let score = 0;

  // 根据类型打分
  if (type === 'core') {
    score += 10;
    console.log('✓ 核心观点 +10分');
  }
  if (type === 'question') {
    score += 8;
    console.log('✓ 关键问题 +8分');
  }
  if (type === 'positive') {
    score += 6;
    console.log('✓ 正面价值 +6分');
  }
  if (type === 'explanation') {
    score += 4;
    console.log('✓ 补充说明 +4分');
  }

  // 段落长度适中的优先（50-200字）
  if (text.length >= 50 && text.length <= 200) {
    score += 3;
    console.log('✓ 长度适中(50-200字) +3分');
  }

  // 段落较长的额外加分（100字以上）
  if (text.length >= 100) {
    score += 2;
    console.log('✓ 长段落(100字以上) +2分');
  }

  console.log('总分数:', score);

  // 只有分数达到阈值的段落才标注（调整为3以获得约10-15%的标注比例，更激进）
  const MARKUP_THRESHOLD = 3;

  if (score >= MARKUP_THRESHOLD) {
    console.log('✅ 达到阈值(' + MARKUP_THRESHOLD + ')，进行标注');
    const result = markupParagraphText(text, type, config);
    console.log('标注结果:', result);
    return result;
  }

  console.log('❌ 未达到阈值(' + MARKUP_THRESHOLD + ')，不标注');
  return text;
}

/**
 * 为文本添加统一的字间距和行高样式
 */
function applyBaseStyle(text: string, fontSize: string = '17px'): string {
  // 如果已经有font标签，则不处理
  if (text.includes('<font')) {
    return text;
  }
  // 为普通文本添加基础样式
  return `<font style="font-size:${fontSize};letter-spacing:1px;line-height:1.8;">${text}</font>`;
}

/**
 * 处理markdown文件
 */
async function markupMarkdownFile(filePath: string, config: MarkupConfig): Promise<string> {
  // 使用新的安全读取方式
  let content = readFileSafe(filePath);

  // 验证中文内容
  const hasValidChinese = validateChineseContent(content);

  // DEBUG: 打印读取的原始信息
  console.log('\n========== DEBUG: 文件读取信息 ==========');
  console.log('文件路径:', filePath);
  console.log('读取方式: Buffer + TextDecoder (UTF-8)');
  console.log('内容长度:', content.length, '字节');
  console.log('中文内容验证:', hasValidChinese ? '✓ 通过' : '✗ 失败');

  // 统计中文标点
  const chineseQuotes = (content.match(/[""]/g) || []).length;
  const englishQuotes = (content.match(/["]/g) || []).length;
  const chineseQuestion = (content.match(/[？]/g) || []).length;
  const chineseComma = (content.match(/[，。]/g) || []).length;
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;

  console.log('\n字符统计:');
  console.log('  - 中文字符:', chineseChars);
  console.log('  - 中文引号 (“”):', chineseQuotes);
  console.log('  - 英文引号 ("):', englishQuotes);
  console.log('  - 中文问号 (？):', chineseQuestion);
  console.log('  - 中文逗/句号 (，。):', chineseComma);

  // 显示前200个字符示例
  console.log('\n前200个字符预览:');
  console.log(content.substring(0, Math.min(200, content.length)));
  console.log('========== DEBUG: 信息结束 ==========\n');

  const lines = content.split('\n');
  const result: string[] = [];

  let inCodeBlock = false;
  let inQuoteBlock = false;

  for (const line of lines) {
    // 代码块不处理
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // 引用块不处理
    if (line.trim().startsWith('>')) {
      inQuoteBlock = true;
      result.push(line);
      continue;
    }
    if (inQuoteBlock && line.trim() === '') {
      inQuoteBlock = false;
    }
    if (inQuoteBlock) {
      result.push(line);
      continue;
    }

    // 标题不处理
    if (line.trim().startsWith('#')) {
      result.push(line);
      continue;
    }

    // HTML注释不处理（包括图片注释）
    if (line.trim().startsWith('<!--')) {
      result.push(line);
      continue;
    }
    if (line.includes('-->')) {
      result.push(line);
      continue;
    }

    // 图片不处理
    if (line.includes('![')) {
      result.push(line);
      continue;
    }

    // 空行直接保留
    if (line.trim() === '') {
      result.push(line);
      continue;
    }

    // 处理段落
    let marked = markupParagraph(line, config);

    // 如果该段落没有被标注（没有font标签），则添加基础样式
    if (!marked.includes('<font')) {
      marked = applyBaseStyle(marked);
    }

    result.push(marked);
  }

  return result.join('\n');
}

/**
 * 去除残留的**加粗符号
 */
function cleanupBoldMarkers(text: string): string {
  // 去除所有残留的**标记
  return text.replace(/\*\*/g, '');
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Markdown文章智能标注器

用法：
  bun run markup.ts <文件路径> [选项]

选项：
  --rule <规则>      basic | comprehensive | conservative (默认: comprehensive)
  --preview         预览标注效果，不保存文件
  --no-backup       不创建备份文件

示例：
  bun run markup.ts 文章.md
  bun run markup.ts 文章.md --rule conservative
  bun run markup.ts 文章.md --preview

标注规则：
  红色 (#DF2A3F)：核心观点
  紫色 (#9254DE)：关键问题（替代橙色以避免与标题冲突）
  绿色 (#52C41A)：正面价值
  蓝色 (#1677FF)：补充说明
  标注比例：约5%（非常克制）

  标注策略：
  - 如果标记，标记整个段落，而不是只标记段落中的一句话
  - 标记的段落会同时添加颜色标注和**加粗**格式
  - 只有达到评分阈值的段落才会被标记
  - 段落长度要求：20字以上
  - 评分标准：核心观点(10分) > 关键问题(8分) > 正面价值(6分) > 补充说明(4分)
  - 长度加分：50-200字(+3分)，100字以上(+2分)
  - 标记阈值：8分以上

全局样式优化：
  - 所有文本都会应用统一的字间距（letter-spacing: 1px）
  - 所有文本都会应用统一的行高（line-height: 1.8）
  - 标注文本会额外添加颜色和**加粗**
  - 保持原字体大小

注意：标记的段落会同时应用颜色标注和**加粗**格式
    `);
    process.exit(0);
  }

  const filePath = args[0];
  const config: MarkupConfig = {
    rule: 'comprehensive',
    preview: false,
  };

  // 解析选项
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--rule' && args[i + 1]) config.rule = args[++i] as any;
    if (arg === '--preview') config.preview = true;
    if (arg === '--no-backup') config.preview = true; // 预览模式不需要备份
  }

  if (!filePath) {
    console.error('错误：请指定文件路径');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`错误：文件不存在：${filePath}`);
    process.exit(1);
  }

  console.log(`正在标注文件：${filePath}\n`);

  // 处理文件
  let marked = await markupMarkdownFile(filePath, config);

  // 注意：不再清理**加粗符号，保留加粗格式

  if (config.preview) {
    console.log('===== 标注预览 =====\n');
    console.log(marked);
    console.log('\n===== 预览结束 =====');
    console.log('\n提示：使用 --preview 只预览不保存');
    return;
  }

  // 创建备份
  const backupPath = filePath + '.bak';
  fs.copyFileSync(filePath, backupPath);
  console.log(`已创建备份：${backupPath}\n`);

  // 保存标注后的文件（使用 Buffer + TextEncoder 确保 UTF-8 编码）
  const encoder = new TextEncoder();
  const buffer = encoder.encode(marked);
  fs.writeFileSync(filePath, Buffer.from(buffer));

  console.log(`✅ 标注完成！`);
  console.log(`\n原文件已备份到：${backupPath}`);
  console.log(`标注后文件：${filePath}`);
  console.log(`\n如需恢复，使用备份文件替换即可。`);
}

await main().catch(err => {
  console.error(`错误：${err.message}`);
  process.exit(1);
});
