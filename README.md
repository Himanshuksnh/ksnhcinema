# KSNH Movies (React)

## Setup

```bash
cd "ksnh movies"
npm install
npm run dev
```

App runs on `http://localhost:5176`.

## If you see "Failed to fetch"

- This project now uses a Vite proxy (`/api -> https://gapi.inmoviebox.com`) to avoid CORS issues.
- After pulling latest changes, fully restart dev server:

```bash
# stop old dev server first
npm run dev
```

## Features

- Tabs:
  - All (`tabId=0`)
  - Movies (`tabId=2`)
  - Web Series + Anime (`tabId=5`)
  - Anime (`tabId=8`)
- Search by title
- Play URL fetch (`subject-api/play-info`)
- Download quality links (`subject-api/resource`)
