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
- **react-markdown** + **remark-gfm** for Markdown product descriptions
- **lucide-react** for icons

## Structure

```
src/
├── components/   # Navbar
├── pages/        # One component per route
├── api/axios.js  # Shared Axios instance (base URL: /api)
├── App.jsx       # Route definitions
├── main.jsx      # React entry point
└── index.css     # Tailwind import + global styles
```
