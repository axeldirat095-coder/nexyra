import { useEffect, useState, useCallback } from "react";
import { Bell, BellRing, AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Notif = {
  id: string;
  scope: "user" | "project";
  kind: "warning" | "blocked";
  threshold_pct: number;
  usage_usd: number;
  limit_usd: number;
  message: string | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Cloche d'alertes budget. Affiche un badge avec le nombre de notifs non-lues.
 * Auto-refresh à l'ouverture + écoute realtime.
 * Toast lors de la 1ère détection d'une nouvelle notif (en sourdine si déjà ouverte).
 */
export function BudgetNotificationsBell() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("budget_notifications" as never)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifs(data as unknown as Notif[]);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  // realtime — channel créé une seule fois après récupération du user, puis subscribe
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      channel = supabase.channel(`budget-notif-${user.id}`);
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "budget_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notif;
          setNotifs((prev) => [n, ...prev].slice(0, 20));
          if (n.kind === "blocked") {
            toast.error(n.message ?? "Budget atteint", { duration: 8000 });
          } else {
            toast.warning(n.message ?? "Budget à 80%", { duration: 6000 });
          }
        },
      );
      channel.subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const unread = notifs.filter((n) => !n.read_at);
  const unreadCount = unread.length;
  const hasBlocked = unread.some((n) => n.kind === "blocked");

  const markAllRead = async () => {
    await supabase.rpc("mark_budget_notifications_read" as never);
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next && unreadCount > 0) void markAllRead();
  };

  if (notifs.length === 0 && unreadCount === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground"
          title="Alertes budget"
          aria-label="Alertes budget"
          type="button"
        >
          {unreadCount > 0 ? (
            <BellRing className={`h-4 w-4 ${hasBlocked ? "text-destructive" : "text-amber-400"}`} />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {unreadCount > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${
                hasBlocked ? "bg-destructive" : "bg-amber-500"
              }`}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/40 px-3 py-2">
          <h3 className="text-sm font-semibold">Alertes budget</h3>
          <p className="text-[10px] text-muted-foreground">Seuils 80% et 100% — par utilisateur et par projet</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucune alerte 🎉
            </div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className={`flex gap-2 border-b border-border/20 px-3 py-2 text-xs ${
                  !n.read_at ? "bg-secondary/20" : ""
                }`}
              >
                {n.kind === "blocked" ? (
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {n.scope === "project" ? "Projet" : "Compte"} · ${n.usage_usd.toFixed(2)} / ${n.limit_usd.toFixed(2)} ·{" "}
                    {new Date(n.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
