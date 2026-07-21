
## But

Tu as créé le projet **Nexyra 2.0** dans `/projects` (ton app Nexyra). Je vais y mettre tout le code du ZIP que tu viens d'uploader, sans que tu aies à toucher à l'interface d'import. Tu ouvres juste le projet et c'est prêt.

## Ce que je vais faire (étapes pour moi)

1. **Trouver ton projet "Nexyra 2.0"** dans la base — récupérer son `project_id` et ton `user_id` via une requête SQL (`SELECT id, owner_id FROM projects WHERE name = 'Nexyra 2.0'`).
2. **Uploader le ZIP vers le stockage cloud** — je copie `Nexyra AI Assistant.zip` (14,8 Mo) depuis tes uploads vers le bucket `elena-uploads` à l'emplacement `{ton_user_id}/nexyra-2-import.zip`. C'est le bucket déjà utilisé par le système d'import.
3. **Déclencher l'ingestion + décompression dans la sandbox** — j'appelle directement la fonction serveur `ingestFromStorage` (mode `unzip`) avec ce chemin et ton `project_id`. Cette fonction existe déjà : elle télécharge le ZIP, le décompresse dans `/home/user/app` de ta sandbox Nexyra 2.0, et nettoie le ZIP après.
4. **Vérifier que ça a marché** — je liste les fichiers extraits (`ls /home/user/app`) et confirme la présence de `package.json` + nombre de fichiers (~453 attendus).
5. **Côté installation des dépendances** : je n'essaye PAS `npm install`. La sandbox de ton app n'a pas la puissance pour installer 60+ packages d'un coup (c'est ce qui causait les crash mémoire avant). Le projet sera en **mode exploration** (déjà codé) : tu peux voir tous les fichiers, lire le code, modifier des fichiers, mais pas lancer le serveur de preview dans la sandbox.

## Ce que tu auras au final

- Le projet **Nexyra 2.0** dans `/projects` contient les 453 fichiers du ZIP.
- Tu peux l'ouvrir : clique dessus dans la liste → tu arrives sur l'espace Dev avec Elena. Elle peut lire/modifier les fichiers.
- La preview live (le rendu visuel) **ne tournera pas** dans cette sandbox — c'est une limite physique de l'environnement, pas un bug.

## Ce que ça NE résout PAS (honnêteté)

Si ton but final est de **voir Nexyra tourner visuellement** dans ton app Nexyra, ce n'est pas faisable avec la sandbox actuelle (trop lourd). Pour ça il faudrait soit :
- un vrai projet Lovable séparé (l'option GitHub qu'on a discutée),
- soit upgrader la sandbox vers un plan plus puissant (E2B Pro).

Mais pour **avoir le code dans Nexyra 2.0 et pouvoir le consulter/modifier avec Elena** → ce plan le fait, en 1 seul tour de crédit.

## Détails techniques (pour ma propre référence)

- Outils utilisés : `psql` (lookup project_id), `code--copy` (zip vers /tmp), `supabase--storage_upload` (zip vers bucket), `stack_modern--invoke-server-function` pour appeler `ingestFromStorage`.
- Aucune modification de code du projet courant.
- Aucune migration DB.
- Le ZIP sera auto-supprimé du bucket après ingestion (déjà géré par `ingestFromStorage`).

**Valide ce plan et je l'exécute immédiatement au prochain tour.**
