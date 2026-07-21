INSERT INTO public.capabilities (category_id, category_label, category_icon, title, info, status, priority, position, completed_at)
VALUES
 ('lot_e_collab','🤝 Collab & autonomie','users','Édition collaborative temps réel (Liveblocks)','Présences, curseurs, sessions multi-joueurs sur les projets Elena. Token BYOK minté via /api/liveblocks-auth.','done'::capability_status,'P1'::capability_priority,1,now()),
 ('lot_e_collab','🤝 Collab & autonomie','users','Raisonnement avancé Claude (Anthropic)','Tool claude_reasoning : Claude 3.5 Sonnet en BYOK, base computer-use ready.','done'::capability_status,'P0'::capability_priority,2,now()),
 ('lot_e_collab','🤝 Collab & autonomie','users','Stripe Atlas (incorporation auto)','Bloqué tant que la clé Stripe BYOK n''est pas saisie.','todo'::capability_status,'P2'::capability_priority,3,NULL)
ON CONFLICT DO NOTHING;