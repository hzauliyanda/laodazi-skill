/**
 * 老达子风格润色器 - 文件读写辅助脚本
 * 使用 Buffer + TextDecoder/TextEncoder 确保 UTF-8 编码正确处理中文内容和中文符号
 * 写入时自动将 ASCII 直引号转换为中文弯引号
 */
import { readFileSync, writeFileSync } from 'fs';

/**
 * 安全读取文件内容（使用 Buffer + TextDecoder）
 */
function readFileSafe(filePath: string): string {
  try {
    const buffer = readFileSync(filePath);
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    return decoder.decode(buffer);
  } catch (error) {
    console.error('读取文件失败:', error);
    throw error;
  }
}

/**
 * 将 ASCII 直引号转换为中文弯引号（配对转换）
 * 处理逻辑：
 * - 跳过代码块（```包裹的内容）
 * - 跳过 HTML 标签内的属性引号
 * - 跳过 HTML 注释
 * - 其余的 " 按出现顺序配对为 ""
 */
function normalizeQuotes(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // 跳过代码块
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // 跳过 HTML 注释行
    if (line.trim().startsWith('<!--')) {
      result.push(line);
      continue;
    }

    // 处理普通行：将不在 HTML 标签属性中的 " 配对转换为 ""
    let newLine = '';
    let isLeft = true;
    let i = 0;

    while (i < line.length) {
      // 跳过 markdown 图片链接 ![...](...)
      if (line[i] === '!' && line[i + 1] === '[') {
        const closeBracket = line.indexOf(']', i + 2);
        if (closeBracket !== -1) {
          newLine += line.substring(i, closeBracket + 1);
          i = closeBracket + 1;
          continue;
        }
      }

      // 跳过 markdown 链接 [...](...)
      if (line[i] === '[') {
        const closeBracket = line.indexOf(']', i + 1);
        if (closeBracket !== -1 && line[closeBracket + 1] === '(') {
          const closeParen = line.indexOf(')', closeBracket + 2);
          if (closeParen !== -1) {
            newLine += line.substring(i, closeParen + 1);
            i = closeParen + 1;
            continue;
          }
        }
      }

      // 跳过 HTML 标签
      if (line[i] === '<') {
        const closeTag = line.indexOf('>', i + 1);
        if (closeTag !== -1) {
          newLine += line.substring(i, closeTag + 1);
          i = closeTag + 1;
          continue;
        }
      }

      // 转换 ASCII 直引号
      if (line[i] === '"') {
        newLine += isLeft ? '\u201c' : '\u201d';
        isLeft = !isLeft;
        i++;
        continue;
      }

      newLine += line[i];
      i++;
    }

    result.push(newLine);
  }

  return result.join('\n');
}

/**
 * 安全写入文件内容（使用 TextEncoder + Buffer）
 * 自动将 ASCII 直引号转换为中文弯引号
 */
function writeFileSafe(filePath: string, content: string): void {
  try {
    // 先修复引号
    const fixed = normalizeQuotes(content);

    // 统计修复数量
    const asciiBefore = (content.match(/"/g) || []).length;
    const leftAfter = (fixed.match(/\u201c/g) || []).length;
    const rightAfter = (fixed.match(/\u201d/g) || []).length;
    const totalFixed = leftAfter + rightAfter - ((content.match(/\u201c/g) || []).length + (content.match(/\u201d/g) || []).length);

    if (totalFixed > 0) {
      console.log(`引号修复: ${totalFixed} 个 ASCII 直引号 → ${leftAfter} 个 " + ${rightAfter} 个 "`);
    }

    const encoder = new TextEncoder();
    const buffer = encoder.encode(fixed);
    writeFileSync(filePath, Buffer.from(buffer));
    console.log('文件写入成功:', filePath);
  } catch (error) {
    console.error('写入文件失败:', error);
    throw error;
  }
}

// CLI 用法:
// 读取: bun run scripts/polish.ts read <文件路径>
// 写入: cat <<'HEREDOC' | bun run scripts/polish.ts write <文件路径>
const args = process.argv.slice(2);
const command = args[0];

if (!command || !['read', 'write'].includes(command)) {
  console.log('用法:');
  console.log('  读取文件: bun run scripts/polish.ts read <文件路径>');
  console.log('  写入文件: cat <<\'HEREDOC\' | bun run scripts/polish.ts write <文件路径>');
  process.exit(1);
}

if (command === 'read') {
  const filePath = args[1];
  if (!filePath) {
    console.error('错误: 请指定文件路径');
    process.exit(1);
  }
  const content = readFileSafe(filePath);
  console.log(content);
}

if (command === 'write') {
  const filePath = args[1];
  if (!filePath) {
    console.error('错误: 请指定文件路径');
    process.exit(1);
  }
  // 从 stdin 读取内容
  const chunks: Buffer[] = [];
  process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const content = Buffer.concat(chunks).toString('utf-8');
    writeFileSafe(filePath, content);
  });
}
