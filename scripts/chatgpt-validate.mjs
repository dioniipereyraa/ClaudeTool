// Diagnostic — runs the same Zod schema we use in production against
// each conversation in the export and reports which fail and WHY.
// Output is structural (path + error message + value type), no chat
// content leaks.
//
// Usage:
//   node scripts/chatgpt-validate.mjs path/to/your-export.zip

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

import JSZip from 'jszip';

// We import the compiled extension bundle to reuse the same Zod schema
// the importer uses, so a "passes here" guarantees "passes in the
// extension". The bundle exports nothing useful directly, so we re-run
// the schema source.
import { z } from 'zod';

const path = argv[2];
if (!path) {
  console.error('Usage: node scripts/chatgpt-validate.mjs <path-to-zip>');
  exit(1);
}

// ─── Schema mirror (kept in sync with src/importers/chatgpt/schema.ts) ──

const AuthorSchema = z.object({
  role: z.string(),
  name: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
});

const MessageContentSchema = z.object({
  content_type: z.string(),
  parts: z.array(z.unknown()).nullable().optional(),
  text: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  domain: z.string().nullable().optional(),
  tether_id: z.string().nullable().optional(),
  thoughts: z.array(z.unknown()).nullable().optional(),
  summary: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  result: z.unknown().optional(),
  assets: z.array(z.unknown()).nullable().optional(),
  response_format_name: z.string().nullable().optional(),
  source_analysis_msg_id: z.string().nullable().optional(),
});

const MessageSchema = z.object({
  id: z.string(),
  author: AuthorSchema,
  create_time: z.number().nullable().optional(),
  update_time: z.number().nullable().optional(),
  content: MessageContentSchema,
  status: z.string().optional(),
  end_turn: z.boolean().nullable().optional(),
  weight: z.number().optional(),
  metadata: z.unknown().optional(),
  recipient: z.string().optional(),
  channel: z.string().nullable().optional(),
});

const MappingNodeSchema = z.object({
  id: z.string(),
  parent: z.string().nullable().optional(),
  children: z.array(z.string()),
  message: MessageSchema.nullable().optional(),
});

const ConversationSchema = z.object({
  id: z.string().optional(),
  conversation_id: z.string().optional(),
  title: z.string().nullable().optional(),
  create_time: z.number(),
  update_time: z.number().nullable().optional(),
  mapping: z.record(z.string(), MappingNodeSchema),
  current_node: z.string(),
  moderation_results: z.array(z.unknown()).optional(),
  plugin_ids: z.array(z.string()).nullable().optional(),
  conversation_template_id: z.string().nullable().optional(),
  gizmo_id: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
});

// ─── Load zip + collect data ───────────────────────────────────────────

const buf = await readFile(path);
const zip = await JSZip.loadAsync(buf);

function findConversationFiles(zip) {
  const single = zip.file('conversations.json');
  if (single !== null) return [single];
  const chunks = [];
  for (const [p, e] of Object.entries(zip.files)) {
    if (e.dir) continue;
    const last = p.split('/').pop()?.toLowerCase();
    if (last && /^conversations-\d+\.json$/.test(last)) chunks.push(e);
  }
  chunks.sort((a, b) => a.name.localeCompare(b.name));
  return chunks;
}

const dataFiles = findConversationFiles(zip);
const allConversations = [];
for (const f of dataFiles) {
  const text = await f.async('string');
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) allConversations.push(...parsed);
}

console.log(`# Validating ${allConversations.length} conversations`);
console.log('');

// ─── Per-conversation safeParse and group errors ───────────────────────

const failures = new Map(); // error path → count
let okCount = 0;

for (const conv of allConversations) {
  const result = ConversationSchema.safeParse(conv);
  if (result.success) {
    okCount++;
    continue;
  }
  for (const issue of result.error.issues) {
    const key = `${issue.path.map(p => typeof p === 'number' ? '[*]' : p).join('.')} :: ${issue.code} :: ${issue.message}`;
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
}

console.log(`## Results`);
console.log(`- ok:     ${okCount} / ${allConversations.length}`);
console.log(`- failed: ${allConversations.length - okCount}`);
console.log('');

if (failures.size > 0) {
  console.log(`## Failure groups (path + error code)`);
  const sorted = [...failures.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sorted) {
    console.log(`- (${count}x) ${key}`);
  }
  console.log('');
  console.log('# Sampling FIRST failing conversation\'s problematic fields');
  // Find the first failing one and dump just the keys + types of fields
  // that broke. No values.
  for (const conv of allConversations) {
    const result = ConversationSchema.safeParse(conv);
    if (result.success) continue;
    console.log('- conversation keys present:', Object.keys(conv).sort().join(', '));
    for (const issue of result.error.issues) {
      const path = issue.path.map(p => typeof p === 'number' ? '[*]' : p).join('.');
      // Show what type the actual value has, not the value itself.
      let actual = conv;
      for (const segment of issue.path) {
        if (actual === null || actual === undefined) break;
        actual = actual[segment];
      }
      const actualType = actual === null ? 'null'
        : Array.isArray(actual) ? 'array'
        : typeof actual;
      console.log(`  - ${path} → ${issue.code} (got: ${actualType}) :: ${issue.message}`);
    }
    break;
  }
}
