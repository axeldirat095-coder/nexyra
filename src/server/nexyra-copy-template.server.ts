export const NEXYRA_COPY_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "nexyra-3-copy",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite --host 0.0.0.0 --port 5173",
        build: "vite build",
        preview: "vite preview --host 0.0.0.0 --port 5173",
      },
      dependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        vite: "^5.4.11",
        typescript: "^5.6.3",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "lucide-react": "^0.468.0",
      },
      devDependencies: {},
    },
    null,
    2,
  ),
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: { clientPort: 443, protocol: "wss" },
    allowedHosts: true,
  },
});
`,
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "index.html": `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nexyra AI — Copie Elena</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  "src/App.tsx": `import { ArrowRight, Maximize2, Rocket, Sparkles, Sun } from "lucide-react";

const navItems = ["Discuter", "Pilotage", "Dev", "Mes projets", "Comparatif", "Tarifs"];

function NexyraMark() {
  return (
    <div className="nexyra-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function App() {
  return (
    <main className="page-shell">
      <div className="star-field" />
      <header className="topbar">
        <div className="brand-lockup">
          <NexyraMark />
          <strong>Nexyra AI</strong>
        </div>
        <nav aria-label="Navigation principale">
          {navItems.map((item) => (
            <a href="#" key={item}>{item}</a>
          ))}
        </nav>
        <div className="top-actions">
          <button aria-label="Changer le thème"><Sun size={18} /></button>
          <button aria-label="Plein écran"><Maximize2 size={18} /></button>
          <span className="status-dot" />
          <span className="avatar">A</span>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="badge"><span /> Propulsé par l'IA multi-agents</div>
        <NexyraMark />
        <h1 id="hero-title">NEXYRA AI</h1>
        <h2>Votre équipe IA, prête à l'emploi</h2>
        <p>
          Des agents intelligents qui automatisent vos tâches, analysent vos données et boostent votre productivité.
          Conçu pour les entrepreneurs et créateurs ambitieux.
        </p>
        <div className="hero-actions">
          <a className="cta primary" href="#">Commencer gratuitement <ArrowRight size={17} /></a>
          <a className="cta secondary" href="#">Ouvrir Nexyra Dev</a>
          <a className="cta primary violet" href="#"><Rocket size={17} /> Tester Elena V2</a>
        </div>
        <form className="waitlist">
          <label htmlFor="email">OU REJOINS LA WAITLIST PRIVÉE</label>
          <div>
            <input id="email" type="email" placeholder="votre@email.com" />
            <button type="submit">Je veux un accès</button>
          </div>
        </form>
      </section>

      <section className="preview-strip" aria-label="Modules Nexyra">
        {["Elena Dev", "Pilotage", "Projets", "Automations"].map((title) => (
          <article key={title}>
            <Sparkles size={18} />
            <h3>{title}</h3>
            <p>Bloc prêt à être modifié par Elena dans cette copie.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
`,
  "src/index.css": `:root {
  color-scheme: dark;
  --bg: #020615;
  --bg-soft: #071326;
  --text: #f8fafc;
  --muted: #8b93a7;
  --line: rgba(148, 163, 184, 0.18);
  --blue: #37c9ff;
  --blue-deep: #3b82f6;
  --violet: #8b5cf6;
  --pink: #c084fc;
  --glass: rgba(9, 16, 35, 0.58);
}

* { box-sizing: border-box; }
html, body, #root { min-height: 100%; margin: 0; }
body {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}
a { color: inherit; text-decoration: none; }
button, input { font: inherit; }

.page-shell {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 28px clamp(18px, 4vw, 64px) 56px;
  background:
    radial-gradient(circle at 16% 20%, rgba(55, 201, 255, 0.16), transparent 30%),
    radial-gradient(circle at 72% 58%, rgba(139, 92, 246, 0.22), transparent 34%),
    linear-gradient(135deg, #03111f 0%, #040817 42%, #06091d 100%);
}

.star-field,
.star-field::before,
.star-field::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(circle, rgba(148, 213, 255, .78) 0 1px, transparent 1.4px),
    radial-gradient(circle, rgba(255, 255, 255, .45) 0 .8px, transparent 1.2px);
  background-size: 170px 160px, 230px 220px;
  opacity: .38;
}
.star-field::before, .star-field::after { content: ""; opacity: .34; transform: translate(70px, 30px); }
.star-field::after { transform: translate(-45px, 95px); opacity: .2; }

.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  max-width: 1220px;
  margin: 0 auto;
}
.brand-lockup, .top-actions { display: flex; align-items: center; gap: 12px; }
.brand-lockup strong {
  font-size: 18px;
  background: linear-gradient(90deg, var(--blue), var(--violet));
  -webkit-background-clip: text;
  color: transparent;
}
nav { display: flex; align-items: center; gap: clamp(18px, 3vw, 36px); color: #58a6ff; font-size: 14px; }
nav a { transition: color .2s ease; }
nav a:hover { color: var(--text); }
.top-actions button, .avatar {
  width: 38px;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.03);
}
.avatar { color: white; border-radius: 999px; background: linear-gradient(135deg, var(--blue-deep), var(--violet)); font-weight: 700; }
.status-dot { width: 12px; height: 12px; border-radius: 999px; background: #12d98e; box-shadow: 0 0 20px #12d98e; }

.nexyra-mark {
  position: relative;
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
}
.hero > .nexyra-mark { width: 128px; height: 128px; margin-top: 54px; filter: drop-shadow(0 0 32px rgba(75, 132, 255, .45)); }
.nexyra-mark span {
  position: absolute;
  width: 70%;
  height: 70%;
  border-radius: 60% 12% 60% 16%;
  background: conic-gradient(from 130deg, var(--blue), var(--blue-deep), var(--violet), var(--pink), var(--blue));
  transform-origin: 64% 64%;
  opacity: .98;
}
.nexyra-mark span:nth-child(1) { transform: rotate(12deg) translate(6%, -14%); }
.nexyra-mark span:nth-child(2) { transform: rotate(135deg) translate(6%, -14%); }
.nexyra-mark span:nth-child(3) { transform: rotate(255deg) translate(6%, -14%); }

.hero {
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  justify-content: center;
  padding: 44px 0 74px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--muted);
  font-size: 12px;
  padding: 8px 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
}
.badge span { width: 6px; height: 6px; border-radius: 99px; background: var(--blue-deep); box-shadow: 0 0 14px var(--blue-deep); }
h1 {
  margin: 26px 0 14px;
  font-size: clamp(30px, 4.2vw, 58px);
  letter-spacing: .12em;
  background: linear-gradient(90deg, var(--blue), var(--blue-deep), var(--violet), var(--pink));
  -webkit-background-clip: text;
  color: transparent;
}
h2 { margin: 0; font-size: clamp(24px, 3vw, 34px); font-weight: 500; color: #a6adbf; }
.hero p { max-width: 760px; margin: 26px auto 38px; color: #777f94; font-size: clamp(16px, 1.5vw, 20px); line-height: 1.65; }
.hero-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; }
.cta {
  min-height: 52px;
  min-width: 250px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 10px;
  font-weight: 700;
  border: 1px solid rgba(55, 201, 255, .5);
}
.cta.primary { border: 0; background: linear-gradient(100deg, var(--blue), var(--violet)); box-shadow: 0 18px 50px rgba(59, 130, 246, .25); }
.cta.secondary { background: rgba(15, 23, 42, .52); }
.cta.violet { background: linear-gradient(100deg, var(--blue-deep), var(--violet)); }
.waitlist { margin-top: 42px; width: min(560px, 100%); }
.waitlist label { display: block; margin-bottom: 14px; color: #667085; font-size: 12px; letter-spacing: .18em; }
.waitlist div { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.waitlist input, .waitlist button {
  min-height: 52px;
  border-radius: 14px;
  border: 1px solid var(--line);
}
.waitlist input { min-width: 0; background: rgba(2, 6, 23, .66); color: var(--text); padding: 0 18px; }
.waitlist button { border: 0; color: white; padding: 0 24px; font-weight: 800; background: linear-gradient(100deg, var(--blue), var(--violet)); }
.preview-strip {
  position: relative;
  z-index: 2;
  max-width: 1120px;
  margin: -30px auto 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.preview-strip article {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 18px;
  background: var(--glass);
  backdrop-filter: blur(16px);
}
.preview-strip svg { color: var(--blue); }
.preview-strip h3 { margin: 12px 0 6px; }
.preview-strip p { margin: 0; color: var(--muted); line-height: 1.5; font-size: 14px; }

@media (max-width: 860px) {
  .topbar { align-items: flex-start; }
  nav { display: none; }
  .hero { min-height: auto; padding-top: 72px; }
  .hero > .nexyra-mark { width: 104px; height: 104px; }
  .hero-actions, .cta { width: 100%; }
  .waitlist div { grid-template-columns: 1fr; }
  .preview-strip { grid-template-columns: 1fr; margin-top: 0; }
}
`,
};