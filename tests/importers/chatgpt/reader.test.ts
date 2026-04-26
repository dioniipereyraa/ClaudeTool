import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readChatGptExport } from '../../../src/importers/chatgpt/reader.js';

const sampleConversation = {
  conversation_id: 'c-1',
  title: 'Sample',
  create_time: 1_700_000_000,
  current_node: 'a1',
  mapping: {
    root: { id: 'root', parent: null, children: ['u1'], message: null },
    u1: {
      id: 'u1',
      parent: 'root',
      children: ['a1'],
      message: {
        id: 'u1',
        author: { role: 'user' as const },
        content: { content_type: 'text', parts: ['hi'] },
      },
    },
    a1: {
      id: 'a1',
      parent: 'u1',
      children: [],
      message: {
        id: 'a1',
        author: { role: 'assistant' as const },
        content: { content_type: 'text', parts: ['hello'] },
      },
    },
  },
};

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'exportal-chatgpt-'));
});
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeZip(name: string, files: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const fullPath = join(workDir, name);
  await writeFile(fullPath, buffer);
  return fullPath;
}

describe('readChatGptExport', () => {
  it('reads the single-file form (conversations.json at root)', async () => {
    const zipPath = await writeZip('single.zip', {
      'conversations.json': JSON.stringify([sampleConversation]),
      'chat.html': '<html>ignored</html>',
    });
    const out = await readChatGptExport(zipPath);
    expect(out.conversations).toHaveLength(1);
    expect(out.conversations[0]?.title).toBe('Sample');
    expect(out.warnings).toEqual([]);
  });

  it('reads the chunked form (conversations-NNN.json) and merges in name order', async () => {
    const convA = { ...sampleConversation, conversation_id: 'c-a', title: 'A' };
    const convB = { ...sampleConversation, conversation_id: 'c-b', title: 'B' };
    const convC = { ...sampleConversation, conversation_id: 'c-c', title: 'C' };
    const zipPath = await writeZip('chunked.zip', {
      // Out-of-order on purpose to verify the sort.
      'conversations-002.json': JSON.stringify([convC]),
      'conversations-000.json': JSON.stringify([convA]),
      'conversations-001.json': JSON.stringify([convB]),
      'export_manifest.json': JSON.stringify({ version: 1 }),
    });
    const out = await readChatGptExport(zipPath);
    expect(out.conversations).toHaveLength(3);
    expect(out.conversations.map((c) => c.title)).toEqual(['A', 'B', 'C']);
  });

  it('prefers conversations.json over chunks if both somehow exist', async () => {
    const zipPath = await writeZip('mixed.zip', {
      'conversations.json': JSON.stringify([{ ...sampleConversation, title: 'singular' }]),
      'conversations-000.json': JSON.stringify([{ ...sampleConversation, title: 'chunked' }]),
    });
    const out = await readChatGptExport(zipPath);
    expect(out.conversations).toHaveLength(1);
    expect(out.conversations[0]?.title).toBe('singular');
  });

  it('throws with a clear message when neither layout is present', async () => {
    const zipPath = await writeZip('empty.zip', {
      'chat.html': '<html>only the viewer</html>',
    });
    await expect(readChatGptExport(zipPath)).rejects.toThrow(/conversations\.json/);
  });

  it('records a warning and continues if one chunk is malformed JSON', async () => {
    const zipPath = await writeZip('partial.zip', {
      'conversations-000.json': JSON.stringify([sampleConversation]),
      'conversations-001.json': '{not valid json',
    });
    const out = await readChatGptExport(zipPath);
    expect(out.conversations).toHaveLength(1);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/conversations-001\.json/);
  });

  it('throws when every chunk fails to parse', async () => {
    const zipPath = await writeZip('all-bad.zip', {
      'conversations-000.json': '{not valid',
      'conversations-001.json': '{also bad',
    });
    await expect(readChatGptExport(zipPath)).rejects.toThrow(/Could not parse/);
  });
});
