/**
 * wechat-draft-api.ts
 * Save markdown file as draft to WeChat Official Account via official API.
 * No browser automation needed.
 *
 * Usage:
 *   bun wechat-draft-api.ts --markdown article.md
 *   bun wechat-draft-api.ts --markdown article.md --author "作者" --cover cover.png
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import https from "node:https";
import { spawnSync } from "node:child_process";
import process from "node:process";
import os from "node:os";

// ─── Config ────────────────────────────────────────────────────────────────

const API_BASE = "https://api.weixin.qq.com";
const TOKEN_CACHE_PATH = path.join(
  os.homedir(),
  ".local/share/wechat-draft-token.json"
);

// ─── Types ─────────────────────────────────────────────────────────────────

interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
}

interface ParsedMarkdown {
  title: string;
  author: string;
  digest: string;
  htmlContent: string;
  images: ImageInfo[];
}

interface WechatToken {
  access_token: string;
  expires_at: number;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────

function httpGet(url: string, timeout = 30000): string {
  const result = spawnSync("curl", ["-sS", "--max-time", String(timeout), url], {
    encoding: "utf-8",
    timeout,
  });
  if (result.error) throw new Error(`HTTP request failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`curl exited with ${result.status}`);
  return result.stdout || "";
}

function httpPostJson(url: string, jsonBody: unknown, timeout = 30000): string {
  const tmpFile = path.join(os.tmpdir(), `wechat-draft-body-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(jsonBody), "utf-8");
    const result = spawnSync(
      "curl",
      ["-sS", "--max-time", String(timeout), "-X", "POST", "-H", "Content-Type: application/json", "-d", `@${tmpFile}`, url],
      { encoding: "utf-8", timeout }
    );
    if (result.error) throw new Error(`HTTP POST failed: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`curl exited with ${result.status}`);
    return result.stdout || "";
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function uploadFileCurl(url: string, filePath: string, extraFormFields: string[] = [], timeout = 60000): string {
  const args = ["-sS", "--max-time", String(timeout), "-X", "POST"];
  args.push("-F", `media=@${filePath}`);
  for (const field of extraFormFields) {
    args.push("-F", field);
  }
  args.push(url);

  const result = spawnSync("curl", args, { encoding: "utf-8", timeout });
  if (result.error) throw new Error(`Upload failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`curl exited with ${result.status}`);
  return result.stdout || "";
}

// ─── WeChat API ────────────────────────────────────────────────────────────

async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  // Try cache first
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      const cached: WechatToken = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf-8"));
      if (cached.expires_at > Date.now() + 60000) {
        console.log("[wechat] Using cached access_token");
        return cached.access_token;
      }
    }
  } catch {}

  console.log("[wechat] Fetching new access_token...");
  const url = `${API_BASE}/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const body = httpGet(url);
  const data = JSON.parse(body);

  if (data.errcode) {
    throw new Error(`Token error [${data.errcode}]: ${data.errmsg}`);
  }

  const token: WechatToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000 - 200000,
  };

  const cacheDir = path.dirname(TOKEN_CACHE_PATH);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(token, null, 2));
  console.log("[wechat] access_token cached");

  return token.access_token;
}

function uploadThumbMedia(accessToken: string, imagePath: string): { media_id: string; url: string } {
  console.log(`[wechat] Uploading cover image: ${path.basename(imagePath)}`);
  const url = `${API_BASE}/cgi-bin/material/add_material?access_token=${accessToken}&type=image`;
  const body = uploadFileCurl(url, imagePath, ['description={"title":"cover"}']);
  const data = JSON.parse(body);

  if (data.errcode) {
    throw new Error(`Upload cover error [${data.errcode}]: ${data.errmsg}`);
  }

  console.log(`[wechat] Cover uploaded: media_id=${data.media_id}`);
  return { media_id: data.media_id, url: data.url };
}

function uploadInlineImage(accessToken: string, imagePath: string): string {
  console.log(`[wechat] Uploading inline image: ${path.basename(imagePath)}`);
  const url = `${API_BASE}/cgi-bin/media/uploadimg?access_token=${accessToken}`;
  const body = uploadFileCurl(url, imagePath);
  const data = JSON.parse(body);

  if (data.errcode) {
    throw new Error(`Upload inline image error [${data.errcode}]: ${data.errmsg}`);
  }

  console.log(`[wechat] Inline image uploaded: ${data.url}`);
  return data.url;
}

function createDraft(
  accessToken: string,
  article: {
    title: string;
    content: string;
    thumb_media_id: string;
    author?: string;
    digest?: string;
  }
): string {
  console.log("[wechat] Creating draft...");
  const url = `${API_BASE}/cgi-bin/draft/add?access_token=${accessToken}`;
  const body = httpPostJson(url, { articles: [article] });
  const data = JSON.parse(body);

  if (data.errcode) {
    throw new Error(`Create draft error [${data.errcode}]: ${data.errmsg}`);
  }

  console.log(`[wechat] Draft created! media_id=${data.media_id}`);
  return data.media_id;
}

// ─── Markdown Parser ───────────────────────────────────────────────────────

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colonIdx = line.indexOf(":");
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string): string {
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:bold;color:#1a1a1a;">$1</strong>');
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;color:#c7254e;">$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, linkText, href) => {
    if (/^https?:\/\/mp\.weixin\.qq\.com/.test(href)) {
      return `<a href="${href}" style="color:#576b95;">${linkText}</a>`;
    }
    return linkText;
  });
  return text;
}

function markdownToHtml(md: string): { html: string; images: Array<{ index: number; alt: string; src: string }> } {
  let html = md;
  let imgIndex = 0;
  const imageList: Array<{ index: number; alt: string; src: string }> = [];

  // Strip HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Images → placeholders first
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    imgIndex++;
    imageList.push({ index: imgIndex, alt: alt || "", src });
    return `<div style="text-align:center;margin:16px 0;">[[IMG_${imgIndex}]]</div>`;
  });

  // Process line by line
  const lines = html.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let inTbody = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const trimmed = line.trim();

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (inTable) { if (inTbody) result.push("</tbody>"); result.push("</table>"); inTable = false; inTbody = false; }
      if (inCodeBlock) {
        result.push("</code></pre>");
        inCodeBlock = false;
      } else {
        const lang = trimmed.slice(3).trim();
        const langLabel = lang ? `<span style="float:right;font-size:12px;color:#999;margin-bottom:8px;">${escapeHtml(lang)}</span>` : "";
        result.push(`<pre style="background:#f6f8fa;padding:16px;border-radius:6px;overflow-x:auto;margin:16px 0;">${langLabel}<code style="font-family:Menlo,Monaco,Consolas,monospace;font-size:14px;line-height:1.6;color:#24292e;">`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      result.push(escapeHtml(line).replace(/ /g, "&nbsp;") || "&nbsp;");
      continue;
    }

    // Close lists/table on empty or non-list lines
    if (trimmed === "") {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (inTable) { if (inTbody) result.push("</tbody>"); result.push("</table>"); inTable = false; inTbody = false; }
      continue;
    }

    // HR
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (inTable) { if (inTbody) result.push("</tbody>"); result.push("</table>"); inTable = false; inTbody = false; }
      result.push(`<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />`);
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (inTable) { if (inTbody) result.push("</tbody>"); result.push("</table>"); inTable = false; inTbody = false; }
      const depth = hMatch[1]!.length;
      const text = inlineMarkdown(hMatch[2]!);
      const styles: Record<number, string> = {
        1: "font-size:22px;font-weight:bold;text-align:center;color:#FF6B35;margin:32px 0 16px;padding:0 0 8px;border-bottom:1px solid #eee;",
        2: "font-size:18px;font-weight:bold;color:#FF6B35;margin:28px 0 12px;padding:0 0 6px;border-bottom:1px solid #eee;",
        3: "font-size:16px;font-weight:bold;color:#FF6B35;margin:24px 0 10px;",
        4: "font-size:15px;font-weight:bold;color:#FF6B35;margin:20px 0 8px;",
      };
      result.push(`<h${depth} style="${styles[depth] || styles[4]}">${text}</h${depth}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (inTable) { if (inTbody) result.push("</tbody>"); result.push("</table>"); inTable = false; inTbody = false; }
      const qContent = trimmed.replace(/^>\s*/, "");
      result.push(`<blockquote style="border-left:4px solid #ddd;padding:8px 16px;margin:16px 0;color:#666;background:#f9f9f9;border-radius:0 4px 4px 0;">${inlineMarkdown(qContent)}</blockquote>`);
      continue;
    }

    // Table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (inOl) { result.push("</ol>"); inOl = false; }
      const cells = trimmed.split("|").filter(c => c.trim() !== "").map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue; // separator row

      if (!inTable) {
        inTable = true;
        inTbody = false;
      }

      // Check if next line is separator (header row)
      const nextLine = lines[li + 1]?.trim();
      const isHeader = nextLine && /^\|?[-:\s|]+\|?$/.test(nextLine);

      const tag = "td";
      const cellStyle = isHeader
        ? "border:1px solid #ddd;padding:8px 12px;background:#f5f5f5;font-weight:bold;text-align:left;"
        : "border:1px solid #ddd;padding:8px 12px;";
      const cellHtml = cells.map(c => `<${tag} style="${cellStyle}">${inlineMarkdown(c)}</${tag}>`).join("");

      if (isHeader) {
        result.push(`<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;"><thead><tr>${cellHtml.replace(/<td/g, "<th").replace(/<\/td>/g, "</th>")}</tr></thead><tbody>`);
        inTbody = true;
      } else {
        if (!inTbody) { result.push("<tbody>"); inTbody = true; }
        result.push(`<tr>${cellHtml}</tr>`);
      }
      continue;
    }

    // Close table when non-table line
    if (inTable) {
      if (inTbody) result.push("</tbody>");
      result.push("</table>");
      inTable = false;
      inTbody = false;
    }

    // Unordered list
    if (trimmed.match(/^[-*]\s/)) {
      if (inOl) { result.push("</ol>"); inOl = false; }
      if (!inUl) { result.push('<ul style="margin:12px 0;padding-left:24px;color:#333;">'); inUl = true; }
      result.push(`<li style="margin:6px 0;line-height:1.8;">${inlineMarkdown(trimmed.replace(/^[-*]\s/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (trimmed.match(/^\d+\.\s/)) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (!inOl) { result.push('<ol style="margin:12px 0;padding-left:24px;color:#333;">'); inOl = true; }
      result.push(`<li style="margin:6px 0;line-height:1.8;">${inlineMarkdown(trimmed.replace(/^\d+\.\s/, ""))}</li>`);
      continue;
    }

    // Close lists for paragraph
    if (inUl) { result.push("</ul>"); inUl = false; }
    if (inOl) { result.push("</ol>"); inOl = false; }

    // Paragraph
    result.push(`<section style="margin-bottom:16px;line-height:2;color:#333;font-size:15px;">${inlineMarkdown(trimmed)}</section>`);
  }

  // Close any open tags
  if (inCodeBlock) result.push("</code></pre>");
  if (inUl) result.push("</ul>");
  if (inOl) result.push("</ol>");
  if (inTable) { if (inTbody) result.push("</tbody>"); result.push("</table>"); }

  return { html: result.join("\n"), images: imageList };
}

function extractDigest(html: string): string {
  // Try <section> (generated by our parser) then <p> as fallback
  const sectionMatch = html.match(/<section[^>]*>([\s\S]*?)<\/section>/);
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  const rawMatch = sectionMatch || pMatch;
  if (!rawMatch) return "";
  const text = rawMatch[1]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
  if (text.length < 20) return "";
  return text.length > 120 ? text.slice(0, 117) + "..." : text;
}

function parseMarkdown(markdownPath: string): ParsedMarkdown {
  const content = fs.readFileSync(markdownPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const baseDir = path.dirname(markdownPath);

  let title = frontmatter.title || "";
  if (!title) {
    const h1Match = body.match(/^# (.+)$/m);
    if (h1Match) title = h1Match[1]!;
  }
  if (!title) title = path.basename(markdownPath, ".md");

  const author = frontmatter.author || "";
  const digest = frontmatter.summary || frontmatter.digest || "";

  const { html: htmlContent, images: imageList } = markdownToHtml(body);

  const images: ImageInfo[] = [];
  for (const img of imageList) {
    let localPath: string;
    if (img.src.startsWith("http://") || img.src.startsWith("https://")) {
      const hash = createHash("md5").update(img.src).digest("hex").slice(0, 8);
      const ext = img.src.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)?.[1] || "png";
      const tempDir = path.join(os.tmpdir(), "wechat-draft-images");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      localPath = path.join(tempDir, `remote_${hash}.${ext}`);
      if (!fs.existsSync(localPath)) {
        console.log(`[wechat] Downloading: ${img.src}`);
        const r = spawnSync("curl", ["-sL", "--max-time", "30", "-o", localPath, img.src], { timeout: 35000 });
        if (r.status !== 0 || !fs.existsSync(localPath)) {
          console.warn(`[wechat] Download failed: ${img.src}`);
          continue;
        }
      }
    } else if (path.isAbsolute(img.src)) {
      localPath = img.src;
    } else {
      localPath = path.resolve(baseDir, img.src);
    }

    if (!fs.existsSync(localPath)) {
      console.warn(`[wechat] Image not found: ${img.src}`);
      continue;
    }

    images.push({
      placeholder: `[[IMG_${img.index}]]`,
      localPath,
      originalPath: img.src,
    });
  }

  return { title, author, digest: digest || extractDigest(htmlContent), htmlContent, images };
}

function generateCover(tempDir: string): string {
  const coverPath = path.join(tempDir, `cover_${Date.now()}.png`);
  const r = spawnSync("python3", ["-c", `
import struct, zlib, sys
w, h = 900, 500
pixels = []
for y in range(h):
    row = b'\\x00'
    for x in range(w):
        t = x / w
        r = int(102*(1-t) + 118*t)
        g = int(126*(1-t) + 75*t)
        b = int(234*(1-t) + 162*t)
        row += bytes([r, g, b])
    pixels.append(row)
raw = b''.join(pixels)
def chunk(ctype, data):
    c = ctype + data
    return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
idat = chunk(b'IDAT', zlib.compress(raw))
iend = chunk(b'IEND', b'')
with open('${coverPath}', 'wb') as f:
    f.write(b'\\x89PNG\\r\\n\\x1a\\n' + ihdr + idat + iend)
`], { timeout: 10000 });
  if (!fs.existsSync(coverPath)) throw new Error("Failed to generate cover");
  return coverPath;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function printUsage(): never {
  console.log(`
Save markdown file as draft to WeChat Official Account

Usage:
  bun wechat-draft-api.ts --markdown <file> [options]

Options:
  --markdown <path>   Markdown file path (required)
  --title <text>      Override title
  --author <text>     Author name
  --digest <text>     Article summary
  --cover <path>      Cover image path (auto-generated if omitted)
  --appid <id>        WeChat AppID (or WECHAT_APPID env)
  --secret <key>      WeChat AppSecret (or WECHAT_APPSECRET env)

Environment:
  WECHAT_APPID        WeChat AppID
  WECHAT_APPSECRET    WeChat AppSecret
`);
  process.exit(0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) printUsage();

  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--") || i + 1 >= args.length) continue;
    opts[arg.slice(2)] = args[++i]!;
  }

  const markdownPath = opts["markdown"];
  if (!markdownPath) {
    console.error("Error: --markdown is required");
    process.exit(1);
  }
  if (!fs.existsSync(markdownPath)) {
    console.error(`Error: File not found: ${markdownPath}`);
    process.exit(1);
  }

  const appId = opts["appid"] || process.env.WECHAT_APPID?.trim() || "";
  const appSecret = opts["secret"] || process.env.WECHAT_APPSECRET?.trim() || "";
  if (!appId || !appSecret) {
    console.error("Error: AppID and AppSecret required (use --appid/--secret or env vars)");
    process.exit(1);
  }

  // 1. Parse markdown
  console.log(`[wechat] Parsing markdown: ${markdownPath}`);
  const parsed = parseMarkdown(markdownPath);
  const effectiveTitle = opts["title"] || parsed.title;
  const effectiveAuthor = opts["author"] || parsed.author;
  const effectiveDigest = opts["digest"] || parsed.digest;

  console.log(`[wechat] Title: ${effectiveTitle}`);
  if (effectiveAuthor) console.log(`[wechat] Author: ${effectiveAuthor}`);
  console.log(`[wechat] Digest: ${effectiveDigest || "(auto)"}`);
  console.log(`[wechat] Images: ${parsed.images.length}`);

  if (effectiveTitle.length > 64) {
    console.error(`Error: Title too long (${effectiveTitle.length} chars, max 64)`);
    process.exit(1);
  }

  // 2. Get access token
  const accessToken = await getAccessToken(appId, appSecret);

  // 3. Upload cover image
  let coverPath = opts["cover"] || "";
  if (!coverPath && parsed.images.length > 0) {
    coverPath = parsed.images[0]!.localPath;
    console.log("[wechat] Using first article image as cover");
  }

  if (!coverPath) {
    console.log("[wechat] No cover, generating placeholder...");
    const tempDir = path.join(os.tmpdir(), "wechat-draft-images");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    coverPath = generateCover(tempDir);
  }

  if (!path.isAbsolute(coverPath)) coverPath = path.resolve(process.cwd(), coverPath);
  if (!fs.existsSync(coverPath)) {
    console.error(`Error: Cover not found: ${coverPath}`);
    process.exit(1);
  }

  const { media_id: thumbMediaId } = uploadThumbMedia(accessToken, coverPath);

  // 4. Upload inline images and replace placeholders
  let finalHtml = parsed.htmlContent;
  for (const img of parsed.images) {
    try {
      const imgUrl = uploadInlineImage(accessToken, img.localPath);
      finalHtml = finalHtml.replace(
        img.placeholder,
        `<img src="${imgUrl}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />`
      );
    } catch (err) {
      console.warn(`[wechat] Failed to upload ${img.originalPath}: ${err}`);
      finalHtml = finalHtml.replace(img.placeholder, "");
    }
  }
  finalHtml = finalHtml.replace(/\[\[IMG_\d+\]\]/g, "");

  console.log(`[wechat] Final HTML: ${finalHtml.length} chars`);

  // 5. Create draft
  const draftMediaId = createDraft(accessToken, {
    title: effectiveTitle,
    content: finalHtml,
    thumb_media_id: thumbMediaId,
    author: effectiveAuthor || undefined,
    digest: effectiveDigest || undefined,
  });

  console.log(`\n✅ Draft saved successfully!`);
  console.log(`   media_id: ${draftMediaId}`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
