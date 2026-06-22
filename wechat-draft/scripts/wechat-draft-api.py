#!/usr/bin/env python3
"""
wechat-draft-api.py
Save markdown file as draft to WeChat Official Account via official API.
No browser automation needed.

Usage:
  python3 wechat-draft-api.py --markdown article.md
  python3 wechat-draft-api.py --markdown article.md --author "作者" --cover cover.png
"""

import argparse
import hashlib
import io
import json
import mimetypes
import os
import re
import struct
import sys
import tempfile
import urllib.request
import urllib.error
import uuid
import zlib
from pathlib import Path

API_BASE = "https://api.weixin.qq.com"
TOKEN_CACHE_PATH = os.path.join(os.path.expanduser("~"), ".local/share/wechat-draft-token.json")

# ─── HTTP helpers (pure Python stdlib, no curl dependency) ──────────────────

def http_get(url, timeout=30):
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8") or ""
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Request failed: {e.reason}")


def http_post_json(url, body, timeout=30):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8") or ""
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body_text}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Request failed: {e.reason}")


def _build_multipart(fields, files, boundary):
    """Build multipart/form-data body. fields=[(name,value)], files=[(name,filename,content,content_type)]."""
    parts = []
    for name, value in fields:
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        parts.append(f"{value}\r\n".encode())
    for name, filename, content, content_type in files:
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        parts.append(f"Content-Type: {content_type}\r\n\r\n".encode())
        parts.append(content)
        parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts)


def upload_file_curl(url, file_path, extra_fields=None, timeout=60):
    """Upload file via multipart/form-data using pure Python (no curl needed)."""
    boundary = uuid.uuid4().hex
    filename = os.path.basename(file_path)
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"

    with open(file_path, "rb") as f:
        file_content = f.read()

    fields = []
    if extra_fields:
        for field in extra_fields:
            # field format: 'key=value' or 'key={"json":...}'
            if "=" in field:
                k, v = field.split("=", 1)
                fields.append((k, v))

    body = _build_multipart(fields, [("media", filename, file_content, content_type)], boundary)

    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8") or ""
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Upload failed HTTP {e.code}: {body_text}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Upload failed: {e.reason}")


# ─── WeChat API ────────────────────────────────────────────────────────────

def get_access_token(app_id, app_secret):
    # Try cache
    try:
        if os.path.exists(TOKEN_CACHE_PATH):
            with open(TOKEN_CACHE_PATH, "r") as f:
                cached = json.load(f)
            if cached.get("expires_at", 0) > (1000 * time_ms() + 60000):
                print("[wechat] Using cached access_token")
                return cached["access_token"]
    except Exception:
        pass

    print("[wechat] Fetching new access_token...")
    url = f"{API_BASE}/cgi-bin/token?grant_type=client_credential&appid={app_id}&secret={app_secret}"
    body = http_get(url)
    data = json.loads(body)

    if "errcode" in data:
        raise RuntimeError(f"Token error [{data['errcode']}]: {data['errmsg']}")

    token = {
        "access_token": data["access_token"],
        "expires_at": int(time_ms() + data["expires_in"] * 1000 - 200000),
    }
    cache_dir = os.path.dirname(TOKEN_CACHE_PATH)
    os.makedirs(cache_dir, exist_ok=True)
    with open(TOKEN_CACHE_PATH, "w") as f:
        json.dump(token, f, indent=2)
    print("[wechat] access_token cached")
    return token["access_token"]


def upload_thumb_media(access_token, image_path):
    print(f"[wechat] Uploading cover image: {os.path.basename(image_path)}")
    url = f"{API_BASE}/cgi-bin/material/add_material?access_token={access_token}&type=image"
    body = upload_file_curl(url, image_path, ['description={"title":"cover"}'])
    data = json.loads(body)
    if "errcode" in data:
        raise RuntimeError(f"Upload cover error [{data['errcode']}]: {data['errmsg']}")
    print(f"[wechat] Cover uploaded: media_id={data['media_id']}")
    return data["media_id"], data.get("url", "")


def upload_inline_image(access_token, image_path):
    print(f"[wechat] Uploading inline image: {os.path.basename(image_path)}")
    url = f"{API_BASE}/cgi-bin/media/uploadimg?access_token={access_token}"
    body = upload_file_curl(url, image_path)
    data = json.loads(body)
    if "errcode" in data:
        raise RuntimeError(f"Upload inline image error [{data['errcode']}]: {data['errmsg']}")
    print(f"[wechat] Inline image uploaded: {data['url']}")
    return data["url"]


def create_draft(access_token, article):
    print("[wechat] Creating draft...")
    url = f"{API_BASE}/cgi-bin/draft/add?access_token={access_token}"
    body = http_post_json(url, {"articles": [article]}, timeout=60)
    data = json.loads(body)
    if "errcode" in data:
        raise RuntimeError(f"Create draft error [{data['errcode']}]: {data['errmsg']}")
    print(f"[wechat] Draft created! media_id={data['media_id']}")
    return data["media_id"]


# ─── Markdown Parser ───────────────────────────────────────────────────────

def parse_frontmatter(content):
    m = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$", content)
    if not m:
        return {}, content
    fm = {}
    for line in m.group(1).split("\n"):
        idx = line.find(":")
        if idx > 0:
            key = line[:idx].strip()
            val = line[idx + 1:].strip().strip('"').strip("'")
            fm[key] = val
    return fm, m.group(2)


def escape_html(text):
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def inline_markdown(text):
    # Bold
    text = re.sub(
        r"\*\*(.+?)\*\*",
        r'<strong style="font-weight:bold;color:#1a1a1a;">\1</strong>',
        text,
    )
    # Italic
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    # Inline code
    text = re.sub(
        r"`([^`]+)`",
        r'<code style="background:#f0f0f0;padding:2px 6px;border-radius:3px;'
        r'font-family:Menlo,Monaco,Consolas,monospace;font-size:13px;color:#c7254e;">\1</code>',
        text,
    )
    # Links
    def _link(m):
        link_text, href = m.group(1), m.group(2)
        if re.match(r"^https?://mp\.weixin\.qq\.com", href):
            return f'<a href="{href}" style="color:#576b95;">{link_text}</a>'
        return link_text
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", _link, text)
    return text


def markdown_to_html(md):
    """Convert markdown to WeChat-compatible HTML.
    Returns (html, image_list) where image_list is [{index, alt, src}, ...]
    """
    img_index = [0]
    image_list = []

    def _img_replace(m):
        alt, src = m.group(1) or "", m.group(2)
        img_index[0] += 1
        idx = img_index[0]
        image_list.append({"index": idx, "alt": alt, "src": src})
        return f'<div style="text-align:center;margin:16px 0;">[[IMG_{idx}]]</div>'

    html = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", _img_replace, md)

    lines = html.split("\n")
    result = []
    in_code = False
    in_ul = False
    in_ol = False
    in_table = False
    in_tbody = False

    def _close_lists():
        nonlocal in_ul, in_ol, in_table, in_tbody
        if in_ul:
            result.append("</ul>")
            in_ul = False
        if in_ol:
            result.append("</ol>")
            in_ol = False
        if in_table:
            if in_tbody:
                result.append("</tbody>")
            result.append("</table>")
            in_table = False
            in_tbody = False

    for li, line in enumerate(lines):
        trimmed = line.strip()

        # Code blocks
        if trimmed.startswith("```"):
            _close_lists()
            if in_code:
                result.append("</code></pre>")
                in_code = False
            else:
                lang = trimmed[3:].strip()
                lang_label = (
                    f'<span style="float:right;font-size:12px;color:#999;margin-bottom:8px;">{escape_html(lang)}</span>'
                    if lang else ""
                )
                result.append(
                    f'<pre style="background:#f6f8fa;padding:16px;border-radius:6px;'
                    f'overflow-x:auto;margin:16px 0;">{lang_label}'
                    f'<code style="font-family:Menlo,Monaco,Consolas,monospace;'
                    f'font-size:14px;line-height:1.6;color:#24292e;">'
                )
                in_code = True
            continue

        if in_code:
            result.append(escape_html(line).replace(" ", "&nbsp;") or "&nbsp;")
            continue

        # Empty line
        if trimmed == "":
            _close_lists()
            continue

        # HR
        if re.match(r"^---+$", trimmed) or re.match(r"^\*\*\*+$", trimmed):
            _close_lists()
            result.append('<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;" />')
            continue

        # Headings
        h_match = re.match(r"^(#{1,4})\s+(.+)$", trimmed)
        if h_match:
            _close_lists()
            depth = len(h_match.group(1))
            text = inline_markdown(h_match.group(2))
            styles = {
                1: "font-size:22px;font-weight:bold;text-align:center;color:#FF6B35;margin:32px 0 16px;padding:0 0 8px;border-bottom:1px solid #eee;",
                2: "font-size:18px;font-weight:bold;color:#FF6B35;margin:28px 0 12px;padding:0 0 6px;border-bottom:1px solid #eee;",
                3: "font-size:16px;font-weight:bold;color:#FF6B35;margin:24px 0 10px;",
                4: "font-size:15px;font-weight:bold;color:#FF6B35;margin:20px 0 8px;",
            }
            s = styles.get(depth, styles[4])
            result.append(f"<h{depth} style=\"{s}\">{text}</h{depth}>")
            continue

        # Blockquote
        if trimmed.startswith(">"):
            _close_lists()
            q_content = re.sub(r"^>\s*", "", trimmed)
            result.append(
                f'<blockquote style="border-left:4px solid #ddd;padding:8px 16px;'
                f'margin:16px 0;color:#666;background:#f9f9f9;border-radius:0 4px 4px 0;">'
                f"{inline_markdown(q_content)}</blockquote>"
            )
            continue

        # Table
        if trimmed.startswith("|") and trimmed.endswith("|"):
            _close_lists()
            cells = [c.strip() for c in trimmed.split("|") if c.strip()]
            if all(re.match(r"^[-:]+$", c) for c in cells):
                continue

            if not in_table:
                in_table = True
                in_tbody = False

            next_line = lines[li + 1].strip() if li + 1 < len(lines) else ""
            is_header = bool(re.match(r"^\|?[-:\s|]+\|?$", next_line))

            if is_header:
                cell_style = "border:1px solid #ddd;padding:8px 12px;background:#f5f5f5;font-weight:bold;text-align:left;"
                cell_html = "".join(
                    f'<th style="{cell_style}">{inline_markdown(c)}</th>' for c in cells
                )
                result.append(
                    f'<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">'
                    f"<thead><tr>{cell_html}</tr></thead><tbody>"
                )
                in_tbody = True
            else:
                if not in_tbody:
                    result.append("<tbody>")
                    in_tbody = True
                cell_style = "border:1px solid #ddd;padding:8px 12px;"
                cell_html = "".join(
                    f'<td style="{cell_style}">{inline_markdown(c)}</td>' for c in cells
                )
                result.append(f"<tr>{cell_html}</tr>")
            continue

        # Close table
        if in_table:
            if in_tbody:
                result.append("</tbody>")
            result.append("</table>")
            in_table = False
            in_tbody = False

        # Unordered list
        if re.match(r"^[-*]\s", trimmed):
            if in_ol:
                result.append("</ol>")
                in_ol = False
            if not in_ul:
                result.append('<ul style="margin:12px 0;padding-left:24px;color:#333;">')
                in_ul = True
            item_text = inline_markdown(re.sub(r"^[-*]\s", "", trimmed))
            result.append(f'<li style="margin:6px 0;line-height:1.8;">{item_text}</li>')
            continue

        # Ordered list
        if re.match(r"^\d+\.\s", trimmed):
            if in_ul:
                result.append("</ul>")
                in_ul = False
            if not in_ol:
                result.append('<ol style="margin:12px 0;padding-left:24px;color:#333;">')
                in_ol = True
            item_text = inline_markdown(re.sub(r"^\d+\.\s", "", trimmed))
            result.append(f'<li style="margin:6px 0;line-height:1.8;">{item_text}</li>')
            continue

        # Close lists
        if in_ul:
            result.append("</ul>")
            in_ul = False
        if in_ol:
            result.append("</ol>")
            in_ol = False

        # Paragraph
        result.append(
            f'<section style="margin-bottom:16px;line-height:2;color:#333;font-size:15px;">'
            f"{inline_markdown(trimmed)}</section>"
        )

    # Close open tags
    if in_code:
        result.append("</code></pre>")
    if in_ul:
        result.append("</ul>")
    if in_ol:
        result.append("</ol>")
    if in_table:
        if in_tbody:
            result.append("</tbody>")
        result.append("</table>")

    return "\n".join(result), image_list


def extract_digest(html):
    m = re.search(r"<p[^>]*>([\s\S]*?)</p>", html) or re.search(
        r"<section[^>]*>([\s\S]*?)</section>", html
    )
    if not m:
        return ""
    text = re.sub(r"<[^>]+>", "", m.group(1))
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").strip()
    if len(text) < 20:
        return ""
    return text[:117] + "..." if len(text) > 120 else text


def validate_png(path):
    """Check if a PNG file is valid and complete (has proper PNG header and IEND chunk)."""
    try:
        with open(path, "rb") as f:
            header = f.read(8)
            if header != b"\x89PNG\r\n\x1a\n":
                return False
            # Check for IEND chunk anywhere in the file
            data = f.read()
            return b"IEND" in data
    except Exception:
        return False


def download_image(url, save_path, timeout=30):
    """Download image using Python urllib (no curl dependency). Returns True on success."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            if len(data) < 100:  # too small, probably an error page
                return False
            with open(save_path, "wb") as f:
                f.write(data)
            # Validate PNG integrity if it's a PNG file
            if save_path.lower().endswith(".png") and not validate_png(save_path):
                os.remove(save_path)
                return False
            return True
    except Exception:
        return False


def download_image_with_mirrors(original_url, save_path, timeout=30):
    """Try downloading an image with fallback mirrors for GitHub raw URLs.
    Returns (success, final_url).
    """
    mirrors = []
    # GitHub raw URLs: try popular CN mirrors
    if "raw.githubusercontent.com" in original_url:
        # Extract path: https://raw.githubusercontent.com/owner/repo/branch/file
        gh_match = re.match(r"https://raw\.githubusercontent\.com/(.+)$", original_url)
        if gh_match:
            gh_path = gh_match.group(1)
            mirrors = [
                f"https://ghfast.top/{gh_path}",
                f"https://mirror.ghproxy.com/{gh_path}",
                f"https://gh-proxy.com/{original_url}",
            ]

    # For GitHub raw URLs in CN, try mirrors first (original often times out)
    if mirrors:
        urls_to_try = mirrors + [original_url]
    else:
        urls_to_try = [original_url]
    for url in urls_to_try:
        label = "original" if url == original_url else "mirror"
        # Shorter timeout for original GitHub URL (likely to hang in CN)
        url_timeout = 8 if (url == original_url and mirrors) else timeout
        print(f"[wechat] Downloading ({label}): {url}")
        if download_image(url, save_path, url_timeout):
            print(f"[wechat] ✅ Downloaded ({label}): {os.path.basename(save_path)}")
            return True, url

    print(f"[wechat] ❌ All download attempts failed for: {original_url}")
    return False, original_url


def generate_placeholder_image(save_path, width=800, height=400, text="图片加载失败"):
    """Generate a placeholder image when download fails."""
    rows = []
    for y in range(height):
        row = b"\x00"
        for x in range(width):
            r, g, b = 230, 230, 230
            row += bytes([r, g, b])
        rows.append(row)
    raw = b"".join(rows)

    def chunk(ctype, data):
        c = ctype + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(raw, 1))
    iend = chunk(b"IEND", b"")
    with open(save_path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + ihdr + idat + iend)


def parse_markdown(markdown_path):
    with open(markdown_path, "r", encoding="utf-8") as f:
        content = f.read()
    frontmatter, body = parse_frontmatter(content)
    base_dir = os.path.dirname(markdown_path)

    title = frontmatter.get("title", "")
    if not title:
        m = re.match(r"^# (.+)$", body, re.M)
        if m:
            title = m.group(1)
    if not title:
        title = os.path.splitext(os.path.basename(markdown_path))[0]

    author = frontmatter.get("author", "")
    digest = frontmatter.get("summary", "") or frontmatter.get("digest", "")

    html_content, image_list = markdown_to_html(body)

    images = []
    tmp_dir = os.path.join(tempfile.gettempdir(), "wechat-draft-images")
    os.makedirs(tmp_dir, exist_ok=True)

    failed_downloads = []

    for img in image_list:
        src = img["src"]
        if src.startswith("http://") or src.startswith("https://"):
            h = hashlib.md5(src.encode()).hexdigest()[:8]
            ext_m = re.search(r"\.(jpg|jpeg|png|gif|webp)(\?|$)", src, re.I)
            ext = ext_m.group(1) if ext_m else "png"
            local_path = os.path.join(tmp_dir, f"remote_{h}.{ext}")
            if not os.path.exists(local_path):
                ok, _ = download_image_with_mirrors(src, local_path)
                if not ok:
                    # Generate placeholder so the article still gets published
                    placeholder_path = os.path.join(tmp_dir, f"placeholder_{h}.{ext}")
                    generate_placeholder_image(placeholder_path)
                    local_path = placeholder_path
                    failed_downloads.append(src)
            else:
                # File exists from previous run - validate integrity
                if local_path.lower().endswith(".png") and not validate_png(local_path):
                    print(f"[wechat] ⚠️ Cached file invalid (truncated): {os.path.basename(local_path)}, re-downloading...")
                    os.remove(local_path)
                    ok, _ = download_image_with_mirrors(src, local_path)
                    if not ok:
                        placeholder_path = os.path.join(tmp_dir, f"placeholder_{h}.{ext}")
                        generate_placeholder_image(placeholder_path)
                        local_path = placeholder_path
                        failed_downloads.append(src)
        elif os.path.isabs(src):
            local_path = src
        else:
            local_path = os.path.join(base_dir, src)

        if not os.path.exists(local_path):
            print(f"[wechat] Image not found: {src}")
            continue

        images.append({
            "placeholder": f"[[IMG_{img['index']}]]",
            "local_path": local_path,
            "original_path": src,
        })

    if failed_downloads:
        print(f"\n[wechat] ⚠️  {len(failed_downloads)} image(s) failed to download (placeholder used):")
        for url in failed_downloads:
            print(f"         {url}")
        print(f"[wechat] 💡 Tip: Check if the URLs are accessible, or provide local images via --cover")

    effective_digest = digest or extract_digest(html_content)
    return title, author, effective_digest, html_content, images


def generate_cover(temp_dir):
    """Generate a 900x500 gradient PNG as cover placeholder."""
    cover_path = os.path.join(temp_dir, f"cover_{int(time_ms())}.png")
    w, h = 900, 500
    rows = []
    for y in range(h):
        row = b"\x00"
        for x in range(w):
            t = x / w
            r = int(102 * (1 - t) + 118 * t)
            g = int(126 * (1 - t) + 75 * t)
            b = int(234 * (1 - t) + 162 * t)
            row += bytes([r, g, b])
        rows.append(row)
    raw = b"".join(rows)

    def chunk(ctype, data):
        c = ctype + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(raw, 1))
    iend = chunk(b"IEND", b"")

    with open(cover_path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + ihdr + idat + iend)
    return cover_path


# ─── Utility ────────────────────────────────────────────────────────────────

def time_ms():
    """Return current time in milliseconds (works on any platform)."""
    import time
    return int(time.time() * 1000)


# ─── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Save markdown file as draft to WeChat Official Account"
    )
    parser.add_argument("--markdown", required=True, help="Markdown file path")
    parser.add_argument("--title", default="", help="Override title")
    parser.add_argument("--author", default="", help="Author name")
    parser.add_argument("--digest", default="", help="Article summary")
    parser.add_argument("--cover", default="", help="Cover image path")
    parser.add_argument("--appid", default="", help="WeChat AppID (or WECHAT_APPID env)")
    parser.add_argument("--secret", default="", help="WeChat AppSecret (or WECHAT_APPSECRET env)")
    args = parser.parse_args()

    if not os.path.exists(args.markdown):
        print(f"Error: File not found: {args.markdown}", file=sys.stderr)
        sys.exit(1)

    app_id = args.appid or os.environ.get("WECHAT_APPID", "").strip()
    app_secret = args.secret or os.environ.get("WECHAT_APPSECRET", "").strip()
    if not app_id or not app_secret:
        print("Error: AppID and AppSecret required (use --appid/--secret or env vars)", file=sys.stderr)
        sys.exit(1)

    # 1. Parse markdown
    print(f"[wechat] Parsing markdown: {args.markdown}")
    title, author, digest, html_content, images = parse_markdown(args.markdown)
    effective_title = args.title or title
    effective_author = args.author or author
    effective_digest = args.digest or digest

    print(f"[wechat] Title: {effective_title}")
    if effective_author:
        print(f"[wechat] Author: {effective_author}")
    print(f"[wechat] Digest: {effective_digest or '(auto)'}")
    print(f"[wechat] Images: {len(images)}")

    if len(effective_title) > 64:
        print(f"Error: Title too long ({len(effective_title)} chars, max 64)", file=sys.stderr)
        sys.exit(1)

    # 2. Get access token
    access_token = get_access_token(app_id, app_secret)

    # 3. Upload cover image
    cover_path = args.cover or ""
    if not cover_path and images:
        cover_path = images[0]["local_path"]
        print("[wechat] Using first article image as cover")

    if not cover_path:
        print("[wechat] No cover, generating placeholder...")
        tmp_dir = os.path.join(tempfile.gettempdir(), "wechat-draft-images")
        os.makedirs(tmp_dir, exist_ok=True)
        cover_path = generate_cover(tmp_dir)

    if not os.path.isabs(cover_path):
        cover_path = os.path.abspath(cover_path)
    if not os.path.exists(cover_path):
        print(f"Error: Cover not found: {cover_path}", file=sys.stderr)
        sys.exit(1)

    thumb_media_id, _ = upload_thumb_media(access_token, cover_path)

    # 4. Upload inline images and replace placeholders
    final_html = html_content
    for img in images:
        try:
            img_url = upload_inline_image(access_token, img["local_path"])
            final_html = final_html.replace(
                img["placeholder"],
                f'<img src="{img_url}" style="max-width:100%;height:auto;display:block;margin:0 auto;" />',
            )
        except Exception as e:
            print(f"[wechat] Failed to upload {img['original_path']}: {e}")
            final_html = final_html.replace(img["placeholder"], "")

    # Clean remaining placeholders
    final_html = re.sub(r"\[\[IMG_\d+\]\]", "", final_html)
    print(f"[wechat] Final HTML: {len(final_html)} chars")

    # 5. Create draft
    draft_media_id = create_draft(
        access_token,
        {
            "title": effective_title,
            "content": final_html,
            "thumb_media_id": thumb_media_id,
            "author": effective_author or None,
            "digest": effective_digest or None,
        },
    )

    print(f"\n✅ Draft saved successfully!")
    print(f"   media_id: {draft_media_id}")


if __name__ == "__main__":
    main()
