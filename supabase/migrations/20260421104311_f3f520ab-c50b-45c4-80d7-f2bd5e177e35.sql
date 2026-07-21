UPDATE public.capabilities
SET status = 'done',
    completed_at = COALESCE(completed_at, now()),
    info = CASE
      WHEN title ILIKE '%mes projets%' THEN
        'Onglet "Mes projets" intégré dans /settings : liste tous les projets de l''utilisateur (icône par type website/webapp/mobile_app), rename inline (Enter/Escape), archive ↔ désarchive en 1 clic, suppression avec confirmation. Statuts visuels (badge type/status/date), opacité réduite pour les archivés. Sécurisé via RLS owner_id. Tous les libellés passent par useI18n() (FR/EN).'
      WHEN title ILIKE '%internationalisation%' OR title ILIKE '%i18n%' OR title ILIKE '%FR / EN%' OR title ILIKE '%FR/EN%' THEN
        'I18n FR/EN opérationnelle : I18nProvider monté dans le RootComponent, hook useI18n() expose lang/setLang/t. Dictionnaire centralisé dans src/i18n/i18n.tsx avec fallback FR. Persistance localStorage (clé nexyra-lang) + maj automatique de document.documentElement.lang. Composant LanguageToggle (FR | EN) intégré dans /settings → onglet Langue. MyProjectsSection est entièrement traduite. Architecture prête pour étendre la couverture progressivement.'
      ELSE info
    END
WHERE category_id = 'ui-ux'
  AND (
    title ILIKE '%mes projets%'
    OR title ILIKE '%internationalisation%'
    OR title ILIKE '%i18n%'
    OR title ILIKE '%FR / EN%'
    OR title ILIKE '%FR/EN%'
  );