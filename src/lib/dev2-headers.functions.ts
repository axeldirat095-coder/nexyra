import { createServerFn } from "@tanstack/react-start";

export const setDev2Headers = createServerFn({ method: "GET" }).handler(async () => {
  const { setResponseHeaders } = await import("@tanstack/react-start/server");
  setResponseHeaders({
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  return { ok: true };
});
