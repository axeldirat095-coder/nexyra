UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Outil agent block_remix livré : applique 6 vibes (premium-dark, minimal, glassmorphism, brutalist, editorial, neon) + radius (sharp/soft/pill) + densité (airy/compact) + accent OKLCH sur n''importe quel bloc de la biblio. Le TSX est transformé via regex (gradients, ombres, radius, blur, fonts) et renvoyé prêt à coller. Elena peut maintenant adapter un bloc à un style spécifique sans le réécrire (gain ~80% temps de variation). Wiring complet : ToolName, OPENAI_TOOLS, FIRST_PASS_TOOL_NAMES, formatter args, system prompt.',
    updated_at = now()
WHERE id = 'f5f2c20c-665f-413d-b502-7caee89686ea';

UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Système de variants premium étendu : chaque bloc shadcn de la biblio (40+ blocs SaaS/Mobile/Website/Dashboard) peut maintenant être déclinés en 6 vibes via block_remix sans réécriture. Les blocs natifs restent en premium-dark (gradients, glow, glassmorphism subtil) et sont remixables à la volée vers minimal/glass/brutalist/editorial/neon. La table de transformation gère gradients, shadows, radius, blur, typo serif et glow OKLCH.',
    updated_at = now()
WHERE id = '73523bd8-ed45-4ecb-b572-9cbf670ca3c6';