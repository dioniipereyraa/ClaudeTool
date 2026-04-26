// Inspect a ChatGPT export ZIP and print structural counts only —
// no message text, no titles, no user IDs, no anything that could
// leak content. Designed to share back so we can prioritize schema
// adjustments for the import path without seeing the user's data.
//
// Usage:
//   node scripts/chatgpt-shape-report.mjs path/to/your-export.zip
//
// What it counts:
//   - conversation count, message count
//   - unique content_type values + frequency
//   - unique author.role values + frequency
//   - tool-routed assistant messages (recipient !== 'all') by recipient
//   - branching: nodes with 2+ children (regenerated replies)
//   - presence of gizmo_id (custom GPTs)
//   - top-level keys present on conversation/message/content objects
//
// All numeric/structural — no strings from your chats are emitted.

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

import JSZip from 'jszip';

const path = argv[2];
if (!path) {
  console.error('Usage: node scripts/chatgpt-shape-report.mjs <path-to-zip>');
  exit(1);
}

const buf = await readFile(path);
const zip = await JSZip.loadAsync(buf);

// First, list what's actually in the zip — useful when conversations.json
// isn't at the expected location. Names only, no content.
const entries = Object.entries(zip.files)
  .filter(([, e]) => !e.dir)
  .map(([p]) => p)
  .sort();
console.log(`# Zip contains ${entries.length} files`);
console.log('## First 20 file paths:');
for (const p of entries.slice(0, 20)) {
  console.log(`- ${p}`);
}
if (entries.length > 20) {
  console.log(`... (+${entries.length - 20} more)`);
}
console.log('');

// Tolerant lookup — case-insensitive, accepts files inside any
// subfolder (some exports nest under <export-name>/).
function findEntry(zip, basename) {
  const target = basename.toLowerCase();
  for (const [p, e] of Object.entries(zip.files)) {
    if (e.dir) continue;
    const last = p.split('/').pop();
    if (last?.toLowerCase() === target) return e;
  }
  return null;
}

// Big accounts get the data split across `conversations-000.json`,
// `conversations-001.json`, etc. (sorted by index). Small accounts
// get a single `conversations.json` at the root. Try both.
function findConversationFiles(zip) {
  const single = findEntry(zip, 'conversations.json');
  if (single !== null) return [single];
  const chunks = [];
  for (const [p, e] of Object.entries(zip.files)) {
    if (e.dir) continue;
    const last = p.split('/').pop()?.toLowerCase();
    if (last && /^conversations-\d+\.json$/.test(last)) {
      chunks.push(e);
    }
  }
  chunks.sort((a, b) => a.name.localeCompare(b.name));
  return chunks;
}

// Peek at the manifest if present — metadata only (no chat content).
const manifestEntry = findEntry(zip, 'export_manifest.json');
if (manifestEntry !== null) {
  console.log(`# export_manifest.json found at: ${manifestEntry.name}`);
  try {
    const m = JSON.parse(await manifestEntry.async('string'));
    console.log('## manifest (top-level keys):');
    for (const k of Object.keys(m)) {
      const v = m[k];
      const summary = Array.isArray(v) ? `array[${v.length}]`
        : typeof v === 'object' && v !== null ? `object{${Object.keys(v).length}}`
        : typeof v;
      console.log(`- ${k}: ${summary}`);
    }
  } catch {
    console.log('(could not parse manifest)');
  }
  console.log('');
}

const conversationFiles = findConversationFiles(zip);
if (conversationFiles.length === 0) {
  console.error('No conversations.json or conversations-NNN.json found in this zip.');
  exit(1);
}
console.log(`# Conversation data files: ${conversationFiles.length}`);
for (const f of conversationFiles) {
  console.log(`- ${f.name}`);
}
console.log('');

// Concatenate all chunks into one big array. Each chunk is itself an
// array of conversations (or so we assume — script will print sample
// shape if the assumption breaks).
const data = [];
for (const f of conversationFiles) {
  const text = await f.async('string');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.error(`Failed to parse ${f.name}: ${err.message}`);
    continue;
  }
  if (Array.isArray(parsed)) {
    data.push(...parsed);
  } else {
    console.log(`(note: ${f.name} top-level is ${typeof parsed}, not array — keys: ${Object.keys(parsed).join(', ')})`);
  }
}
if (data.length === 0) {
  console.error('No conversations parsed from the data files.');
  exit(1);
}

const stats = {
  conversationCount: data.length,
  messageCount: 0,
  contentTypes: new Map(),
  authorRoles: new Map(),
  recipients: new Map(),
  branchingNodes: 0,
  conversationKeys: new Set(),
  messageKeys: new Set(),
  contentKeys: new Set(),
  authorKeys: new Set(),
  hasGizmoCount: 0,
  hasModelSlugCount: 0,
  hasAttachmentsCount: 0,
  hasMultimodalContentCount: 0,
};

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

for (const conv of data) {
  if (!conv || typeof conv !== 'object') continue;
  for (const k of Object.keys(conv)) stats.conversationKeys.add(k);
  if (conv.gizmo_id) stats.hasGizmoCount++;

  const mapping = conv.mapping;
  if (!mapping || typeof mapping !== 'object') continue;
  for (const node of Object.values(mapping)) {
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node.children) && node.children.length >= 2) {
      stats.branchingNodes++;
    }
    const msg = node.message;
    if (!msg || typeof msg !== 'object') continue;
    stats.messageCount++;
    for (const k of Object.keys(msg)) stats.messageKeys.add(k);
    if (msg.metadata && typeof msg.metadata === 'object' && msg.metadata.model_slug) {
      stats.hasModelSlugCount++;
    }
    if (Array.isArray(msg.metadata?.attachments) && msg.metadata.attachments.length > 0) {
      stats.hasAttachmentsCount++;
    }
    const author = msg.author;
    if (author && typeof author === 'object') {
      for (const k of Object.keys(author)) stats.authorKeys.add(k);
      bump(stats.authorRoles, String(author.role ?? '<missing>'));
    }
    bump(stats.recipients, String(msg.recipient ?? 'all'));
    const content = msg.content;
    if (content && typeof content === 'object') {
      for (const k of Object.keys(content)) stats.contentKeys.add(k);
      bump(stats.contentTypes, String(content.content_type ?? '<missing>'));
      // Flag content with mixed (string + object) parts arrays — typical
      // of multimodal_text. We just count, don't peek inside.
      if (Array.isArray(content.parts)) {
        const hasObjectPart = content.parts.some((p) => p !== null && typeof p === 'object');
        if (hasObjectPart) stats.hasMultimodalContentCount++;
      }
    }
  }
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

console.log('# ChatGPT export shape report');
console.log('');
console.log('## Totals');
console.log(`- conversations: ${stats.conversationCount}`);
console.log(`- messages: ${stats.messageCount}`);
console.log(`- branching nodes (regenerated replies): ${stats.branchingNodes}`);
console.log(`- conversations using custom GPTs (gizmo_id): ${stats.hasGizmoCount}`);
console.log(`- messages with model_slug: ${stats.hasModelSlugCount}`);
console.log(`- messages with attachments[] in metadata: ${stats.hasAttachmentsCount}`);
console.log(`- multimodal content (parts has objects): ${stats.hasMultimodalContentCount}`);
console.log('');
console.log('## content_type frequency');
for (const [k, v] of sortedEntries(stats.contentTypes)) {
  console.log(`- ${k}: ${v}`);
}
console.log('');
console.log('## author.role frequency');
for (const [k, v] of sortedEntries(stats.authorRoles)) {
  console.log(`- ${k}: ${v}`);
}
console.log('');
console.log('## recipient frequency (assistant routing target)');
for (const [k, v] of sortedEntries(stats.recipients)) {
  console.log(`- ${k}: ${v}`);
}
console.log('');
console.log('## Top-level keys observed (no values)');
console.log(`- conversation: ${[...stats.conversationKeys].sort().join(', ')}`);
console.log(`- message: ${[...stats.messageKeys].sort().join(', ')}`);
console.log(`- message.content: ${[...stats.contentKeys].sort().join(', ')}`);
console.log(`- message.author: ${[...stats.authorKeys].sort().join(', ')}`);
