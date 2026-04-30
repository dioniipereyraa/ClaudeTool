interface PiiPattern {
  readonly name: string;
  readonly regex: RegExp;
}

// PII patterns the user can opt into via the CLI `--redact-pii` flag.
// Coverage is intentionally narrow: only formats with low false-positive
// rates and clear personal-data signal. Generic names, phone numbers
// in arbitrary formats, and street addresses are out of scope; their
// detection is a research problem, not a regex problem.
const PATTERNS: readonly PiiPattern[] = [
  // RFC 5322-lite. Requires a TLD of two or more letters and bounds
  // both ends with non-token chars to avoid eating into surrounding
  // markup. Catches the everyday `name@example.com` and skips
  // edge cases like quoted local parts (rare in chat).
  {
    name: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // IPv4 dotted quad. 0-255 per octet. Strict enough to avoid hitting
  // version strings like `1.2.3.4` falsely (it would match those, but
  // version strings inside a chat are usually fine to redact too).
  {
    name: 'ipv4',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  },
  // IPv6 in canonical (8 groups of 1-4 hex) or shortened form (`::`).
  // Conservative: requires at least one colon and a hex chunk on each
  // side, so a stray `::1` in a code block does match (acceptable).
  {
    name: 'ipv6',
    regex: /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b|\b::(?:[A-Fa-f0-9]{1,4})\b/g,
  },
];

export interface PiiRedactionResult {
  readonly text: string;
  readonly redactedCount: number;
  readonly byType: Readonly<Record<string, number>>;
}

/**
 * Replace PII patterns (email, IPv4, IPv6) with `<REDACTED:type>`.
 *
 * Opt-in via `--redact-pii` in the CLI. Not enabled in the extension
 * by default; if a user wants PII redaction during VS Code imports,
 * we can add a setting later. The narrow scope is documented in
 * SECURITY.md.
 */
export function redactPii(text: string): PiiRedactionResult {
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
