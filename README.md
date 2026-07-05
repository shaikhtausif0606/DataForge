# DataForge

An Electron-based research assistant that captures web data via a Chrome extension and uses AI (LangChain + OpenAI/OpenRouter) to analyze, summarize, and generate content.

## Features

- **Web Capture** — Chrome extension with 4 capture modes: element picker, text selection, table capture, full page
- **AI Assistant** — LangChain-powered chat with your research data. Select a session, ask questions, generate articles, presentations, reports
- **Multi-Provider** — Supports OpenAI and OpenRouter with dynamic model fetching
- **Per-Session Chat** — Each research session has its own persistent chat history
- **JSON Export** — Export any session's captures + metadata as JSON
- **Custom Frameless UI** — Dark theme with custom title bar controls

## Prerequisites

- Node.js 18+
- Google Chrome (required for Puppeteer to launch the capture browser)
- An API key from [OpenAI](https://platform.openai.com/api-keys) or [OpenRouter](https://openrouter.ai/keys)

## Quick Start

```bash
npm install
npm start
```

1. Click **Start Research** — Chrome opens with the capture extension loaded
2. Browse the web and use the extension (puzzle icon → pin it) to capture data
3. Click **End Research** to save the session
4. Open the **AI Assistant** (sidebar) to chat with your research data
5. Click **⚙️ Settings** to add your API key and select a model

## Project Structure

```
├── main/           # Electron main process
│   ├── main.js           # App entry, IPC handlers
│   ├── preload.js        # Context bridge API
│   ├── browser-launcher.js  # Chrome/Puppeteer launcher
│   ├── ws-server.js      # WebSocket relay for extension
│   ├── storage.js        # JSON file storage
│   ├── llm-service.js    # LangChain AI service
│   ├── chat-store.js     # Chat history persistence
│   └── settings-store.js # Settings persistence
├── renderer/       # Frontend (vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── extension/      # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js
│   ├── content-script.js
│   ├── popup.html
│   └── popup.js
└── data/           # Runtime data (gitignored)
    ├── sessions/   # Captured research data
    └── chats/      # AI conversation history
```

## Tech Stack

- **Electron 28** — Desktop framework
- **Puppeteer** — Chrome automation with stealth anti-detection
- **LangChain** — AI orchestration (OpenAI / OpenRouter)
- **Vanilla JS** — No frontend framework
- **WebSocket** — Extension-to-app communication on port 9876
