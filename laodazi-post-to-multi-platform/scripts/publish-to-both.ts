#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

// Import from Baijiahao skill
const BAIJIAHAO_SKILL_DIR = '/Users/liyanda/.claude/skills/laodazi-post-to-baijiahao';
const WECHAT_SKILL_DIR = '/Users/liyanda/.claude/skills/laodazi-post-to-wechat';

function printUsage(): never {
  console.log(`
Publish article to both Baijiahao (百家号) and WeChat Official Account (微信公众号)

Usage:
  npx -y bun publish-to-both.ts <markdown_file> [options]

Options:
  --submit              Submit for publication (default: save as draft)
  --profile <path>      Custom Chrome profile directory (for Baijiahao)
  --cover <path>        Cover image for WeChat draft
  --help                Show this help

Examples:
  # Save as draft on both platforms
  npx -y bun publish-to-both.ts article.md

  # Publish with custom cover
  npx -y bun publish-to-both.ts article.md --cover ./cover.png

Environment:
  WECHAT_APPID          WeChat AppID (required for WeChat API)
  WECHAT_APPSECRET      WeChat AppSecret (required for WeChat API)
`);
  process.exit(0);
}

async function importBaijiahaoModules() {
  const parserModule = await import(BAIJIAHAO_SKILL_DIR + '/scripts/shared/markdown-parser.js');
  const adapterModule = await import(BAIJIAHAO_SKILL_DIR + '/scripts/platforms/baijiahao-adapter.js');
  return {
    parseMarkdownForMultiPlatform: parserModule.parseMarkdownForMultiPlatform,
    BaijiahaoAdapter: adapterModule.BaijiahaoAdapter,
  };
}

function publishToWechatViaApi(markdownPath: string, options: Record<string, string>): boolean {
  const script = path.join(WECHAT_SKILL_DIR, 'scripts/wechat-draft-api.ts');
  const args = [script, '--markdown', markdownPath];

  if (options.cover) {
    args.push('--cover', options.cover);
  }

  console.log('[wechat] Publishing via API...');
  const result = spawnSync('bun', args, {
    stdio: 'inherit',
    timeout: 120_000,
  });

  return result.status === 0;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  let markdownPath: string | undefined;
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--submit') {
      options.submit = 'true';
    } else if (arg === '--profile' && args[i + 1]) {
      options.profileDir = args[++i]!;
    } else if (arg === '--cover' && args[i + 1]) {
      options.cover = args[++i]!;
    } else if (!arg.startsWith('-')) {
      markdownPath = arg;
    }
  }

  if (!markdownPath) {
    console.error('Error: Markdown file path required');
    process.exit(1);
  }

  if (!fs.existsSync(markdownPath)) {
    console.error(`Error: File not found: ${markdownPath}`);
    process.exit(1);
  }

  try {
    // Import modules
    const { parseMarkdownForMultiPlatform, BaijiahaoAdapter } = await importBaijiahaoModules();

    // Parse markdown
    console.log('[multi-platform] Parsing markdown file...');
    const markdown = await parseMarkdownForMultiPlatform(markdownPath);
    console.log(`[multi-platform] Title: ${markdown.title}`);
    console.log(`[multi-platform] Images: ${markdown.contentImages.length}`);

    // ========== BAIJIAHAO (browser automation) ==========
    console.log('\n========== BAIJIAHAO ==========');
    const adapter = new BaijiahaoAdapter();
    let baijiahaoSuccess = false;

    try {
      await adapter.initialize(options);
      const result = await adapter.publish(markdown, options);
      baijiahaoSuccess = result.success;

      if (result.success) {
        console.log(`[baijiahao] ✓ Article ${result.preview ? 'created as draft' : 'published'}`);
      } else {
        console.error(`[baijiahao] ✗ Failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`[baijiahao] Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await adapter.cleanup();
    }

    // ========== WECHAT (API) ==========
    console.log('\n========== WECHAT ==========');
    let wechatSuccess = false;

    try {
      wechatSuccess = publishToWechatViaApi(markdownPath, options);
      if (wechatSuccess) {
        console.log('[wechat] ✓ Draft saved successfully');
      } else {
        console.error('[wechat] ✗ Failed to save draft');
      }
    } catch (error) {
      console.error(`[wechat] Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Summary
    console.log('\n========== SUMMARY ==========');
    console.log(`Baijiahao: ${baijiahaoSuccess ? '✓' : '✗'}`);
    console.log(`WeChat:    ${wechatSuccess ? '✓' : '✗'}`);

    if (!baijiahaoSuccess || !wechatSuccess) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`[multi-platform] Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

await main();
