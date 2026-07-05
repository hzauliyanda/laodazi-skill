---
name: laodazi-writer
description: Use when the user wants to generate a history article from a topic. Calls an external 3-step pipeline API (research with Google Search grounding → thesis + on-the-fly outline design → write article), then supports revision via feedback. Supports full/outline/revise modes and anti-template style rotation (opening/ending/thread device pools, random by default, explicitly schedulable for batch generation).
---

# 历史文章生成器（API版）

调用外部文章生成 API（3步流水线），生成历史文章：研究 → 立论+现场设计大纲 → 写正文 → 用户校验史实 → 按反馈修订。

带**反模板化切法机制**：开头切法、结尾收法、贯穿手法三个池子，不传参数则服务端随机抽取，批量生成时由本 skill 显式排班轮换，防止多篇文章长得一样。

## 快速使用

```bash
/laodazi-writer "杀于谦、抄张居正、灭戚家军！这三起血案是怎么把大明逼上绝路的"
```

或者：

```bash
/laodazi-writer
# 然后输入主题
```

---

## API 模式说明

| 模式 | 说明 | 流水线 |
|------|------|--------|
| `full` | 完整3步流水线（默认） | 研究（拆解+搜原典/史料/评点）→ 立论+现场设计大纲 → 写正文 |
| `outline` | 研究到大纲 | 研究 → 立论+现场设计大纲 |
| `revise` | 根据用户反馈改写 | 1步 |

默认使用 `full` 模式。用户可通过 `outline` 关键词指定。（旧版的 `quick` 模式已废弃。）

---

## API 参数说明

| 参数 | 说明 | 必填 |
|------|------|------|
| `topic` | 用户输入的文章主题 | 是 |
| `mode` | `full`（默认）/ `outline` / `revise` | 否 |
| `opening_style` | 开头切法，不传则服务端随机 | 否 |
| `ending_style` | 结尾收法，不传则服务端随机 | 否 |
| `topic_type` | 题型，不传则模型自判 | 否 |
| `thread_device` | 贯穿手法，不传则服务端随机 | 否 |
| `article` | 之前的文章完整内容（仅 revise 模式） | revise 时必填 |
| `feedback` | 用户的修改建议（仅 revise 模式） | revise 时必填 |

### 切法池（传错返回 400，错误信息里带可选项）

| 参数 | 可选值 |
|------|--------|
| `opening_style` | 画面切入 / 时间地点直切 / 名将反衬 / 反差问题 / 物件切入 |
| `ending_style` | 比喻收住 / 引名言落地 / 配诗感慨 / 意象一锤 / 以古鉴今 / 戛然而止 |
| `topic_type` | 人物祛魅 / 事件重述 / 制度解读 / 翻案祛谣 / 风俗异域 |
| `thread_device` | 意象 / 算账 / 追问 / 时间线 / 双线对照 |

注意：`thread_device` 不是"意象"时，服务端随机结尾会自动剔除"意象一锤"；如果要显式指定"意象一锤"结尾，必须同时指定 `thread_device: "意象"`。

### 切法排班规则（批量生成时必须执行）

- **单篇生成**：4 个切法参数都不传，让服务端随机即可。
- **同一会话/同一天生成多篇**：必须显式传 `opening_style`、`ending_style`、`thread_device` 排班轮换——先列出本批已用过的组合，每篇选未用过的开头和结尾，避免随机撞车。题型 `topic_type` 按选题实际情况指定或留空自判，不参与轮换。
- 响应 JSON 的 `styles` 字段会回报本篇实际使用的组合，在向用户展示结果时一并列出。

---

## 工作流程

### 第一步：生成大纲和正文

**目标**：调用 API 生成大纲和正文，保存到待润色目录

**执行逻辑**：

1. 接收用户输入的历史主题（topic）
2. 确定模式（默认 `full`，用户可指定 `outline`）
3. 按"切法排班规则"决定是否传切法参数
4. 调用文章生成 API：

```bash
curl -s --location 'https://article-generator-896616019958.asia-east1.run.app' \
--header 'Content-Type: application/json' \
--data '{
  "topic": "<用户输入的主题>",
  "mode": "full"
}'
```

5. 解析返回的 JSON，包含：
   - `styles`：本篇实际使用的切法组合（`opening` / `ending` / `thread` / `topic_type`）
   - `research`：研究素材（拆解+原典/制度史料/旁证/评点）
   - `outline`：大纲（含主角确认、题型、立论、贯穿手法载体、文章结构、移植测验结果）
   - `article`：生成的正文（`outline` 模式无此字段）
   - `metrics`：文本质量指标（`chinese_chars`、`forbidden_words`、`passed`）
   - `timings`：各步骤耗时
   - `outline_saved_to` / `article_saved_to`：API 端 GCS 保存路径（忽略，由本地保存）

6. 如果是 `outline` 模式，只保存大纲到待润色目录，提示用户确认大纲后再生成正文
7. 如果是 `full` 模式，将正文（article 字段内容）保存到：
   - 路径：`/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/<topic>.md`
   - 命名：直接使用 topic 原文作为文件名
   - 权限：保存后执行 `chmod 777`

8. 向用户展示：

```
## 文章已生成（<模式> 模式，耗时 XXs）

### 切法组合
开头【XX】 结尾【XX】 贯穿【XX】 题型【XX】

### 立论
[从 outline 中提取选定的立论]

### 大纲
[展示 outline 的文章结构部分]

### 质量指标
- 中文字数：XXXX
- 违禁词：[有/无，如有则列出]
- 检查通过：是/否

### 文件保存位置
/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/<topic>.md

---

### 请校验史实
请阅读生成的文章，检查以下内容：
- 人物、时间、地点是否准确
- 事件经过是否与史实相符
- 数据引用是否正确

如有需要修改的地方，请告诉老达子具体的修改建议，格式如下：
- 第X段：[原文] → [修改建议]
- [补充说明]

校验无误的话，告诉老达子"没问题"即可。
```

9. **等待用户反馈**，不自动进入第二步

---

### 第二步：修订文章（按需）

**触发条件**：用户提供了修改建议/反馈

**执行逻辑**：

1. 收集用户的反馈内容（feedback）
2. 读取之前保存的文章内容
3. 调用修订 API：

```bash
curl -s --location 'https://article-generator-896616019958.asia-east1.run.app' \
--header 'Content-Type: application/json' \
--data '{
  "topic": "<用户输入的主题>",
  "mode": "revise",
  "article": "<之前的文章完整内容>",
  "feedback": "<用户的修改建议>"
}'
```

4. 解析返回的 JSON，取 `article` 字段
5. 用新文章**覆盖**之前的文件（同路径）
6. 保存后执行 `chmod 777`
7. 向用户展示修订结果：

```
## 文章已修订

### 修改内容
[总结本次修订了什么]

### 文件保存位置
/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/<topic>.md
```

8. **继续等待用户反馈**，如还有修改需求，重复第二步

（revise 模式会保持原文的开头切法、结尾收法和贯穿线索不变，只修正反馈指出的问题。）

---

## 文件保存规则

- 保存前必须读取 `/Users/liyanda/Documents/SynologyDrive/.FILE-RULES.md` 并遵守
- 路径：`/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/`
- 文件命名：使用用户给的完整主题原文，不简写/概括，只去半角非法字符，中文全角标点保留
- 文件权限：保存后 `chmod 777`，确保群晖 Drive 同步
- 修订时直接覆盖原文件，不新建副本

## 注意事项

1. **API 调用失败**：展示错误信息，让用户决定是否重试
2. **400 参数错误**：切法参数传错时 API 返回 400 并列出可选项，按提示修正后重试
3. **中文编码**：确保 curl 请求正确处理中文，使用 UTF-8 编码；命令行字面的中文全角引号会被转成 ASCII 引号导致参数截断，含引号的值要经变量传参
4. **article 内容转义**：传入 API 的 article 字段需要正确 JSON 转义（换行符、引号等）— 使用 Python 或 jq 处理，不要手动拼接 JSON
5. **反馈收集**：将用户的多条反馈合并为一个 feedback 字符串传入 API
6. **循环修订**：用户可以多次提出修改意见，每次都会调用修订 API 覆盖文件
7. **full 模式耗时较长**（3步串行，可能需要几分钟），提示用户耐心等待
8. **metrics 检查**：如果返回的 `metrics.passed` 为 false，主动告知用户违禁词或字数问题
9. **服务端版本**：切法参数和 `styles` 响应字段需要 2026-07-05 之后部署的服务端版本；旧版服务端会静默忽略这些参数（不报错但不生效），如果响应里没有 `styles` 字段，说明服务端还没重新部署，提醒用户执行 `gcloud functions deploy`
