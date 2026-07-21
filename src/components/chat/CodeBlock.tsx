import { useState, type ReactNode } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";

SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
import { Check, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
  onApply?: (code: string, language: string) => void;
};

/**
 * Premium code block renderer for Elena messages.
 * - Syntax highlighting via Prism (oneDark theme, matches Nexyra dark UI).
 * - Copy button (clipboard).
 * - Apply button (calls onApply if provided, else informs user no file is open).
 *
 * Inline code (`like this`) is rendered as a small chip — no toolbar.
 */
export function CodeBlock({ inline, className, children, onApply }: Props) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className ?? "");
  const language = match?.[1] ?? "text";

  if (inline) {
    return (
      <code className="rounded bg-white/5 px-1.5 py-0.5 text-[0.85em] text-glow-blue">
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copié");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible");
    }
  };

  const handleApply = () => {
    if (onApply) {
      onApply(code, language);
      toast.success("Code appliqué dans l'éditeur");
    } else {
      toast.info("Ouvre un fichier dans l'éditeur pour appliquer (bientôt dispo)");
    }
  };

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border border-white/10 bg-[#1e1e2e]">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-white/5 hover:text-glow-violet"
            title="Appliquer dans l'éditeur"
          >
            <Wand2 className="h-3 w-3" />
            Appliquer
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-white/5 hover:text-glow-blue"
            title="Copier"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "0.85rem 1rem",
          background: "transparent",
          fontSize: "0.78rem",
          lineHeight: 1.55,
        }}
        codeTagProps={{ style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
