import fs from 'node:fs';
import path from 'node:path';
import type { ParsedMarkdown } from './types.js';

/**
 * Convert markdown to simple docx format
 * For now, creates a basic docx with plain text
 */
export async function convertMarkdownToDocx(markdown: ParsedMarkdown): Promise<string> {
  // Read the original markdown file to get content
  const articlePath = '/Users/liyanda/Documents/project_code/claudeCode/article/明明是黄巢把大唐锤烂了，为何最后摘取胜利果实的却是朱温？.md';
  const markdownContent = fs.readFileSync(articlePath, 'utf-8');

  // Remove HTML font tags and get plain markdown
  const cleanMarkdown = markdownContent
    .replace(/<font[^>]*>/g, '')
    .replace(/<\/font>/g, '')
    .replace(/\*\*<font[^>]*>([^<]+)<\/font>\*\*/g, '**$1**')
    .replace(/<font[^>]*>([^<]+)<\/font>/g, '$1');

  // Create a simple HTML-based docx (using Office Open XML format)
  // For simplicity, we'll create an HTML file with .doc extension that Word can open
  const htmlContent = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head>
<meta charset="utf-8"/>
<title>${markdown.title}</title>
<style>
body { font-family: "Microsoft YaHei", sans-serif; font-size: 12pt; line-height: 1.8; }
h1 { font-size: 18pt; font-weight: bold; margin: 12pt 0; }
h2 { font-size: 16pt; font-weight: bold; margin: 10pt 0; }
h3 { font-size: 14pt; font-weight: bold; margin: 8pt 0; }
strong { color: #DF2A3F; font-weight: bold; }
p { margin: 6pt 0; }
</style>
</head>
<body>
${markdownToHTML(cleanMarkdown)}
</body>
</html>
`;

  // Save to temp directory
  const os = await import('node:os');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const tempDir = path.join(os.tmpdir(), 'multi-platform-docx');
  await mkdir(tempDir, { recursive: true });

  const docxPath = path.join(tempDir, 'article.doc');
  await writeFile(docxPath, htmlContent, 'utf-8');

  console.log('[md-to-docx] Created DOC file at:', docxPath);
  return docxPath;
}

function markdownToHTML(markdown: string): string {
  let html = markdown;

  // Handle headings
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Handle bold text with color
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Handle blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Handle images - convert to placeholders
  html = html.replace(/!\[([^\]]*)\]\([^)]+\)/g, '<p>[图片: $1]</p>');

  // Handle line breaks and paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in p tags
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p><br><\/p>/g, '');

  return html;
}
