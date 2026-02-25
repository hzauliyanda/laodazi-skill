#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownForMultiPlatform } from '../shared/markdown-parser.js';
import { NeteaseAdapter } from '../platforms/netease-adapter.js';
import type { PublishOptions } from '../shared/types.js';

function printUsage(): never {
  console.log(`
Publish article to Netease (网易号)

Usage:
  npx -y bun publish-netease.ts <markdown_file> [options]

Options:
  --submit          Submit for publication (default: preview mode)
  --profile <path>  Custom Chrome profile directory
  --help            Show this help

Examples:
  # Preview mode (create as draft)
  npx -y bun publish-netease.ts article.md

  # Submit for publication
  npx -y bun publish-netease.ts article.md --submit
`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
  }

  let markdownPath: string | undefined;
  const options: PublishOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--submit') {
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
    // Parse markdown
    console.log('[publish-netease] Parsing markdown file...');
    const markdown = await parseMarkdownForMultiPlatform(markdownPath);
    console.log(`[publish-netease] Title: ${markdown.title}`);
    console.log(`[publish-netease] Images: ${markdown.contentImages.length}`);

    // Initialize adapter
    const adapter = new NeteaseAdapter();
    await adapter.initialize(options);

    try {
      // Publish
      const result = await adapter.publish(markdown, options);

      if (result.success) {
        if (result.preview) {
          console.log('[publish-netease] ✓ Article created as draft/preview');
        } else {
          console.log('[publish-netease] ✓ Article published successfully');
        }
      } else {
        console.error(`[publish-netease] ✗ Failed: ${result.error}`);
        process.exit(1);
      }
    } finally {
      await adapter.cleanup();
    }
  } catch (error) {
    console.error(`[publish-netease] Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

await main();
