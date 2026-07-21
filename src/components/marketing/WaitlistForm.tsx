import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WaitlistFormProps {
  source?: string;
  placeholder?: string;
  cta?: string;
  className?: string;
}

export function WaitlistForm({
  source = "landing-hero",
  placeholder = "votre@email.com",
  cta = "Rejoindre la waitlist",
  className = "",
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error("Email invalide");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("waitlist_subscribers").insert({
      email: value,
      source,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      locale: typeof navigator !== "undefined" ? navigator.language?.slice(0, 5) ?? "fr" : "fr",
    });
    setLoading(false);

    if (error) {
      if (error.code === "23505") {
        toast.success("Tu es déjà inscrit·e ✨");
        setDone(true);
      } else {
        toast.error("Inscription impossible. Réessaie dans un instant.");
      }
      return;
    }
    setDone(true);
    toast.success("Bienvenue à bord 🚀");
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ${className}`}
      >
        <CheckCircle2 className="h-4 w-4" />
        Tu es sur la liste. On te tient au courant !
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`flex w-full max-w-md items-center gap-2 ${className}`}>
      <div className="relative flex-1">
        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          required
          autoComplete="email"
          className="h-11 w-full rounded-xl border border-border/50 bg-card/40 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 backdrop-blur-md outline-none transition-all focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn-gradient inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {cta}
      </button>
    </form>
  );
}
