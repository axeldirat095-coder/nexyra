import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ElenaSettings = Database["public"]["Tables"]["elena_settings"]["Row"];
export type ElenaMode = Database["public"]["Enums"]["elena_mode"];

const DEFAULTS: Omit<ElenaSettings, "owner_id" | "updated_at"> = {
  default_mode: "auto",
  model_eco: "google/gemini-3-flash-preview",
  model_standard: "google/gemini-3-flash-preview",
  model_premium: "google/gemini-2.5-pro",
  system_prompt_website: "Tu es Elena, agent expert en création de sites web modernes.",
  system_prompt_webapp: "Tu es Elena, agent expert en applications web (React, backend, base de données).",
  system_prompt_mobile: "Tu es Elena, agent expert en applications mobiles (React Native).",
  auto_summarize_after: 20,
  max_context_messages: 30,
  preferences: {},
  fallback_enabled: true,
  fallback_chain: ["openai", "anthropic", "google"],
  agent_provider: "openai",
  agent_model: "gpt-5-mini",
};

export function useElenaSettings() {
  const [settings, setSettings] = useState<ElenaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) setLoading(false);
        return;
      }
      if (mounted) setUserId(user.id);

      const { data } = await supabase
        .from("elena_settings")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (data) {
        if (mounted) setSettings(data);
      } else {
        // create defaults
        const { data: created } = await supabase
          .from("elena_settings")
          .insert({ owner_id: user.id, ...DEFAULTS })
          .select()
          .single();
        if (created && mounted) setSettings(created);
      }
      if (mounted) setLoading(false);
    };

    init();
    const { data: sub } = supabase.auth.onAuthStateChange(() => init());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<ElenaSettings>) => {
      if (!userId || !settings) return;
      const { data, error } = await supabase
        .from("elena_settings")
        .update(patch)
        .eq("owner_id", userId)
        .select()
        .single();
      if (!error && data) setSettings(data);
      return { data, error };
    },
    [userId, settings],
  );

  return { settings, loading, userId, update };
}
