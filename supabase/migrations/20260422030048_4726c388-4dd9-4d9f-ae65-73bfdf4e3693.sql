UPDATE public.capabilities
   SET status = 'done', completed_at = now()
 WHERE title IN (
   'Outils fichiers (write/read/edit/delete)',
   'Mémoire d''actions (historique des modifications)',
   'Backup automatique projets utilisateur',
   'Onglet ''Mes projets'' dans /settings (rename, archive, delete)',
   'Animations premium (framer-motion : transitions, scroll, hover)',
   'Responsive de l''espace /dev'
 );