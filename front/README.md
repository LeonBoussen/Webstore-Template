# Frontend (React + Vite)

This is the React frontend of the **Webstore Template**. See the [root README](../README.md) for the full project overview, setup instructions, and API reference.

## Quick start

```powershell
npm install
npm run dev
```

The dev server runs at http://localhost:5173 and expects the Flask backend to be running at http://127.0.0.1:5000.

## Scripts

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `npm run dev`     | Start the Vite dev server       |
| `npm run build`   | Production build to `dist/`     |
| `npm run preview` | Preview the production build    |
| `npm run lint`    | Run ESLint                      |

## Stack

- **React 19** + **Vite 7**
- **Tailwind CSS 4** (via `@tailwindcss/vite`) with the typography plugin
- **React Router 7** for client-side routing
- **Axios** and native `fetch` for API calls
- **react-markdown** + **remark-gfm** for Markdown product descriptions, sanitized with
  **rehype-sanitize** (schema in `src/lib/markdown.js`)
- **lucide-react** for icons

## Structure

```
src/
├── components/   # Navbar
├── pages/        # One component per route
├── lib/          # markdown.js — hardened rehype-sanitize schema
├── api/axios.js  # Shared Axios instance (baseURL: /api) — not imported yet
├── App.jsx       # Route definitions
├── main.jsx      # React entry point
└── index.css     # Tailwind import + global styles
```

> **API base URL:** each page currently declares its own
> `const API_BASE = 'http://127.0.0.1:5000'` (or creates a local Axios instance) instead of using
> `src/api/axios.js`, so that file is unused for now. Changing the backend host means editing the
> pages, not a single config value.
