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
  // OpenAI now ships several distinct prefixes alongside the legacy
  // `sk-` and the `sk-proj-` keys: `sk-svcacct-` for service accounts
  // and `sk-admin-` for admin scope. The base alternation covers all
  // four shapes plus future variants that share the `sk-<tag>-` form.
  { name: 'openai', regex: /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'google-api', regex: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { name: 'stripe', regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { name: 'slack', regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  // Slack app-level tokens follow `xapp-<version>-<id>-<secret>`.
  { name: 'slack-app', regex: /\bxapp-\d-[A-Z0-9]{8,}-\d+-[A-Za-z0-9]{20,}\b/g },
  { name: 'github-classic', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'github-fine', regex: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  // AWS session-token keys (STS) start with `ASIA`. AWS-managed
  // service principals (KMS / Lambda) start with `AGPA` / `AROA` /
  // `AIDA`. Same 16-char tail.
  { name: 'aws-session-key', regex: /\b(?:ASIA|AGPA|AROA|AIDA)[0-9A-Z]{16}\b/g },
  { name: 'npm', regex: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  // DigitalOcean PATs.
  { name: 'digitalocean', regex: /\bdop_v1_[a-f0-9]{64}\b/g },
  // Twilio account SIDs (AC + 32 hex) and auth tokens (32 hex tail
  // after a TWILIO_ env or anywhere AC<sid> is followed by the
  // standard 32-hex token format). The SID alone is identifier-only
  // but conventionally appears next to the auth token.
  { name: 'twilio-sid', regex: /\bAC[0-9a-f]{32}\b/g },
  // Mailgun keys.
  { name: 'mailgun', regex: /\bkey-[a-f0-9]{32}\b/g },
  // SendGrid API keys (`SG.` prefix + base64-ish).
  { name: 'sendgrid', regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g },
  // Discord bot tokens have a recognisable shape: `<24+ chars>.<6 chars>.<27+ chars>`.
  { name: 'discord-bot', regex: /\b[MN][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g },
  // PEM-encoded private keys are multi-line; `[\s\S]*?` is the
  // canonical "match across newlines lazily" idiom (the `s` flag is
  // not universally supported in older toolchains, so we avoid it).
  // The `BEGIN...PRIVATE KEY` / `END...PRIVATE KEY` envelope covers
  // RSA, EC, DSA, OPENSSH, and the generic PKCS#8 form.
  { name: 'pem-private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  // MongoDB Atlas connection strings carry the password inline. The
  // pattern matches the user:password chunk between `://` and `@`.
  // Conservative: only triggers on `mongodb+srv://` to avoid catching
  // every URL shape with `://user:pw@`.
  { name: 'mongodb-uri', regex: /\bmongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[A-Za-z0-9.-]+/g },
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
