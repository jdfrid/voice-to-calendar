# Voice → Calendar (Hebrew) — MVP

אפליקציית React (Vite + TS + Tailwind) שממירה דיבור/טקסט לרשומת אירוע + קובץ ICS וקישור מהיר ל-Google Calendar.

## התקנה מקומית
```bash
npm i
npm run dev
# http://localhost:5173
```

## פריסה ל-GitHub Pages (אוטומטית)
1. דחוף את הקוד לענף `main` בריפו שלך בגיטהאב.
2. פתח Settings → Pages → Source: **GitHub Actions**.
3. בכל Push ל-main ירוץ ה-Workflow ויפרסם את האתר. (vite.config.ts מוגדר עם base './' כדי לעבוד ישירות)

## פריסה ל-Vercel/Netlify
- Vercel: Import repo → Build: `npm run build` → Output: `dist/`.
- Netlify: Build: `npm run build` → Publish: `dist`.

אין צורך בשום תוספות נוספות. הכל מוכן להפעלה.
