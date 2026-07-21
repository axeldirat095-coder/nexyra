import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Mic } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type DictationOverlayProps = {
  open: boolean;
  /** Texte déjà présent dans le champ avant ouverture (pour append). */
  initialText?: string;
  /** Appelé quand l'utilisateur valide (clic sur ✓). Reçoit le texte FINAL combiné. */
  onCommit: (text: string) => void;
  /** Appelé quand l'utilisateur annule (clic sur ✗ ou Escape). */
  onCancel: () => void;
  lang?: string;
};

const BARS = 28;

/**
 * Overlay plein-écran pour dictée vocale style "Lovable chat".
 * - Visualiseur audio temps réel (barres réactives au volume du micro).
 * - Transcription live mot-par-mot (interim + final), continue, sans limite de longueur.
 * - Auto-restart si Web Speech s'arrête tout seul (≈ 60s sur Chrome).
 * - Bouton ✓ pour valider, ✗ pour annuler.
 */
export function DictationOverlay({
  open,
  initialText = "",
  onCommit,
  onCancel,
  lang = "fr-FR",
}: DictationOverlayProps) {
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.05));
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  const speech = useSpeechRecognition({
    lang,
    onTranscript: (text, isFinal) => {
      if (isFinal) {
        setFinalText((prev) => {
          const sep = prev && !prev.endsWith(" ") ? " " : "";
          return `${prev}${sep}${text.trim()} `;
        });
        setInterimText("");
      } else {
        setInterimText(text);
      }
    },
  });

  // Démarre micro + analyser audio à l'ouverture
  useEffect(() => {
    if (!open) return;
    setFinalText("");
    setInterimText("");
    speech.start();

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const AudioCtxCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtxCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyserRef.current = analyser;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          // Réduit en BARS valeurs moyennes
          const step = Math.floor(data.length / BARS);
          const next: number[] = [];
          for (let i = 0; i < BARS; i += 1) {
            let sum = 0;
            for (let j = 0; j < step; j += 1) sum += data[i * step + j] ?? 0;
            const avg = sum / step / 255; // 0..1
            // Boost visuel + plancher
            next.push(Math.max(0.06, Math.min(1, avg * 1.6)));
          }
          setLevels(next);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Pas grave : la transcription marche quand même, juste pas de visualiseur.
      }
    })();

    return () => {
      cancelled = true;
      speech.stop();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-scroll de la transcription quand elle grossit
  useEffect(() => {
    transcriptScrollRef.current?.scrollTo({
      top: transcriptScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [finalText, interimText]);

  const handleCommit = useCallback(() => {
    const combined = `${finalText}${interimText}`.trim();
    if (!combined) {
      onCancel();
      return;
    }
    const sep = initialText && !initialText.endsWith(" ") ? " " : "";
    onCommit(`${initialText}${sep}${combined}`);
  }, [finalText, interimText, initialText, onCommit, onCancel]);

  // Escape = annuler
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, handleCommit]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCancel();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="w-full max-w-2xl rounded-2xl border border-border/50 bg-card/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/15">
                  <Mic className="h-4 w-4 text-destructive animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Dictée vocale</p>
                  <p className="text-xs text-muted-foreground">
                    {speech.isListening ? "À l'écoute…" : "En attente du micro…"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Annuler"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Transcription */}
            <div
              ref={transcriptScrollRef}
              className="mb-4 max-h-48 min-h-[6rem] overflow-y-auto rounded-xl border border-border/40 bg-background/40 p-4 text-sm leading-relaxed"
            >
              {finalText || interimText ? (
                <p className="whitespace-pre-wrap break-words text-foreground">
                  {finalText}
                  <span className="text-muted-foreground/80">{interimText}</span>
                </p>
              ) : (
                <p className="text-muted-foreground/60 italic">
                  Parle maintenant… ta voix s'affichera ici en direct.
                </p>
              )}
            </div>

            {/* Visualiseur audio */}
            <div className="mb-5 flex h-16 items-center justify-center gap-1 px-2">
              {levels.map((lv, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 rounded-full bg-[image:var(--gradient-primary)]"
                  animate={{ height: `${Math.round(lv * 56) + 4}px` }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              ))}
            </div>

            {speech.error && (
              <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {speech.error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                <kbd className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px]">Esc</kbd>{" "}
                pour annuler ·{" "}
                <kbd className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px]">⌘ Entrée</kbd>{" "}
                pour valider
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-border/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={!finalText.trim() && !interimText.trim()}
                  className="flex items-center gap-2 rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
                >
                  <Check className="h-4 w-4" />
                  Valider
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
