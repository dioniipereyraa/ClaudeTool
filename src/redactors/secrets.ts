interface SecretPattern {
  readonly name: string;
  readonly regex: RegExp;
}

const PATTERNS: readonly SecretPattern[] = [
  { name: 'anthropic', regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'openai', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'github-classic', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'github-fine', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
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
