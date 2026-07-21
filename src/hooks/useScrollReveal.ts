import { useEffect } from "react";

/**
 * Active la classe `.is-visible` sur tout élément `.reveal-on-scroll` qui entre
 * dans le viewport. Branche un IntersectionObserver une seule fois par mount.
 * Respecte `prefers-reduced-motion` via le CSS associé (cf. styles.css).
 */
export function useScrollReveal(deps: ReadonlyArray<unknown> = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const els = document.querySelectorAll<HTMLElement>(".reveal-on-scroll");
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
