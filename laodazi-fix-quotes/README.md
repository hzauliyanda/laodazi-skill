# laodazi-fix-quotes Skill 使用指南

## 快速开始

### 在Claude Code中使用

当AI生成文章后，直接告诉Claude：

```
请使用laodazi-fix-quotes skill修正这个文件的引号：/path/to/article.md
```

或者更简单地说：

```
修正这个文章的中文引号
```

### 命令行使用

```bash
python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write /path/to/file.md
```

## 实际应用场景

### 场景1：AI文章生成后处理

```bash
# 1. AI生成文章到临时文件
claude-article-generator > /tmp/draft.md

# 2. 修正引号
python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write /tmp/draft.md

# 3. 移动到最终目录
mv /tmp/draft.md "/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/"
```

### 场景2：批量处理历史文章

```bash
# 批量修正所有待润色的文章
for file in "/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/"*.md; do
    python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write "$file"
done
```

### 场景3：集成到自动化脚本

```bash
#!/bin/bash
# 自动化文章处理脚本

ARTICLE_FILE="$1"

# 1. 修正引号
python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write "$ARTICLE_FILE"

# 2. 其他处理...
# echo "文章处理完成：$ARTICLE_FILE"
```

## 验证结果

修正后，检查文件中的引号是否正确：

```bash
# 查看包含引号的行
head -30 article.md | grep '"'

# 或者检查字节编码
head -15 article.md | sed -n '12p' | hexdump -C
```

正确的中文引号编码：
- `e2 80 9c` = 左双引号 `"`
- `e2 80 9d` = 右双引号 `"`

## 常见问题

### Q1: 脚本执行失败怎么办？
**A**: 检查文件路径是否正确，确保Python3已安装。

### Q2: 修正后引号还是英文的？
**A**: 原文件可能已经是中文引号了。检查字节编码确认。

### Q3: 能否修正其他标点符号？
**A**: 当前版本只处理引号。如需其他标点符号修正，可以修改脚本。

## 相关资源

- 技术文档：`/Users/liyanda/Documents/SynologyDrive/01-自媒体/技术文档/中文引号问题排查与解决.md`
- Skill描述：`~/.claude/skills/laodazi-fix-quotes/SKILL.md`
- Python脚本：`~/.claude/skills/laodazi-fix-quotes/fix-quotes.py`

---

**最后更新**：2026-05-20
