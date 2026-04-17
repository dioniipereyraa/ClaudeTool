import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readClaudeAiExport } from '../../../src/importers/claudeai/reader.js';

interface ZipEntry {
  readonly name: string;
  readonly content: string;
}

async function buildZip(entries: readonly ZipEntry[], dir: string, filename: string): Promise<string> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.content);
  }
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const zipPath = join(dir, filename);
  await writeFile(zipPath, bytes);
  return zipPath;
}

const oneConversation = [
  {
    uuid: 'conv-1',
    name: 'Conversación de prueba',
    created_at: '2026-01-10T12:00:00Z',
    chat_messages: [
      {
        uuid: 'm1',
        sender: 'human',
        created_at: '2026-01-10T12:00:01Z',
        content: [{ type: 'text', text: 'hola' }],
      },
    ],
  },
];

describe('readClaudeAiExport', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'exportal-reader-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('parses a ZIP with all four JSON files', async () => {
    const zipPath = await buildZip(
      [
        { name: 'conversations.json', content: JSON.stringify(oneConversation) },
        { name: 'users.json', content: JSON.stringify([{ uuid: 'u1', full_name: 'Dio' }]) },
        {
          name: 'memories.json',
          content: JSON.stringify([{ conversations_memory: 'resumen' }]),
        },
        { name: 'projects.json', content: JSON.stringify([{ uuid: 'p1', name: 'Proj' }]) },
      ],
      workDir,
      'full.zip',
    );

    const exp = await readClaudeAiExport(zipPath);
    expect(exp.conversations.length).toBe(1);
    expect(exp.users?.[0]?.uuid).toBe('u1');
    expect(exp.memories?.[0]?.conversations_memory).toBe('resumen');
    expect(exp.projects?.[0]?.uuid).toBe('p1');
    expect(exp.warnings.length).toBe(0);
  });

  it('returns warnings (not errors) when optional files are missing', async () => {
    const zipPath = await buildZip(
      [{ name: 'conversations.json', content: JSON.stringify(oneConversation) }],
      workDir,
      'only-conversations.zip',
    );

    const exp = await readClaudeAiExport(zipPath);
    expect(exp.conversations.length).toBe(1);
    expect(exp.users).toBeUndefined();
    expect(exp.memories).toBeUndefined();
    expect(exp.projects).toBeUndefined();
    expect(exp.warnings.length).toBe(3);
    expect(exp.warnings.some((w) => w.includes('users.json'))).toBe(true);
  });

  it('returns warnings when optional files have invalid JSON', async () => {
    const zipPath = await buildZip(
      [
        { name: 'conversations.json', content: JSON.stringify(oneConversation) },
        { name: 'users.json', content: 'not valid json' },
      ],
      workDir,
      'bad-users.zip',
    );

    const exp = await readClaudeAiExport(zipPath);
    expect(exp.conversations.length).toBe(1);
    expect(exp.users).toBeUndefined();
    expect(exp.warnings.some((w) => w.includes('users.json'))).toBe(true);
  });

  it('returns warnings when optional files fail schema validation', async () => {
    const zipPath = await buildZip(
      [
        { name: 'conversations.json', content: JSON.stringify(oneConversation) },
        { name: 'users.json', content: JSON.stringify([{ full_name: 'missing uuid' }]) },
      ],
      workDir,
      'bad-schema-users.zip',
    );

    const exp = await readClaudeAiExport(zipPath);
    expect(exp.users).toBeUndefined();
    expect(
      exp.warnings.some((w) => w.includes('users.json') && w.includes('schema')),
    ).toBe(true);
  });

  it('throws when conversations.json is missing', async () => {
    const zipPath = await buildZip(
      [{ name: 'users.json', content: JSON.stringify([{ uuid: 'u1' }]) }],
      workDir,
      'no-conversations.zip',
    );

    await expect(readClaudeAiExport(zipPath)).rejects.toThrow(/conversations\.json is missing/);
  });

  it('throws when conversations.json fails schema validation', async () => {
    const zipPath = await buildZip(
      [{ name: 'conversations.json', content: JSON.stringify([{ uuid: 'broken' }]) }],
      workDir,
      'broken-conversations.zip',
    );

    await expect(readClaudeAiExport(zipPath)).rejects.toThrow(/schema validation/);
  });

  it('throws when conversations.json is not valid JSON', async () => {
    const zipPath = await buildZip(
      [{ name: 'conversations.json', content: '{{{ not json' }],
      workDir,
      'broken-json.zip',
    );

    await expect(readClaudeAiExport(zipPath)).rejects.toThrow(/is missing|schema validation/);
  });

  it('preserves unknown fields via passthrough', async () => {
    const convWithFuture = [
      {
        ...oneConversation[0],
        future_field: 'preserved',
        chat_messages: [
          {
            uuid: 'm1',
            sender: 'human',
            created_at: '2026-01-10T12:00:01Z',
            content: [{ type: 'text', text: 'x' }],
            another_future: 42,
          },
        ],
      },
    ];
    const zipPath = await buildZip(
      [{ name: 'conversations.json', content: JSON.stringify(convWithFuture) }],
      workDir,
      'future.zip',
    );

    const exp = await readClaudeAiExport(zipPath);
    expect((exp.conversations[0] as unknown as { future_field: string }).future_field).toBe(
      'preserved',
    );
  });
});
