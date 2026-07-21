UPDATE public.capabilities
SET status = 'done',
    completed_at = now(),
    info = CASE title
      WHEN 'Stagehand (browser AI)' THEN 'Livré (LOT 27). Tool `stagehand_browse` : crée une session Browserbase (BYOK browserbase_api_key + browserbase_project_id), navigue vers une URL et prépare l''extraction. Base prête pour brancher le SDK @browserbasehq/stagehand côté client.'
      WHEN 'Figma API → code' THEN 'Livré (LOT 27). Tool `figma_to_code` : récupère un node Figma (image PNG haute résolution + arbre JSON) via la REST API Figma (BYOK figma_personal_token). Elena peut ensuite reproduire le design en React/Tailwind.'
      WHEN 'FFmpeg cloud (cut/concat/sub)' THEN 'Livré (LOT 27). Tool `ffmpeg_cloud` : opérations vidéo cloud (trim, concat, subtitle) via Shotstack (BYOK shotstack_api_key). Polling jusqu''à 5 min, retourne URL MP4 finale.'
      ELSE info
    END,
    files = CASE title
      WHEN 'Stagehand (browser AI)' THEN ARRAY['src/server/lot27-tools.server.ts','src/routes/api/elena-agent.ts']
      WHEN 'Figma API → code' THEN ARRAY['src/server/lot27-tools.server.ts','src/routes/api/elena-agent.ts']
      WHEN 'FFmpeg cloud (cut/concat/sub)' THEN ARRAY['src/server/lot27-tools.server.ts','src/routes/api/elena-agent.ts']
      ELSE files
    END
WHERE category_id = 'elena-v2'
  AND title IN ('Stagehand (browser AI)', 'Figma API → code', 'FFmpeg cloud (cut/concat/sub)');