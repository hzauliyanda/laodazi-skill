#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownForMultiPlatform } from '../shared/markdown-parser.js';
import { BaijiahaoAdapter } from '../platforms/baijiahao-adapter.js';
import { ToutiaoAdapter } from '../platforms/toutiao-adapter.js';
import { NeteaseAdapter } from '../platforms/netease-adapter.js';
import type { PublishOptions, PlatformName } from '../shared/types.js';

const ALL_PLATFORMS: PlatformName[] = ['baijiahao', 'toutiao', 'netease'];

function printUsage(): never {
  console.log(`
Publish article to multiple Chinese content platforms

Usage:
  npx -y bun publish-all.ts <markdown_file> [options]

Options:
  --platforms <list> Comma-separated list of platforms (default: all)
                    Available: baijiahao, toutiao, netease
  --submit          Submit for publication (default: preview mode)
  --profile <path>  Custom Chrome profile directory
  --help            Show this help

Examples:
  # Preview to all platforms
  npx -y bun publish-all.ts article.md

  # Submit to specific platforms
  npx -y bun publish-all.ts article.md --platforms baijiahao,toutiao --submit

  # Submit to all platforms
  npx -y bun publish-all.ts article.md --submit
`);
  process.exit(0);
}

function getAdapterClass(platform: PlatformName) {
  switch (platform) {
    case 'baijiahao':
      return BaijiahaoAdapter;
    case 'toutiao':
      return ToutiaoAdapter;
    case 'netease':
      return NeteaseAdapter;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  let markdownPath: string | undefined;
  let platforms: PlatformName[] = [...ALL_PLATFORMS];
  const options: PublishOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--platforms' && args[i + 1]) {
      const platformList = args[++i]!.split(',');
      platforms = platformList
        .map((p) => p.trim().toLowerCase())
        .filter((p): p is PlatformName => ALL_PLATFORMS.includes(p as PlatformName));
      if (platforms.length === 0) {
        console.error('Error: No valid platforms specified');
        process.exit(1);
      }
    } else if (arg === '--submit') {
      options.submit = true;
    } else if (arg === '--profile' && args[i + 1]) {
      options.profileDir = args[++i];
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
    // Parse markdown once
    console.log('[publish-all] Parsing markdown file...');
    const markdown = await parseMarkdownForMultiPlatform(markdownPath);
    console.log(`[publish-all] Title: ${markdown.title}`);
    console.log(`[publish-all] Images: ${markdown.contentImages.length}`);
    console.log(`[publish-all] Target platforms: ${platforms.join(', ')}`);

    const results: Array<{ platform: PlatformName; success: boolean; error?: string; preview?: boolean }> = [];

    // Publish to each platform sequentially
    for (const platform of platforms) {
      console.log(`\n[publish-all] ===== Starting ${platform} =====`);

      const AdapterClass = getAdapterClass(platform);
      const adapter = new AdapterClass();

      try {
        await adapter.initialize(options);

        const result = await adapter.publish(markdown, options);
        results.push(result);

        if (result.success) {
          if (result.preview) {
            console.log(`[publish-all] ✓ ${platform}: Article created as draft/preview`);
          } else {
            console.log(`[publish-all] ✓ ${platform}: Article published successfully`);
          }
        } else {
          console.error(`[publish-all] ✗ ${platform}: ${result.error}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[publish-all] ✗ ${platform}: Unexpected error - ${errorMsg}`);
        results.push({
          platform,
          success: false,
          error: errorMsg,
        });
      } finally {
        await adapter.cleanup();
      }

      console.log(`[publish-all] ===== Finished ${platform} =====\n`);
    }

    // Print summary
    console.log('\n[publish-all] ===== Summary =====');
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      const mode = result.preview ? ' (draft)' : ' (published)';
      const platformName = result.platform.charAt(0).toUpperCase() + result.platform.slice(1);
      console.log(`${status} ${platformName}${mode}: ${result.success ? 'Success' : result.error}`);
    }

    console.log(`\n[publish-all] Total: ${successful.length} successful, ${failed.length} failed`);

    // Exit with error if any failed
    if (failed.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`[publish-all] Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

await main();
