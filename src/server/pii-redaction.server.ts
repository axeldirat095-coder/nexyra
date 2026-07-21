/**
 * Axe G — PII redaction middleware (RGPD).
 *
 * Détecte et masque les données personnelles avant de les envoyer aux LLM
 * tiers (OpenAI / DeepSeek). Best-effort, regex-based — ne remplace pas un
 * audit RGPD complet mais coupe la majorité des leaks accidentels.
 *
 * Patterns couverts : email, téléphone FR/international, IBAN, carte
 * bancaire (Luhn-like), clés API (sk-..., ghp_..., xoxb-..., AKIA...),
 * Bearer tokens.
 */

export type PIIKind =
  | "email"
  | "phone"
  | "iban"
  | "credit_card"
  | "api_key"
  | "bearer_token";

export type PIIFinding = { kind: PIIKind; count: number };

export type RedactionResult = {
  redacted: string;
  findings: PIIFinding[];
  hasPII: boolean;
};

const PATTERNS: Array<{ kind: PIIKind; re: RegExp; label: string }> = [
  // Email
  { kind: "email", label: "EMAIL", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // API keys courantes (avant phone car les bearer tokens contiennent souvent des chiffres)
  { kind: "api_key", label: "API_KEY", re: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g },
  { kind: "bearer_token", label: "BEARER", re: /\bBearer\s+[A-Za-z0-9._\-/+=]{20,}\b/g },
  // IBAN (FR + intl, 15-34 chars)
  { kind: "iban", label: "IBAN", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  // Carte bancaire (13-19 chiffres avec espaces/tirets optionnels)
  { kind: "credit_card", label: "CARD", re: /\b(?:\d[ -]?){13,19}\b/g },
  // Téléphone : intl (+33...), FR (0X XX XX XX XX), US (XXX-XXX-XXXX)
  { kind: "phone", label: "PHONE", re: /(?:\+\d{1,3}[ .-]?)?(?:\(?\d{1,4}\)?[ .-]?){2,4}\d{2,4}/g },
];

/**
 * Redact PII from a string. Returns the masked text + findings list.
 * `text` est laissé intact si rien n'est détecté (économie d'allocation).
 */
export function redactPII(text: string): RedactionResult {
  if (!text || text.length < 3) {
    return { redacted: text, findings: [], hasPII: false };
  }
  let out = text;
  const counts = new Map<PIIKind, number>();
  for (const { kind, label, re } of PATTERNS) {
    const matches = out.match(re);
    if (!matches || matches.length === 0) continue;
    // Pour credit_card, valide vaguement avec longueur (évite faux positifs sur 13 chiffres aléatoires)
    if (kind === "credit_card") {
      const real = matches.filter((m) => {
        const digits = m.replace(/\D/g, "");
        return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
      });
      if (real.length === 0) continue;
      counts.set(kind, (counts.get(kind) ?? 0) + real.length);
      for (const m of real) out = out.split(m).join(`[REDACTED_${label}]`);
      continue;
    }
    // Pour phone, exclus les matches < 7 chiffres totaux (faux positifs sur dates/numéros)
    if (kind === "phone") {
      const real = matches.filter((m) => m.replace(/\D/g, "").length >= 7);
      if (real.length === 0) continue;
      counts.set(kind, (counts.get(kind) ?? 0) + real.length);
      for (const m of real) out = out.split(m).join(`[REDACTED_${label}]`);
      continue;
    }
    counts.set(kind, matches.length);
    out = out.replace(re, `[REDACTED_${label}]`);
  }
  const findings: PIIFinding[] = Array.from(counts.entries()).map(([kind, count]) => ({ kind, count }));
  return { redacted: out, findings, hasPII: findings.length > 0 };
}

function luhnCheck(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
