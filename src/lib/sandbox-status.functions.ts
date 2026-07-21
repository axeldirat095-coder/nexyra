import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLargeSandboxReady } from "@/server/e2b-sandbox.server";

export const e2bLargeSandboxStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return isLargeSandboxReady();
  });
