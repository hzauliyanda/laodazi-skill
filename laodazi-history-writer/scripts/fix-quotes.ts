#!/usr/bin/env bun
/**
 * 中文引号修正脚本
 *
 * 使用方法：
 * - 读取模式：bun run scripts/fix-quotes.ts read <文件路径>
 * - 写入模式：bun run scripts/fix-quotes.ts write <文件路径>
 */

import { readFileSync, writeFileSync } from 'fs';

// 使用Unicode转义序列
const CHINESE_QUOTES = {
  LEFT_DOUBLE: '\u201c',   // 左双引号
  RIGHT_DOUBLE: '\u201d',  // 右双引号
  LEFT_SINGLE: '\u2018',   // 左单引号
  RIGHT_SINGLE: '\u2019',  // 右单引号
};

/**
 * 修正文本中的引号 - 智能判断左右引号
 */
function fixQuotes(text: string): string {
  const result: string[] = [];
  let doubleQuoteOpen = false;
  let singleQuoteOpen = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      // 英文双引号替换为中文双引号
      result.push(doubleQuoteOpen ? CHINESE_QUOTES.RIGHT_DOUBLE : CHINESE_QUOTES.LEFT_DOUBLE);
      doubleQuoteOpen = !doubleQuoteOpen;
    } else if (char === "'") {
      // 英文单引号替换为中文单引号
      result.push(singleQuoteOpen ? CHINESE_QUOTES.RIGHT_SINGLE : CHINESE_QUOTES.LEFT_SINGLE);
      singleQuoteOpen = !singleQuoteOpen;
    } else {
      result.push(char);
    }
  }

  return result.join('');
}

/**
 * 读取文件并修正引号
 */
function readFileAndFix(filePath: string): string {
  const buffer = readFileSync(filePath);
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(buffer);
  return fixQuotes(content);
}

/**
 * 将修正后的内容写入文件
 */
function writeFileAndFix(filePath: string): void {
  const buffer = readFileSync(filePath);
  const decoder = new TextDecoder('utf-8');
  const content = decoder.decode(buffer);

  const fixed = fixQuotes(content);

  const encoder = new TextEncoder();
  const encoded = encoder.encode(fixed);
  writeFileSync(filePath, Buffer.from(encoded));
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('使用方法：');
    console.error('  读取模式：bun run scripts/fix-quotes.ts read <文件路径>');
    console.error('  写入模式：bun run scripts/fix-quotes.ts write <文件路径>');
    process.exit(1);
  }

  const mode = args[0];
  const filePath = args[1];

  if (mode === 'read') {
    const content = readFileAndFix(filePath);
    console.log(content);
  } else if (mode === 'write') {
    writeFileAndFix(filePath);
    console.log(`✅ 已修正引号：${filePath}`);
  } else {
    console.error(`❌ 未知模式：${mode}`);
    console.error('支持的模式：read、write');
    process.exit(1);
  }
}

// 运行主函数
main();
