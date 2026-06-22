#!/usr/bin/env bun
/**
 * 视频口播稿生成器
 * 将Markdown文章转换为视频口播稿，并生成爆款标题
 */

import fs from 'node:fs';
import path from 'node:path';

interface VideoCopywritingConfig {
  wordCount?: number;
  titleCount?: number;
  titleLength?: number;
  output?: string;
}

/**
 * 从文章中提取关键信息
 */
function extractArticleInfo(content: string): {
  title: string;
  summary: string;
  keyPoints: string[];
} {
  const lines = content.split('\n');

  // 提取标题（第一个H1）
  const titleMatch = lines.find(line => line.trim().startsWith('# '));
  const title = titleMatch ? titleMatch.replace(/^#\s*/, '').trim() : '未命名文章';

  // 提取前几段作为摘要
  const paragraphs = lines.filter(line => line.trim() && !line.startsWith('#') && !line.startsWith('>'));
  const summary = paragraphs.slice(0, 3).join('\n').substring(0, 200);

  return {
    title,
    summary,
    keyPoints: paragraphs.slice(0, 5)
  };
}

/**
 * 生成口播稿说明
 */
function generatePrompt(articleInfo: ReturnType<typeof extractArticleInfo>, config: VideoCopywritingConfig): string {
  const wordCount = config.wordCount || 500;
  const titleCount = config.titleCount || 5;
  const titleLength = config.titleLength || 10;

  return `
# 视频口播稿生成任务

## 原文章信息
- **标题**: ${articleInfo.title}
- **摘要**: ${articleInfo.summary}

## 生成要求

### 1. 口播稿（${wordCount}字左右）

**开头钩子（前50-80字）**
- 制造悬念或冲突
- 使用情感化语言
- 抛出核心问题
- 引发观众好奇

**正文（约350字）**
- 口语化表达，避免书面语
- 多用短句，节奏感强
- 使用设问句引导思考
- 情感起伏，扣人心弦
- 层层递进，逻辑清晰

**结尾升华（约50-70字）**
- 回应开头问题
- 升华主题
- 留有余味

### 2. 爆款标题（${titleCount}个，${titleLength}字左右）

标题要求：
- 制造悬念（疑问句、省略号）
- 情感冲击（强烈情感词汇）
- 数字对比（具体数字）
- 反差对比（表面与真相）
- 字数控制：10-12字

## 输出格式

\`\`\`markdown
# [最佳标题]

[口播稿正文]

---

## 5个爆款标题供选择

1. [标题1]
2. [标题2]
3. [标题3]
4. [标题4]
5. [标题5]
\`\`\`

## 注意事项
- 口播稿总字数控制在${wordCount}字左右
- 使用口语化表达
- 多用短句，控制句子长度
- 标题要有吸引力和传播性
`;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
视频口播稿生成器

用法：
  bun run scripts/video-copywriting.ts <文章路径.md> [选项]

选项：
  --word-count <数字>      口播稿字数 (默认: 500)
  --title-count <数字>     标题数量 (默认: 5)
  --title-length <数字>    标题字数 (默认: 10)
  --output <路径>          输出文件路径 (默认: 原文件名-口播稿.md)
  --prompt                 只生成提示词，不生成口播稿

示例：
  bun run scripts/video-copywriting.ts article.md
  bun run scripts/video-copywriting.ts article.md --word-count 600
  bun run scripts/video-copywriting.ts article.md --prompt
    `);
    process.exit(0);
  }

  const filePath = args[0];
  const config: VideoCopywritingConfig = {
    wordCount: 500,
    titleCount: 5,
    titleLength: 10,
  };

  // 解析选项
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--word-count' && args[i + 1]) config.wordCount = parseInt(args[++i]!);
    if (arg === '--title-count' && args[i + 1]) config.titleCount = parseInt(args[++i]!);
    if (arg === '--title-length' && args[i + 1]) config.titleLength = parseInt(args[++i]!);
    if (arg === '--output' && args[i + 1]) config.output = args[++i];
  }

  if (!filePath) {
    console.error('错误：请指定文章路径');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`错误：文件不存在：${filePath}`);
    process.exit(1);
  }

  // 读取文章内容
  const content = fs.readFileSync(filePath, 'utf-8');
  const articleInfo = extractArticleInfo(content);

  // 生成提示词
  const prompt = generatePrompt(articleInfo, config);

  if (args.includes('--prompt')) {
    console.log('========== 生成提示词 ==========\n');
    console.log(prompt);
    console.log('\n========== 提示词结束 ==========');
    return;
  }

  // 保存提示词到临时文件，供AI使用
  const promptFile = filePath.replace(/\.md$/, '-生成提示.txt');
  fs.writeFileSync(promptFile, prompt);

  console.log(`✅ 提示词已生成：${promptFile}`);
  console.log(`\n请将此提示词发送给AI，让AI根据原文章内容生成口播稿。`);
  console.log(`\n原文章：${filePath}`);
  console.log(`文章标题：${articleInfo.title}`);
  console.log(`\n生成要求：`);
  console.log(`- 口播稿字数：${config.wordCount}字左右`);
  console.log(`- 爆款标题数：${config.titleCount}个`);
  console.log(`- 标题字数：${config.titleLength}字左右`);
}

await main().catch(err => {
  console.error(`错误：${err.message}`);
  process.exit(1);
});
