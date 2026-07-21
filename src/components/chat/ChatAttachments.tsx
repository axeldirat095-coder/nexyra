/**
 * ChatAttachments — bouton + drop zone partagés pour joindre fichiers/images
 * dans le chat (mode libre `/chat` ou Dev workspace).
 *
 * - Bouton trombone qui ouvre un <input type="file"> caché.
 * - Drag & drop sur la zone parente via `useChatDropzone`.
 * - Affiche les fichiers en attente sous forme de chips supprimables.
 *
 * La logique d'upload est laissée à l'appelant via `onAttach(files)` —
 * /chat upload vers Storage `chat-uploads`, /dev injecte dans la sandbox VFS.
 */
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Paperclip, X, FileText, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PendingAttachment = {
  id: string;
  name: string;
  kind: "image" | "text" | "binary";
  size: number;
  /** Mis à jour pendant l'upload async. */
  status: "uploading" | "ready" | "error";
  /** URL publique (image upload) OU chemin VFS (sandbox) OU undefined si texte injecté inline. */
  ref?: string;
  error?: string;
};

const MAX_SIZE = 50 * 1024 * 1024; // 50MB par défaut (route via Storage si >5MB)
const MAX_SIZE_ZIP = 200 * 1024 * 1024; // 200MB pour archives .zip (via Storage)
/** Au-delà de ce seuil, on bypass le base64 et on passe par Lovable Cloud Storage. */
export const STORAGE_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB
const TEXT_EXT = /\.(txt|md|markdown|mdx|csv|tsv|json|jsonc|json5|log|yml|yaml|xml|html|htm|css|scss|sass|less|js|mjs|cjs|ts|tsx|jsx|vue|svelte|astro|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|fish|ps1|sql|graphql|gql|toml|ini|cfg|conf|env|properties|lock|webmanifest|map|prisma|dockerfile|gitignore|gitattributes|npmrc|nvmrc|prettierrc|prettierignore|eslintrc|eslintignore|editorconfig|babelrc|browserslistrc|patch|diff|d\.ts)$/i;
const TEXT_FILENAMES = /^(dockerfile|makefile|procfile|readme|license|changelog|\.env(\..+)?|\.gitignore|\.gitattributes|\.npmrc|\.nvmrc|\.prettierrc|\.prettierignore|\.eslintrc|\.editorconfig|\.babelrc|\.browserslistrc)$/i;

export function classifyFile(file: File): PendingAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    file.type === "application/javascript" ||
    file.type === "application/typescript" ||
    TEXT_EXT.test(file.name) ||
    TEXT_FILENAMES.test(file.name)
  ) {
    return "text";
  }
  return "binary";
}

interface AttachButtonProps {
  onPick: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  accept?: string;
}

export function AttachButton({ onPick, disabled, className, accept }: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title="Joindre un fichier ou une image"
        aria-label="Joindre un fichier"
        className={cn(
          "shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
          className,
        )}
      >
        <Paperclip className="h-4 w-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept ?? "*/*"}
        className="hidden"
        onChange={(e) => {
          const list = e.target.files;
          if (!list || list.length === 0) return;
          onPick(Array.from(list));
          e.target.value = "";
        }}
      />
    </>
  );
}

/**
 * Wrapper qui transforme son enfant en zone de drop. Affiche un overlay quand
 * un fichier est en train d'être glissé au-dessus.
 */
export function DropZone({
  onDrop,
  children,
  disabled,
  className,
}: {
  onDrop: (files: File[]) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [isOver, setIsOver] = useState(false);
  const depth = useRef(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (disabled) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    depth.current += 1;
    setIsOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setIsOver(false);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e: DragEvent) => {
    if (disabled) return;
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, [disabled]);

  const handleDrop = useCallback((e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    depth.current = 0;
    setIsOver(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) onDrop(files);
  }, [disabled, onDrop]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn("relative", className)}
    >
      {children}
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Paperclip className="h-8 w-8" />
            <span className="text-sm font-medium">Déposez vos fichiers ici</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {items.map((a) => (
        <div
          key={a.id}
          className={cn(
            "group flex max-w-[200px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
            a.status === "error"
              ? "border-destructive/50 bg-destructive/10 text-destructive"
              : "border-border/50 bg-secondary/40 text-foreground",
          )}
          title={a.error ?? a.name}
        >
          {a.status === "uploading" ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          ) : a.kind === "image" ? (
            <ImageIcon className="h-3 w-3 shrink-0 text-glow-blue" />
          ) : (
            <FileText className="h-3 w-3 shrink-0 text-glow-violet" />
          )}
          <span className="flex-1 truncate">{a.name}</span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            className="opacity-50 transition-opacity hover:opacity-100"
            aria-label={`Retirer ${a.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function validateFile(file: File): string | null {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
  const limit = isZip ? MAX_SIZE_ZIP : MAX_SIZE;
  if (file.size > limit) {
    const mb = (limit / 1024 / 1024).toFixed(0);
    return `${file.name} dépasse ${mb} Mo`;
  }
  if (file.size === 0) return `${file.name} est vide`;
  return null;
}

/** Lit un fichier texte en string (UTF-8). */
export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsText(file);
  });
}

/** Lit un fichier binaire en dataURL base64. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(file);
  });
}

export function makeAttachmentId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
