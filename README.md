# 阅读学单词

## 项目简介
阅读学单词是一套针对英语词汇学习的网站，包含 AI 文章生成、AI 判题、历史回溯以及词汇掌握度统计。

前端通过静态 HTML 页面配合 Vite 打包的 ES 模块运行，后端提供一个 Node.js + SQLite 的轻量服务用于保存练习成绩与词汇背景信息。

![reading.png](assets/reading.png)

![history.png](assets/history.png)

![words.png](assets/words.png)

## 环境要求
- Node.js 18 及以上版本，npm
- sqlite3
- 前端功能高度依赖 AI ，**请自行准备可用的 API 与密钥**；模型推荐选择deepseek-v3.1-250821

## 快速开始
1. 安装依赖：
   ```bash
   npm install
   ```
2. 词库：首次启动时，需要 `data/vocabulary.csv` 存在，默认为雅思高频词库，可以自行替换为其它词库
3. 构建前端：
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
   - `http://localhost:4000`
