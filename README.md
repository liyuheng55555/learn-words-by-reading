# Read to Learn Vocabulary

## Project Overview

A website focused on improving vocabulary recognition through reading. Core features include AI article generation, AI grading, practice history, and vocabulary mastery statistics.

The frontend runs as static HTML pages with ES modules bundled by Vite. The backend is a lightweight Node.js + SQLite service that stores practice results and vocabulary background information.

![reading.png](assets/reading.png)

## Requirements

- Node.js 18+ and npm
- sqlite3
- The frontend relies heavily on AI. Please prepare a usable API endpoint and key yourself. Recommended model: `deepseek-v3.1-250821`.

## Quick Start

### 1. Install dependencies

`npm install`

### 2. Vocabulary list

On first run, `data/vocabulary.csv` must exist. By default it is an IELTS high‑frequency word list, which you can replace with any other list.

### 3. Build the frontend

`npm run build:frontend`

### 4. Start the backend

`npm start`

### 5. Open the app

`http://localhost:4000`

### 6. AI configuration

Click the `AI Toolbox` button and enter your API and key.

![ai_config.png](assets/ai_config.png)

### 7. Auto‑generate articles

Set the desired number of target words, click the Auto Select Words button, then click the Generate Article button.

Article and question generation takes about 1 minute. Once generated, you can start practicing.

![generate.png](assets/generate.png)

![empty_reading.png](assets/empty_reading.png)

### 8. Auto grading

After completing the fill‑in‑the‑blank exercise, click the grading button at the bottom‑right of the page. Grading takes about 1 minute.

The results include the reference answers and a similarity score. You can review this attempt on the grading history page.

### 9. Submit score

If you accept the grading results, click the "Score" button in history to include this attempt in the total statistics.

![history.png](assets/history.png)

### 10. Vocabulary mastery

The vocabulary mastery page shows the scores for all words.

![words.png](assets/words.png)

