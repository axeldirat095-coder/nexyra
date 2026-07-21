import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook de reconnaissance vocale en direct (Web Speech API).
 * - Transcription mot-à-mot (interim results) en français.
 * - Continue tant qu'on n'appuie pas à nouveau sur stop.
 * - IMPORTANT : start() doit être appelé directement depuis un user gesture
 *   (onClick), sinon le navigateur bloque l'accès micro.
 */
export type UseSpeechRecognitionOptions = {
  lang?: string;
  /** Callback appelé à chaque mise à jour (final OU interim). */
  onTranscript?: (text: string, isFinal: boolean) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition({
  lang = "fr-FR",
  onTranscript,
}: UseSpeechRecognitionOptions = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  /** Doit être appelé directement depuis un onClick (user gesture). */
  const start = useCallback(() => {
    setError(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Reconnaissance vocale non supportée par ce navigateur (utilise Chrome/Edge).");
      return;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalChunk += transcript;
        else interimChunk += transcript;
      }
      if (finalChunk) onTranscriptRef.current?.(finalChunk, true);
      if (interimChunk) onTranscriptRef.current?.(interimChunk, false);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Accès micro refusé. Autorise le micro dans les réglages du navigateur.");
        shouldRestartRef.current = false;
        setIsListening(false);
        return;
      }
      setError(`Erreur micro : ${event.error}`);
    };

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          shouldRestartRef.current = false;
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      shouldRestartRef.current = true;
      setIsListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de démarrer le micro");
      shouldRestartRef.current = false;
      setIsListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  return { isSupported, isListening, error, start, stop, toggle };
}
