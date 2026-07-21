# Elena 3.0 — Catalogue d'outils & technologies à greffer
*Date : 7 mai 2026 — Vision long-terme : Elena = "Lovable + ChatGPT + Zapier + n8n" en un agent unique*

---

## 🎯 Méthode
Pour chaque outil : **(1)** ce qu'Elena pourra faire, **(2)** la techno/provider à brancher, **(3)** complexité estimée (S/M/L/XL), **(4)** dépendances.

Tout est ajouté à la catégorie `elena-v3` du tableau de pilotage (icône `Rocket`).

---

## 1. 🧠 Modèles IA additionnels (BYOK)

| Outil | Tech | Pourquoi | Effort |
|---|---|---|---|
| **DeepSeek-V3 / R1** | API DeepSeek (compat OpenAI) | Coût 10x moins cher que GPT-5 sur tâches code, raisonnement R1 quasi o1 | S |
| **Groq (Llama 3.3, Qwen)** | api.groq.com | Inférence ultra-rapide (500+ tok/s), idéal autocomplete code en live | S |
| **Cerebras** | api.cerebras.ai | Le plus rapide au monde (2000+ tok/s) — pour streaming temps réel | S |
| **xAI Grok-4** | api.x.ai | Bon en raisonnement, accès données X.com en temps réel | S |
| **Anthropic Claude 4.5 Sonnet/Opus** | api.anthropic.com | Meilleur modèle code du marché + computer-use natif | M |
| **Mistral Large 2 / Codestral** | api.mistral.ai | Souveraineté EU, Codestral spécialisé code | S |
| **Qwen 3 Coder** | DashScope ou via OpenRouter | Open-source meilleur que GPT-4 en code | S |
| **OpenRouter (router universel)** | openrouter.ai | 1 clé = 300+ modèles, fallback automatique | M |

## 2. 🎙️ Voix (TTS / STT / temps réel)

| Outil | Tech | Use case Elena | Effort |
|---|---|---|---|
| **ElevenLabs TTS v3** | API ElevenLabs (déjà connector) | Voix off premium pour vidéos, podcasts | S |
| **OpenAI Whisper-3** | API OpenAI | Transcription audio uploads (interviews, réunions) | S |
| **OpenAI Realtime API (gpt-4o-realtime)** | WebRTC/WS | Mode "appel téléphonique" avec Elena, voix-à-voix < 300ms | L |
| **Cartesia Sonic** | api.cartesia.ai | TTS le plus rapide (40ms latence), idéal voicebots | M |
| **Deepgram Nova-3** | api.deepgram.com | STT temps réel, diarisation multi-speakers | M |
| **Resemble.AI Voice Clone** | API Resemble | Cloner la voix de l'utilisateur (5min audio) | M |
| **Suno / Udio** | API non-officielle | Génération de musique pour intros vidéo | L |

## 3. 🎬 Vidéo

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Runway Gen-4** | api.runwayml.com | Text-to-video pro, lip-sync | M |
| **Luma Dream Machine** | api.lumalabs.ai | Vidéo image-to-video haute qualité | M |
| **Pika 2.0** | API Pika | Vidéos courtes stylisées | M |
| **Veo 3 (Google)** | Vertex AI | Vidéo + audio synchronisé natif | L |
| **Sora (OpenAI)** | API Sora (rolling out) | Plus haute qualité pour scènes complexes | L |
| **HeyGen / D-ID Avatars** | API HeyGen | Avatars parlants depuis script texte | M |
| **FFmpeg server-side** | binaire dans Worker (via API externe) | Cut, concat, watermark, sous-titres burn-in | L |
| **Auto-subtitles (Whisper + burn)** | Whisper + ffmpeg | Sous-titres automatiques sur vidéos uploadées | M |

## 4. 📄 Documents

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **PDF parse multimodal** | unpdf + LlamaParse | Extraire texte+tableaux+images d'un PDF | M |
| **DOCX read/write** | docx (npm) + mammoth | Générer rapports Word, lire CV uploadés | S |
| **XLSX read/write** | exceljs | Manipuler feuilles, formules, charts | M |
| **OCR images** | Mistral OCR / Tesseract WASM | Lire texte dans images (tickets, factures) | M |
| **Pandoc-like conversions** | API CloudConvert | MD↔DOCX↔PDF↔HTML | S |
| **Génération PDF stylée** | @react-pdf/renderer ou Puppeteer-on-Browserless | Factures, contrats, rapports brandés | M |
| **Signature électronique** | DocuSign API ou yousign.com | Faire signer un PDF généré par Elena | L |

## 5. 🌐 Web automation & scraping

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Browserbase / Browserless** | api.browserbase.com | Playwright headless cloud (Workers ne peut pas) | M |
| **Stagehand** | browserbase/stagehand | Browser-use IA-piloté ("clique sur 'commander'") | L |
| **Firecrawl scrape+crawl** | déjà connector | Sites complets en markdown | S (déjà fait) |
| **Apify actors** | api.apify.com | 3000+ scrapers prêts (LinkedIn, Amazon, IG…) | M |
| **Jina Reader** | r.jina.ai | URL → markdown propre, gratuit, ultra-rapide | S |
| **ScreenshotOne** | api.screenshotone.com | Screenshot URL en image PNG | S |

## 6. 💻 Exécution code sandboxée

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **E2B Sandboxes** | api.e2b.dev | Exécuter Python/Node arbitraire (data analysis Elena) | L |
| **Modal Labs** | api.modal.com | GPU à la demande pour fine-tuning, ML | XL |
| **Daytona** | daytona.io | Workspaces dev cloud pour tester un projet | XL |
| **Riza** | riza.io | Exec code AI-generated en isolation | M |
| **WebContainers (StackBlitz)** | déjà via Sandpack | Améliorer l'exec npm dans le navigateur | M |

## 7. 🔍 Recherche, RAG, mémoire long-terme

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Mem0** | mem0.ai | Mémoire long-terme structurée pour Elena (préférences user) | M |
| **Letta (ex-MemGPT)** | letta.com | Agent avec mémoire infinie auto-gérée | L |
| **Exa (ex-Metaphor)** | api.exa.ai | Search sémantique web (meilleur que Google pour recherche dev) | S |
| **Perplexity API** | api.perplexity.ai | Search + synthèse en 1 appel | S (déjà connector) |
| **Tavily** | tavily.com | Search optimisée pour LLMs | S |
| **Pinecone / Qdrant / Weaviate** | API | Vector DB managed pour RAG gros volumes | M |
| **Chroma cloud** | trychroma.com | Vector DB simple | S |
| **LlamaIndex / LangChain JS** | npm | Frameworks RAG complets | L |
| **Reranker Cohere/Voyage** | API | Améliore précision RAG de 30%+ | S |

## 8. 🎨 Design & assets visuels

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Figma API** | api.figma.com | Lire design Figma → générer code | L |
| **Figma-to-Code (Builder.io)** | builder.io/figma | Auto-conversion Figma→React | M |
| **Canva Connect API** | API Canva | Générer visuels marketing brandés | M |
| **Recraft V3** | api.recraft.ai | Logos, icônes, illustrations vectorielles SVG | M |
| **Ideogram 3.0** | api.ideogram.ai | Le meilleur pour images avec texte intégré | S |
| **Flux 1.1 Pro Ultra** | api.bfl.ai | Photoréalisme top niveau | S |
| **Midjourney v7** | API non-officielle (Useapi.net) | Style artistique unique | M |
| **Magnific upscale** | api.magnific.ai | Upscale 16x ultra-détaillé | S |
| **Remove.bg / ClipDrop** | API | Suppression background, cleanup | S |
| **Spline 3D / Three.js gen** | API Spline | Génération scènes 3D pour landing | XL |

## 9. 📊 Data & analytics

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **DuckDB WASM** | npm | Analyser CSV/Parquet 1Go en navigateur | M |
| **Recharts / Tremor / Visx auto-gen** | npm | Elena génère dashboards data | M |
| **Observable Plot** | npm | Charts data scientifiques | S |
| **PostHog / Mixpanel** | API | Tracking événements end-user apps | M |
| **Metabase embed** | API | Dashboards BI dans apps Nexyra | L |

## 10. 💬 Communication & messagerie

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Resend / Postmark** | déjà connector | Email transactionnel | S (déjà) |
| **Twilio SMS/WhatsApp/Voice** | déjà connector | Notifications multi-canal | M |
| **Telegram Bot** | déjà connector | Bot perso pour Elena | S |
| **Discord Bot** | discord.js | Bots communauté | M |
| **WhatsApp Cloud API** | Meta API direct | Sans Twilio, moins cher | M |
| **Pushover / ntfy** | API | Push notifs perso urgentes | S |

## 11. 💳 Paiements & business

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Stripe full** | déjà tool | Subscriptions, factures, Tax | M |
| **Polar.sh** | api.polar.sh | Alternative Stripe pour SaaS dev | S |
| **Lemon Squeezy** | API | Merchant of record (pas de TVA à gérer) | S |
| **Paddle** | déjà tool | MoR Europe | S |
| **Pennylane / QuickBooks API** | API | Compta auto pour factures Elena | L |
| **Crisp / Intercom API** | API | Support client embarqué | M |

## 12. 🚀 Déploiement & DevOps

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Vercel API deploy** | api.vercel.com | Deploy projet Elena → URL prod | M |
| **Netlify API** | api.netlify.com | Idem alternative | M |
| **Cloudflare Pages/Workers** | api.cloudflare.com | Idem + edge | M |
| **Railway / Fly.io** | API | Backend Node/Python deploy | L |
| **GitHub API (push, PR, Actions)** | api.github.com | Elena commit/PR son code | M |
| **Sentry monitoring** | api.sentry.io | Auto-instrumentation projets générés | M |
| **Better Stack uptime** | API | Monitoring uptime end-user apps | S |

## 13. 🤖 Agents avancés & frameworks

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Claude Computer Use** | Anthropic API | Elena prend le contrôle de l'écran réel | XL |
| **OpenAI Agents SDK** | npm @openai/agents | Multi-agent handoff natif | L |
| **Vercel AI SDK v5** | npm ai | Streaming + tools standardisé (refacto agent loop) | L |
| **Mastra** | mastra.ai | Framework agents TS production-ready | L |
| **CrewAI / AutoGen** | Python via E2B | Multi-agents collaboratifs | XL |
| **MCP (Model Context Protocol)** | spec Anthropic | Connecteurs standards (Elena = client MCP universel) | L |
| **LangGraph JS** | npm | Workflows agents avec state machines | L |

## 14. 🔌 No-code / Workflow

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **n8n self-hosted** | docker | Elena génère workflows n8n | XL |
| **Trigger.dev v3** | trigger.dev | Background jobs + cron managés | M |
| **Inngest** | déjà connector | Idem | M |
| **Zapier MCP** | zapier.com/mcp | 7000+ apps via 1 connecteur | M |

## 15. 🛡️ Sécurité & qualité

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **GitGuardian / TruffleHog** | API | Scan secrets dans code généré | M |
| **Snyk / Aikido** | déjà connector | Scan vulns dépendances | S |
| **Lighthouse CI** | API | Audit perf/SEO/a11y auto | M |
| **axe-core a11y** | npm | Test accessibilité auto | S |
| **Playwright tests auto-gen** | npm | Elena génère tests E2E pour son code | L |

## 16. 🌍 Real-time & collab

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Liveblocks** | api.liveblocks.io | Multi-cursors, comments dans apps Elena | M |
| **Yjs + y-websocket** | npm | CRDT collab editing | L |
| **Pusher / Ably** | API | WebSockets managed | S |
| **PartyKit** | partykit.io | Multiplayer edge | M |

## 17. 🎮 Spécialisés / fun

| Outil | Tech | Use case | Effort |
|---|---|---|---|
| **Replicate (10000+ modèles)** | api.replicate.com | Méta-provider tous modèles open-source | M |
| **HuggingFace Inference** | api-inference.huggingface.co | Modèles spécialisés gratuits | S |
| **Fal.ai** | déjà mentionné | Image/vidéo ultra-rapide | S |
| **Together AI** | api.together.xyz | Llama, Mixtral, Qwen open-source | S |
| **Stripe Atlas / Doola API** | API | Créer une LLC US depuis Elena | XL |

---

## 🏗️ Architecture technique pour supporter tout ça

### A. **Tool registry dynamique**
Aujourd'hui les 28 tools sont hardcodés dans `agent-tools.server.ts`. Il faut :
- Une table `agent_tools` en DB : `{ name, description, schema, handler_path, owner_id, enabled }`
- UI dans /dev pour activer/désactiver tools par projet
- Permet à l'utilisateur d'ajouter ses propres tools custom (webhook URL → outil Elena)

### B. **Provider abstraction layer**
Un fichier `src/server/providers/` avec un client par provider, interface commune :
```ts
interface AIProvider {
  chat(messages, opts): Promise<Response>
  embed?(text): Promise<number[]>
  image?(prompt): Promise<Url>
  audio?(text|audio): Promise<Url>
}
```
→ Permet de switcher Groq/Cerebras/Anthropic en 1 clic.

### C. **MCP client universel**
Implémenter le Model Context Protocol côté Elena → l'utilisateur peut connecter n'importe quel serveur MCP (Notion, Linear, Filesystem, GitHub, etc.) et Elena hérite des tools.

### D. **Worker queue pour tâches longues**
Vidéo (5-30s), fine-tuning, scraping massif → besoin d'une queue (Trigger.dev ou Inngest) avec status temps réel dans l'UI.

### E. **Storage assets multi-bucket**
Bucket par type : `images/`, `videos/`, `audio/`, `documents/`, `datasets/` avec CDN + transformation à la volée (Cloudflare Images / imgix).

### F. **Crédit/quota par outil**
Vidéo Veo3 = 50 crédits, image Flux = 1 crédit. Table `tool_pricing` + check pré-appel + UI transparence.

---

## 📋 Roadmap suggérée (ordre de priorité)

### **Sprint 1 — Multi-providers BYOK (1 semaine)**
1. Provider abstraction layer
2. + DeepSeek (coût)
3. + Groq (vitesse)
4. + Anthropic Claude (qualité code)
5. + OpenRouter (router universel)

### **Sprint 2 — Médias (2 semaines)**
6. PDF/DOCX/XLSX parse via document_parse + libs
7. ElevenLabs TTS / Whisper STT
8. Runway/Luma vidéo
9. Recraft logos SVG
10. Browserbase + screenshot

### **Sprint 3 — Mémoire & RAG (1 semaine)**
11. Mem0 intégration
12. Exa search
13. Reranker Cohere
14. Pinecone vector DB

### **Sprint 4 — Tool registry + MCP (2 semaines)**
15. Table `agent_tools` + UI activation
16. Client MCP universel
17. Webhook custom tools

### **Sprint 5 — Deploy & DevOps (1 semaine)**
18. Vercel/Netlify deploy auto
19. GitHub commit auto
20. Sentry instrument auto

### **Sprint 6 — Avancé (3 semaines)**
21. OpenAI Realtime (mode appel)
22. Claude Computer Use
23. E2B code execution
24. Multi-agent (Mastra/Agents SDK)

---

## ⚠️ Points d'attention

- **Coût** : chaque provider = clé BYOK utilisateur (cf. mémoire `agent-providers`). UI claire "Cette feature nécessite ElevenLabs, configurer la clé".
- **Latence Worker** : Cloudflare Workers = 30s max CPU. Tout ce qui est long (vidéo, scraping massif) → queue async.
- **Sécurité** : sandbox stricte pour code-exec (E2B isolé), scan secrets sur uploads.
- **UX** : ne pas noyer l'utilisateur. Proposer "packs" (Pack Créateur = vidéo+voix+image, Pack Dev = GitHub+deploy+monitoring).

---

*Total : ~80 outils proposés. Tableau de pilotage mis à jour avec les 50 plus impactants en `elena-v3`.*
