#!/usr/bin/env bun
import { parseMarkdownForMultiPlatform } from './scripts/shared/markdown-parser.js';

const result = await parseMarkdownForMultiPlatform('/var/folders/8l/gkdwsfjj5n71ynr34yjrt61m0000gp/T/test-article.md');
console.log('Title:', result.title);
console.log('Content images:', result.contentImages.length);
result.contentImages.forEach(img => console.log('  -', img.placeholder));

const fs = require('node:fs');
const html = fs.readFileSync(result.htmlPath, 'utf-8');
console.log('\nHTML contains IMAGE_PLACEHOLDER:', html.includes('IMAGE_PLACEHOLDER'));
console.log('\nAll placeholders found:');
const matches = html.match(/\[\[IMAGE_PLACEHOLDER_\d+\]\]/g);
console.log(matches || 'None');
console.log('\nFirst 500 chars of HTML:');
console.log(html.slice(0, 500));
