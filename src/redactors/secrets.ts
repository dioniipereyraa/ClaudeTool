interface SecretPattern {
  readonly name: string;
  readonly regex: RegExp;
}

// Coverage extends to the most common secret formats users mention in
// AI chats: cloud APIs (Anthropic, OpenAI, Google), payments (Stripe),
// chat ops (Slack), DevOps (GitHub PATs, AWS keys, NPM, PEM). Each
// pattern is anchored on a distinctive prefix to keep false positives
// negligible — generic bearer tokens / JWTs / 40-char base64 strings
// are deliberately NOT included (too high a FP rate to be useful).
const PATTERNS: readonly SecretPattern[] = [
  { name: 'anthropic', regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'openai', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'google-api', regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: 'stripe', regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { name: 'slack', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'github-classic', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'github-fine', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'npm', regex: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  // PEM-encoded private keys are multi-line; `[\s\S]*?` is the
  // canonical "match across newlines lazily" idiom (the `s` flag is
  // not universally supported in older toolchains, so we avoid it).
  // The `BEGIN...PRIVATE KEY` / `END...PRIVATE KEY` envelope covers
  // RSA, EC, DSA, OPENSSH, and the generic PKCS#8 form.
  { name: 'pem-private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
];

export interface SecretRedactionResult {
  readonly text: string;
  readonly redactedCount: number;
  readonly byType: Readonly<Record<string, number>>;
}

/**
 * Replace known secret patterns with `<REDACTED:name>`.
 *
 * Coverage is intentionally narrow: we match well-known prefixes with
 * conservative length checks to keep false positives low. Not a substitute
 * for the user reading the preview before sharing an export.
 */
export function redactSecrets(text: string): SecretRedactionResult {
  const byType: Record<string, number> = {};
  let redactedCount = 0;
  let result = text;
  for (const { name, regex } of PATTERNS) {
    result = result.replace(regex, () => {
      byType[name] = (byType[name] ?? 0) + 1;
      redactedCount += 1;
      return `<REDACTED:${name}>`;
    });
  }
  return { text: result, redactedCount, byType };
}
