/**
 * Voice tools for Elena (LOT 3).
 *
 *  - voice_tts        : synthèse vocale ElevenLabs (BYOK `elevenlabs_api_key`).
 *                       Sortie MP3 uploadée sur `chat-uploads/voice-tts/...`.
 *  - audio_transcribe : transcription Whisper Large v3 Turbo via Groq
 *                       (BYOK `groq_api_key`). Audio fourni par URL publique.
 *
 * Worker-safe : pas de natif, fetch + FormData uniquement.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ToolName, ToolResult } from "./agent-tools.server";

const VOICE_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>([
  "voice_tts",
  "audio_transcribe",
]);

export function isVoiceTool(name: string): boolean {
  return VOICE_TOOLS.has(name as ToolName);
}

async function fetchUserKey(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("get_external_key_decrypted", {
    _owner_id: userId,
    _service: service,
  });
  return typeof data === "string" && data.length > 0 ? data : null;
}

function markUsed(
  supabase: SupabaseClient<Database>,
  userId: string,
  service: string,
): void {
  void supabase
    .rpc("mark_external_key_used", { _owner_id: userId, _service: service })
    .then(() => undefined);
}

// ---------- voice_tts ----------

interface TtsArgs {
  text: string;
  voice_id?: string;
  model_id?: string;
  language?: string;
  stability?: number;
  similarity_boost?: number;
}

// Voix ElevenLabs publiques par défaut (multilingues, FR-friendly).
const DEFAULT_VOICE_ID = "9BWtsMINqrJLrRacOk9x"; // Aria
const DEFAULT_MODEL = "eleven_turbo_v2_5";

async function runVoiceTts(
  args: TtsArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const text = (args.text ?? "").trim();
  if (!text) return { ok: false, output: "voice_tts: `text` requis." };
  if (text.length > 5000) {
    return { ok: false, output: "voice_tts: texte trop long (max 5000 caractères)." };
  }
  const key = await fetchUserKey(supabase, userId, "elevenlabs_api_key");
  if (!key) {
    return {
      ok: false,
      output:
        "voice_tts: clé ElevenLabs manquante. Ajoute-la dans Réglages → Clés API → ElevenLabs.",
    };
  }
  const voiceId = args.voice_id || DEFAULT_VOICE_ID;
  const modelId = args.model_id || DEFAULT_MODEL;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          language_code: args.language,
          voice_settings: {
            stability: args.stability ?? 0.5,
            similarity_boost: args.similarity_boost ?? 0.75,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `voice_tts ElevenLabs: ${res.status} ${t.slice(0, 300)}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const ts = Date.now();
    const path = `voice-tts/${userId}/${ts}.mp3`;
    const up = await supabase.storage
      .from("chat-uploads")
      .upload(path, buf, { contentType: "audio/mpeg", upsert: false });
    if (up.error) {
      return { ok: false, output: `voice_tts upload: ${up.error.message}` };
    }
    const { data: pub } = supabase.storage.from("chat-uploads").getPublicUrl(path);
    markUsed(supabase, userId, "elevenlabs_api_key");
    const sec = Math.round((text.length / 15) * 10) / 10; // ~15 chars/sec
    return {
      ok: true,
      output: `🔊 Audio généré (${(buf.byteLength / 1024).toFixed(1)} Ko, ~${sec}s) : ${pub.publicUrl}\nVoix : ${voiceId} · Modèle : ${modelId}`,
    };
  } catch (e) {
    return { ok: false, output: `voice_tts: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- audio_transcribe ----------

interface SttArgs {
  audio_url: string;
  language?: string;
  prompt?: string;
  model?: string;
}

async function runAudioTranscribe(
  args: SttArgs,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult> {
  const url = args.audio_url?.trim();
  if (!url) return { ok: false, output: "audio_transcribe: `audio_url` requis." };

  const key = await fetchUserKey(supabase, userId, "groq_api_key");
  if (!key) {
    return {
      ok: false,
      output:
        "audio_transcribe: clé Groq manquante. Ajoute-la dans Réglages → Clés API → Groq (Whisper Large v3 Turbo).",
    };
  }
  const model = args.model || "whisper-large-v3-turbo";

  try {
    const dl = await fetch(url);
    if (!dl.ok) {
      return { ok: false, output: `audio_transcribe download: ${dl.status}` };
    }
    const blob = await dl.blob();
    if (blob.size > 25 * 1024 * 1024) {
      return { ok: false, output: "audio_transcribe: fichier > 25 Mo non supporté par Groq." };
    }
    const filename = url.split("/").pop()?.split("?")[0] || "audio.mp3";

    const form = new FormData();
    form.append("file", blob, filename);
    form.append("model", model);
    form.append("response_format", "verbose_json");
    if (args.language) form.append("language", args.language);
    if (args.prompt) form.append("prompt", args.prompt);

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, output: `audio_transcribe Groq: ${res.status} ${t.slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      text?: string;
      language?: string;
      duration?: number;
    };
    markUsed(supabase, userId, "groq_api_key");
    const text = json.text ?? "";
    const meta = `lang=${json.language ?? "?"} · ${json.duration ? `${json.duration.toFixed(1)}s` : ""} · ${text.length} chars`;
    return {
      ok: true,
      output: `📝 Transcription (${meta}) :\n\n${text.slice(0, 6000)}${text.length > 6000 ? "\n\n…(tronqué)" : ""}`,
    };
  } catch (e) {
    return { ok: false, output: `audio_transcribe: ${e instanceof Error ? e.message : "erreur"}` };
  }
}

// ---------- entrypoint ----------

export async function executeVoiceTool(
  name: ToolName,
  rawArgs: Record<string, unknown>,
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ToolResult | null> {
  if (!isVoiceTool(name)) return null;
  try {
    if (name === "voice_tts")
      return await runVoiceTts(rawArgs as unknown as TtsArgs, supabase, userId);
    if (name === "audio_transcribe")
      return await runAudioTranscribe(rawArgs as unknown as SttArgs, supabase, userId);
  } catch (e) {
    return { ok: false, output: `${name}: ${e instanceof Error ? e.message : "erreur"}` };
  }
  return null;
}
