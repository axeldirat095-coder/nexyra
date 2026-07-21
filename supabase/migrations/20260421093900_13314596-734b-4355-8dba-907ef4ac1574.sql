UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = 'Système de fichiers virtuel multi-fichiers livré : arborescence latérale (créer / renommer / supprimer), onglets multiples avec fermeture, sélection rapide. L''action Apply des blocs de code d''Elena cible automatiquement le bon fichier selon le langage. Fondation prête pour brancher WebContainers ensuite.'
WHERE id = 'b02eeea8-8118-4ab6-aa89-504b9f775b84';