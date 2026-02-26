import fs from 'node:fs';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import type { Frontmatter, ImageInfo, ParsedMarkdown } from './types.js';

/**
 * Convert Markdown to styled HTML with rich formatting
 * Keeps image placeholders as text nodes for later replacement
 */
function convertMarkdownToStyledHtml(markdown: string): string {
  let html = markdown;

  // Handle headings (h1-h6)
  html = html.replace(/^######\s+(.+)$/gm, '<h6 style="font-size: 1em; font-weight: bold; margin: 1em 0;">$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 style="font-size: 1.1em; font-weight: bold; margin: 1em 0;">$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 style="font-size: 1.2em; font-weight: bold; margin: 1em 0;">$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 style="font-size: 1.3em; font-weight: bold; margin: 1.2em 0 0.8em 0;">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 style="font-size: 1.4em; font-weight: bold; margin: 1.2em 0 0.8em 0;">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 style="font-size: 1.6em; font-weight: bold; margin: 1.5em 0 1em 0;">$1</h1>');

  // Handle blockquotes - convert to styled div
  html = html.replace(/^>\s+(.+)$/gm, '<div style="border-left: 4px solid #ddd; padding-left: 1em; margin: 1em 0; color: #666;">$1</div>');

  // Handle bold text with color (from the article format)
  html = html.replace(/\*\*<font\s+style="color:#DF2A3F;([^"]+)">([^<]+)<\/font>\*\*/g, '<strong style="color: #DF2A3F; $1">$2</strong>');
  html = html.replace(/<font\s+style="color:#DF2A3F;([^"]+)">([^<]+)<\/font>/g, '<span style="color: #DF2A3F; $1">$2</span>');
  html = html.replace(/<font\s+style="([^"]+)">([^<]*)<\/font>/g, '<span style="$1">$2</span>');

  // Handle bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Handle inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>');

  // Handle horizontal rules
  html = html.replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid #ddd; margin: 2em 0;">');

  // Handle line breaks - use paragraph breaks
  html = html.replace(/\n\n/g, '</p><p style="line-height: 1.8; margin: 1em 0;">');
  html = html.replace(/\n/g, '<br>');

  // Wrap in p tag if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p style="line-height: 1.8; margin: 1em 0;">' + html + '</p>';
  }

  // Clean up empty paragraphs and consecutive <br> tags
  html = html.replace(/<p style="line-height: 1\.8; margin: 1em 0;"><\/p>/g, '');
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
  html = html.replace(/(<br\s*\/?>){3,}/g, '<br><br>'); // Limit consecutive breaks to 2
  html = html.replace(/<\/p><p[^>]*><br>/g, '</p><p style="line-height: 1.8; margin: 1em 0;">'); // Remove <br> at start of p

  return html;
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    const request = protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

function getImageExtension(urlOrPath: string): string {
  const match = urlOrPath.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
  return match ? match[1]!.toLowerCase() : 'png';
}

async function resolveImagePath(imagePath: string, baseDir: string, tempDir: string): Promise<string> {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    const hash = createHash('md5').update(imagePath).digest('hex').slice(0, 8);
    const ext = getImageExtension(imagePath);
    const localPath = path.join(tempDir, `remote_${hash}.${ext}`);

    if (!fs.existsSync(localPath)) {
      console.error(`[markdown-parser] Downloading: ${imagePath}`);
      await downloadFile(imagePath, localPath);
    }
    return localPath;
  }

  if (path.isAbsolute(imagePath)) {
    return imagePath;
  }

  return path.resolve(baseDir, imagePath);
}

export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Frontmatter = {};
  const lines = match[1]!.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      let value = line.slice(colonIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2]! };
}

/**
 * Convert HTML to plain text for platforms that don't support rich text
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse markdown file for multi-platform publishing
 */
export async function parseMarkdownForMultiPlatform(
  markdownPath: string,
  options?: { title?: string; tempDir?: string },
): Promise<ParsedMarkdown> {
  const content = fs.readFileSync(markdownPath, 'utf-8');
  const baseDir = path.dirname(markdownPath);
  const tempDir = options?.tempDir ?? path.join(os.tmpdir(), 'multi-platform-article-images');

  await mkdir(tempDir, { recursive: true });

  const { frontmatter, body } = parseFrontmatter(content);

  // Extract title: frontmatter > H1 (but skip generic titles) > filename
  let title = options?.title ?? frontmatter.title ?? '';
  if (!title) {
    const h1Match = body.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const h1Title = h1Match[1]!;
      // Skip generic titles and use filename instead
      const genericTitles = ['前言', '引言', '序言', '序', 'Preface', 'Introduction', '引子'];
      if (!genericTitles.includes(h1Title.trim())) {
        title = h1Title;
      }
    }
  }
  if (!title) {
    title = path.basename(markdownPath, path.extname(markdownPath));
  }

  const author = frontmatter.author ?? '';

  // Extract summary
  let summary = frontmatter.summary ?? frontmatter.description ?? '';
  if (!summary) {
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('![')) continue;
      if (trimmed.startsWith('>')) continue;
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue;
      if (/^\d+\./.test(trimmed)) continue;

      const cleanText = trimmed
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1');

      if (cleanText.length > 20) {
        summary = cleanText.length > 120 ? cleanText.slice(0, 117) + '...' : cleanText;
        break;
      }
    }
  }

  // Extract cover image
  let coverImage: string | undefined;
  if (frontmatter.cover_image) {
    const coverPath = frontmatter.cover_image;
    if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
      const hash = createHash('md5').update(coverPath).digest('hex').slice(0, 8);
      const ext = getImageExtension(coverPath);
      const localPath = path.join(tempDir, `cover_${hash}.${ext}`);
      if (!fs.existsSync(localPath)) {
        console.error(`[markdown-parser] Downloading cover image: ${coverPath}`);
        await downloadFile(coverPath, localPath);
      }
      coverImage = localPath;
    } else if (path.isAbsolute(coverPath)) {
      coverImage = coverPath;
    } else {
      coverImage = path.resolve(baseDir, coverPath);
    }
  }

  // Extract images and replace with placeholders
  const images: Array<{ src: string; placeholder: string; position: number }> = [];
  let imageCounter = 0;

  // Replace images with placeholders and track them
  const modifiedBody = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const placeholder = `[[IMAGE_PLACEHOLDER_${++imageCounter}]]`;
    images.push({
      src,
      placeholder,
      position: 0 // Will be updated if needed
    });
    return placeholder;
  });

  // Calculate positions if needed
  if (images.length > 0) {
    const lines = body.split('\n');
    let currentPosition = 0;
    let imgIndex = 0;

    for (const line of lines) {
      const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch && imgIndex < images.length) {
        images[imgIndex].position = currentPosition;
        imgIndex++;
      }
      currentPosition += line.length + 1; // +1 for newline
    }
  }

  // Create styled HTML version for rich text editors
  const styledContent = convertMarkdownToStyledHtml(modifiedBody);

  // Keep placeholders as-is for later replacement (don't replace with plain numbers)
  const formattedContent = styledContent;

  // Wrap in complete HTML document structure for better copy-paste support
  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Article</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 20px; line-height: 1.8; }
  </style>
</head>
<body>
<div id="output">
${formattedContent}
</div>
</body>
</html>`;

  const tempHtmlPath = path.join(tempDir, 'temp-article.html');
  await writeFile(tempHtmlPath, fullHtml, 'utf-8');

  // Resolve all images
  const contentImages: ImageInfo[] = [];
  for (const img of images) {
    const localPath = await resolveImagePath(img.src, baseDir, tempDir);
    contentImages.push({
      placeholder: img.placeholder,
      localPath,
      originalPath: img.src,
    });
  }

  return {
    title,
    author,
    summary,
    coverImage,
    htmlPath: tempHtmlPath,
    contentImages,
    frontmatter,
  };
}
