import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Loader2, MessageSquare, Plus, Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CommunityCTA } from "@/components/community/CommunityCTA";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Status = "open" | "planned" | "in_progress" | "shipped" | "declined";

interface FeatureRequest {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  votes_count: number;
  created_at: string;
}

const STATUS_LABEL: Record<Status, { label: string; cls: string }> = {
  open: { label: "Ouvert", cls: "bg-secondary/60 text-muted-foreground" },
  planned: { label: "Planifié", cls: "bg-primary/15 text-primary" },
  in_progress: { label: "En cours", cls: "bg-amber-500/15 text-amber-300" },
  shipped: { label: "Livré", cls: "bg-emerald-500/15 text-emerald-300" },
  declined: { label: "Refusé", cls: "bg-destructive/15 text-destructive" },
};

export const Route = createFileRoute("/feedback")({
  component: FeedbackPage,
  head: () => ({
    meta: [
      { title: "Nexyra AI — Feedback & roadmap publique" },
      { name: "description", content: "Propose une feature, vote pour les idées de la communauté et suis ce qu'Elena va construire ensuite." },
      { property: "og:title", content: "Feedback & roadmap — Nexyra AI" },
    ],
  }),
});

function FeedbackPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeatureRequest[]>([]);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const fetchAll = async () => {
    const { data } = await supabase
      .from("feature_requests")
      .select("id,title,description,status,votes_count,created_at")
      .order("votes_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(80);
    setItems((data ?? []) as FeatureRequest[]);
    setLoading(false);
  };

  const fetchMyVotes = async () => {
    if (!user) return;
    const { data } = await supabase.from("feature_votes").select("feature_id").eq("user_id", user.id);
    setMyVotes(new Set((data ?? []).map((r) => r.feature_id)));
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  useEffect(() => {
    void fetchMyVotes();
  }, [user]);

  const toggleVote = async (id: string) => {
    if (!user) {
      toast.error("Connecte-toi pour voter");
      return;
    }
    const has = myVotes.has(id);
    // optimistic
    const next = new Set(myVotes);
    if (has) next.delete(id);
    else next.add(id);
    setMyVotes(next);
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, votes_count: it.votes_count + (has ? -1 : 1) } : it)),
    );

    const { error } = has
      ? await supabase.from("feature_votes").delete().eq("feature_id", id).eq("user_id", user.id)
      : await supabase.from("feature_votes").insert({ feature_id: id, user_id: user.id });

    if (error) {
      toast.error("Vote impossible");
      void fetchAll();
      void fetchMyVotes();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Connecte-toi pour proposer une idée");
      return;
    }
    const t = title.trim();
    if (t.length < 4) {
      toast.error("Titre trop court (4 caractères min)");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("feature_requests").insert({
      author_id: user.id,
      title: t,
      description: desc.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Merci ! Idée enregistrée 🎉");
    setTitle("");
    setDesc("");
    void fetchAll();
  };

  const grouped = useMemo(() => {
    const top = items.slice(0, 30);
    return top;
  }, [items]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="starry-page-bg" />
      <div className="page-content-layer">
        <Navbar />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="text-center"
          >
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
              <Sparkles className="h-3 w-3" /> Roadmap publique
            </span>
            <h1 className="text-4xl font-bold tracking-tight gradient-text sm:text-5xl">
              Que veux-tu voir dans Nexyra ?
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Propose une idée, vote pour celles des autres. Les plus demandées passent
              en haut de la roadmap.
            </p>
          </motion.div>

          {/* Soumettre */}
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-10 rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur-md"
          >
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Proposer une idée
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Export Notion natif"
              className="mt-2 h-11 w-full rounded-xl border border-border/50 bg-background/40 px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Pourquoi c'est utile ? (optionnel)"
              className="mt-2 w-full resize-none rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !user}
                className="btn-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {user ? "Envoyer" : "Connecte-toi pour proposer"}
              </button>
            </div>
          </motion.form>

          {/* Liste */}
          <div className="mt-10 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl border border-border/30 bg-card/30" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center text-sm text-muted-foreground">
                Aucune idée pour l'instant. Sois le premier à en proposer une !
              </div>
            ) : (
              grouped.map((it) => {
                const voted = myVotes.has(it.id);
                const meta = STATUS_LABEL[it.status];
                return (
                  <motion.div
                    key={it.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 rounded-2xl border border-border/50 bg-card/40 p-4 backdrop-blur-md transition-colors hover:border-primary/30"
                  >
                    <button
                      onClick={() => toggleVote(it.id)}
                      aria-label={voted ? "Retirer mon vote" : "Voter"}
                      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border transition-all ${
                        voted
                          ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_15px_oklch(0.6_0.22_270/30%)]"
                          : "border-border/50 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      <ArrowUp className="h-4 w-4" />
                      <span className="text-xs font-semibold">{it.votes_count}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">{it.title}</h3>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      {it.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.description}</p>
                      ) : null}
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
                        <MessageSquare className="h-3 w-3" />
                        {new Date(it.created_at).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          <div className="mt-12">
            <CommunityCTA />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
