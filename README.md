# 阅读学单词 / IELTS Word Tools

## 项目简介
阅读学单词是一套围绕 IELTS 与地学词汇学习的全栈工具，包含文章填空练习、AI 判题、历史回溯以及词汇掌握度统计。前端通过静态 HTML 页面配合 Vite 打包的 ES 模块运行，后端提供一个 Node.js + SQLite 的轻量服务用于保存练习成绩与词汇背景信息。

## 功能亮点
- 填空练习面板：支持上传包含 `**术语**` 的英文文章、自动提取词汇列表、模糊搜索、跳转定位以及答案本地持久化。
- AI 工具箱：在浏览器中配置 API Key 后即可调用外部大模型生成文章、批量判题，并将判题结果与词汇上下文回写到服务端。
- 历史记录：`history.html` 展示每次判题的得分、正确/部分正确/错误统计，可查看单词级别详情并删除冗余记录。
- 词汇掌握页：`progress.html` 显示所有词汇当前分数、练习次数、最近提交时间，内置筛选、排序、语境面板、隐藏中文释义、按需新增或移除词汇。
- 词库管理：支持从 `data/vocabulary.csv` 初始化中文释义，后端接口可插入/删除词条，额外脚本可生成进度快照与补充释义。
- 本地与服务器双重缓存：浏览器 `localStorage` 保存当前练习状态，服务器端通过 SQLite 记录长线进度并提供建议取词（`/api/word-suggestions`）。

## 技术栈
- 前端：原生 ES 模块、Vite 7 打包、多入口页面、少量自定义状态管理和 UI 控制器（位于 `src/legacy`、`src/ui` 等目录）。
- 后端：Node.js (CommonJS) + 内置 `http` 模块，使用 `sqlite3` CLI 执行 SQL（数据库文件为 `data/word_scores.db`）。
- 数据：`data/vocabulary.csv` 作为初始词库，服务器在运行时自动同步至 SQLite；`data_backup*` 目录用于手工备份。
- 工具：ESLint 9 用于前端代码静态检查（`npm run lint:frontend`）。

## 目录速览
```
.
├── geo_vocab_fill_in_webpage_english→chinese.html  # 主练习页（含 AI 工具箱）
├── history.html                                     # 判题历史页
├── progress.html                                    # 词汇掌握页
├── build/                                           # Vite 构建产物（fill.js/history.js/progress.js）
├── src/
│   ├── pages/      # 页面入口，当前仍引用 legacy 脚本
│   ├── legacy/     # 主要的 UI 控制器与业务逻辑
│   ├── services/   # HTTP/存储访问封装
│   ├── state/      # 轻量全局状态管理
│   ├── ui/         # 可复用的组件控制器
│   └── utils/      # 工具函数（HTML 转义、时间格式化、存储等）
├── server/
│   ├── index.js                # HTTP + API 服务入口
│   ├── seed_meanings.js        # 从 CSV 回填中文释义
│   └── backfill_snapshots.js   # 为历史判题生成进度快照
├── data/
│   ├── vocabulary.csv          # 词汇原始数据（分类,单词,词性,释义,...）
│   └── word_scores.db*         # SQLite 数据库（含 WAL 文件）
└── docs/frontend-restructure-plan.md  # 前端重构规划
```

## 环境要求
- Node.js 18 及以上版本（Vite 7 与 ESLint 9 需要此版本范围）。
- npm（或兼容的包管理器）。
- 已安装 `sqlite3` 命令行工具，供服务器脚本调用。
- 浏览器端若需调用 AI 接口，请自行准备可用的 API 终端与密钥。

## 快速开始
1. 安装依赖：
   ```bash
   npm install
   ```
2. 校验词库：确保 `data/vocabulary.csv` 存在；如更新了 CSV，可运行 `node server/seed_meanings.js` 将中文释义写入数据库。
3. 构建前端资源：
   ```bash
   npm run build:frontend
   ```
   构建结果输出到 `build/`，静态 HTML 页将加载同名 ES 模块（未清空旧文件以便离线使用）。
4. 启动后端：
   ```bash
   npm start
   ```
   默认监听 `http://localhost:4000`，可通过设置 `PORT` 环境变量自定义端口。
5. 浏览器访问：
   - `http://localhost:4000/fill.html`（或根路径 `/`）进行文章填空与 AI 判题。
   - `http://localhost:4000/history` 查看历史记录。
   - `http://localhost:4000/progress` 查看词汇掌握度。

## 开发与调试
- 想要热更新体验，可运行 `npm run dev:frontend` 启动 Vite Dev Server（默认端口 5173）。开发时可直接访问 `http://localhost:5173/fill.html` 等页面；静态 HTML 会加载 Vite 提供的模块路径。
- 修改前端代码后执行 `npm run lint:frontend` 做静态检查。
- 服务器依赖 `sqlite3` CLI，如需在非本地环境运行请确保具备执行权限。
- 当前 `src/pages/*` 仍仅导入 `legacy` 代码，重构计划详见 `docs/frontend-restructure-plan.md`。

## 数据与脚本
- `server/seed_meanings.js`：根据 CSV 更新现有词条的中文释义，并保证 `word_scores` 表存在必要列。
- `server/backfill_snapshots.js`：为每次判题历史补齐 `score_snapshots`，用于进度页面趋势图或区间统计。
- `test_article.md`：示例文章，包含 `**词汇**` 标记，可用于快速体验判题流程。
- `data_backup/` 与 `data_backup2/`：手工备份的 CSV 与数据库文件，方便回滚。

## HTTP API 概览
| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET  | `/api/word-scores` | 返回全部词汇的分数、练习次数、最近语境等信息。 |
| POST | `/api/word-scores` | 提交判题结果（`{ results: [...], article, session_id? }`），更新分数并写入历史。 |
| POST | `/api/sessions` | 保存一次判题但暂不更新分数，用于外部评分后再提交。 |
| GET  | `/api/sessions` | 按时间倒序列出判题历史，可通过 `?limit=` 控制条数。 |
| GET  | `/api/sessions/{id}` | 查看某次判题的详细结果与逐词语境。 |
| DELETE | `/api/sessions/{id}` | 删除指定判题记录及关联快照。 |
| GET  | `/api/stats/daily` | 获取近 N 天（默认 7 天）练习统计聚合。 |
| GET  | `/api/word-suggestions` | 根据练习数量及掌握阈值返回复习与新词建议。 |
| POST | `/api/words` | 新增词汇及中文释义。 |
| DELETE | `/api/words/{term}` | 删除词汇与其语境记录。 |
| POST | `/api/word-status` | 将词汇标记为 `mastered`（分值 999）或 `reset`。 |
| GET  | `/health` | 健康检查。 |

> 所有 API 默认允许跨域请求，响应为 UTF-8 编码的 JSON。

## AI 工具箱提示
- 填空页的 API 设置包括 LLM 服务地址、模型名称、API Key 以及本地后端地址；配置保存在 `localStorage`。
- “AI 生成文章” 可根据练习目标词汇自动补全文章骨架（默认约 220 词、三段），适合快速生成带 `**` 标记的素材。
- “开始判题” 会逐词向配置的 LLM 发送请求，返回的相似度、答案说明与上下文将通过 `/api/word-scores` 落库。
- `sync-server` 按钮会从服务端拉取最新分数并更新列表徽标，以便离线练习时同步进度。

## 后续计划
- 逐步将 `legacy` 中的 DOM 逻辑迁移到模块化组件（详见 `docs/frontend-restructure-plan.md`）。
- 完善自动化测试与类型校验，降低不同页面之间的耦合。
- 如需部署到生产环境，可将静态资源放置任意 Web 服务器，并在后台进程中长期运行 `node server/index.js`。

欢迎根据个人需求扩展词库、替换判题模型或集成更多统计图表。
