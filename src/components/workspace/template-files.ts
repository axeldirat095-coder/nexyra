/**
 * Initial filesystem tree booted into WebContainer for a new Elena V2 project.
 * Vite + React + TS + Tailwind v4 + shadcn-ready scaffold.
 *
 * Format: WebContainer FileSystemTree.
 */
import type { FileSystemTree } from "@webcontainer/api";

const PACKAGE_JSON = {
  name: "nexyra-elena-app",
  private: true,
  type: "module",
  scripts: {
    dev: "vite --host 0.0.0.0",
    build: "vite build",
    preview: "vite preview --host 0.0.0.0",
  },
  dependencies: {
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.0",
    "lucide-react": "^0.575.0",
  },
  devDependencies: {
    "@vitejs/plugin-react": "^4.3.4",
    "@tailwindcss/vite": "^4.1.0",
    tailwindcss: "^4.1.0",
    vite: "^6.0.7",
  },
};

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { host: "0.0.0.0", port: 5173 },
});
`;

const TS_CONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
`;

const INDEX_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Nouveau projet — Elena</title>
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
    <script>
      // Nexyra QA pixel bridge — répond aux capture_pixel et capture_screenshot d'Elena via postMessage.
      (function () {
        var errs = [];
        var origErr = console.error;
        console.error = function () {
          try { errs.push(Array.from(arguments).map(String).join(' ').slice(0, 500)); } catch (e) {}
          if (errs.length > 50) errs.shift();
          return origErr.apply(console, arguments);
        };
        window.addEventListener('error', function (e) {
          errs.push('[error] ' + (e && e.message ? e.message : 'unknown'));
          if (errs.length > 50) errs.shift();
        });
        window.addEventListener('unhandledrejection', function (e) {
          errs.push('[promise] ' + (e && e.reason ? String(e.reason).slice(0, 300) : 'unknown'));
          if (errs.length > 50) errs.shift();
        });

        function outline(el, depth) {
          if (!el || depth > 3) return null;
          var kids = [];
          for (var i = 0; i < el.children.length && kids.length < 12; i++) {
            var c = outline(el.children[i], depth + 1);
            if (c) kids.push(c);
          }
          var txt = (el.children.length === 0 ? (el.textContent || '').trim().slice(0, 80) : '');
          return {
            tag: el.tagName.toLowerCase(),
            cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 120) : '',
            text: txt,
            children: kids,
          };
        }

        function snapshot() {
          var body = document.body;
          var bg = body ? getComputedStyle(body).backgroundColor : '';
          var fg = body ? getComputedStyle(body).color : '';
          var ff = body ? getComputedStyle(body).fontFamily : '';
          var counts = {
            h1: document.querySelectorAll('h1').length,
            h2: document.querySelectorAll('h2').length,
            h3: document.querySelectorAll('h3').length,
            button: document.querySelectorAll('button').length,
            a: document.querySelectorAll('a').length,
            img: document.querySelectorAll('img').length,
            input: document.querySelectorAll('input,textarea,select').length,
            svg: document.querySelectorAll('svg').length,
          };
          var bodyText = (body && body.innerText) ? body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 1500) : '';
          return {
            url: location.href,
            title: document.title,
            viewport: {
              w: window.innerWidth,
              h: window.innerHeight,
              scrollW: document.documentElement.scrollWidth,
              scrollH: document.documentElement.scrollHeight,
              hasOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
            },
            style: { background: bg, color: fg, fontFamily: ff },
            counts: counts,
            outline: outline(document.body, 0),
            bodyText: bodyText,
            consoleErrors: errs.slice(-20),
            renderedAt: Date.now(),
          };
        }

        async function takeScreenshot(maxWidth) {
          if (typeof window.html2canvas !== 'function') {
            throw new Error('html2canvas not loaded');
          }
          var canvas = await window.html2canvas(document.body, {
            backgroundColor: null,
            useCORS: true,
            logging: false,
            scale: 1,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: Math.min(document.documentElement.scrollHeight, 4000),
          });
          var w = canvas.width, h = canvas.height;
          if (w > maxWidth) {
            var ratio = maxWidth / w;
            var resized = document.createElement('canvas');
            resized.width = Math.round(w * ratio);
            resized.height = Math.round(h * ratio);
            var ctx = resized.getContext('2d');
            ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
            canvas = resized;
          }
          return {
            dataUrl: canvas.toDataURL('image/jpeg', 0.78),
            width: canvas.width,
            height: canvas.height,
          };
        }

        window.addEventListener('message', async function (e) {
          var d = e.data || {};
          if (d.type === 'NEXYRA_PIXEL_CAPTURE') {
            try {
              var snap = snapshot();
              (e.source || parent).postMessage(
                { type: 'NEXYRA_PIXEL_RESULT', id: d.id, ok: true, snapshot: snap },
                '*'
              );
            } catch (err) {
              (e.source || parent).postMessage(
                { type: 'NEXYRA_PIXEL_RESULT', id: d.id, ok: false, error: String(err) },
                '*'
              );
            }
          } else if (d.type === 'NEXYRA_PIXEL_SCREENSHOT') {
            try {
              var maxW = (d.maxWidth && typeof d.maxWidth === 'number') ? d.maxWidth : 1024;
              var shot = await takeScreenshot(maxW);
              var snap2 = snapshot();
              (e.source || parent).postMessage(
                { type: 'NEXYRA_PIXEL_SCREENSHOT_RESULT', id: d.id, ok: true, screenshot: shot, snapshot: snap2 },
                '*'
              );
            } catch (err) {
              (e.source || parent).postMessage(
                { type: 'NEXYRA_PIXEL_SCREENSHOT_RESULT', id: d.id, ok: false, error: String(err && err.message || err) },
                '*'
              );
            }
          }
        });
      })();
    </script>
  </head>
  <body class="bg-background text-foreground antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const APP_TSX = `export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-background text-foreground">
      <div className="max-w-xl text-center space-y-6">
        <div className="inline-block rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary ring-1 ring-primary/30">
          Projet vide — prêt pour Elena
        </div>
        <h1 className="text-5xl font-bold tracking-tight">
          Bienvenue.
        </h1>
        <p className="text-muted-foreground">
          Demande à Elena ce que tu veux construire. Elle peut éditer les fichiers
          de ce projet, lancer des commandes, et corriger ses erreurs en temps réel.
        </p>
      </div>
    </main>
  );
}
`;

// Tokens shadcn-compatibles (oklch). Elena DOIT réécrire ce fichier dès l'intake
// design pour adapter primary/accent à l'ambiance choisie. Sans ces tokens,
// `bg-background`, `text-foreground`, `bg-primary`, etc. ne fonctionnent pas.
const INDEX_CSS = `@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  --color-background: oklch(0.145 0 0);
  --color-foreground: oklch(0.985 0 0);
  --color-card: oklch(0.205 0 0);
  --color-card-foreground: oklch(0.985 0 0);
  --color-popover: oklch(0.205 0 0);
  --color-popover-foreground: oklch(0.985 0 0);
  --color-primary: oklch(0.65 0.22 264);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-secondary: oklch(0.269 0 0);
  --color-secondary-foreground: oklch(0.985 0 0);
  --color-muted: oklch(0.269 0 0);
  --color-muted-foreground: oklch(0.708 0 0);
  --color-accent: oklch(0.7 0.18 200);
  --color-accent-foreground: oklch(0.145 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-destructive-foreground: oklch(0.985 0 0);
  --color-border: oklch(0.269 0 0);
  --color-input: oklch(0.269 0 0);
  --color-ring: oklch(0.65 0.22 264);

  --radius: 0.75rem;
}

html, body { height: 100%; }
body { font-family: var(--font-sans); }
`;


const GITIGNORE = `node_modules
dist
.DS_Store
*.log
`;

export const initialTemplate: FileSystemTree = {
  "package.json": { file: { contents: JSON.stringify(PACKAGE_JSON, null, 2) } },
  "vite.config.ts": { file: { contents: VITE_CONFIG } },
  "tsconfig.json": { file: { contents: TS_CONFIG } },
  "index.html": { file: { contents: INDEX_HTML } },
  ".gitignore": { file: { contents: GITIGNORE } },
  src: {
    directory: {
      "main.tsx": { file: { contents: MAIN_TSX } },
      "App.tsx": { file: { contents: APP_TSX } },
      "index.css": { file: { contents: INDEX_CSS } },
    },
  },
};
