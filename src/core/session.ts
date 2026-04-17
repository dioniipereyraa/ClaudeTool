import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { PROJECTS_DIR } from './paths.js';
import { readJsonl } from './reader.js';
import { isAssistantEvent, isUserEvent, type ContentBlock, type SessionMetadata } from './types.js';

export async function listProjectDirs(): Promise<string[]> {
  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listSessionFiles(projectDir: string): Promise<string[]> {
  const full = join(PROJECTS_DIR, projectDir);
  try {
    const entries = await readdir(full);
    return entries.filter((f) => f.endsWith('.jsonl')).map((f) => join(full, f));
  } catch {
    return [];
  }
}

export async function describeSession(filePath: string): Promise<SessionMetadata> {
  const events = await readJsonl(filePath);
  const sessionId = basename(filePath).replace(/\.jsonl$/, '');

  let cwd: string | undefined;
  let startedAt: string | undefined;
  let model: string | undefined;
  let gitBranch: string | undefined;
  let firstUserText: string | undefined;
  let turnCount = 0;

  for (const event of events) {
    if (isUserEvent(event)) {
      turnCount += 1;
      cwd ??= event.cwd;
      startedAt ??= event.timestamp;
      gitBranch ??= event.gitBranch;
      firstUserText ??= firstText(event.message.content);
    } else if (isAssistantEvent(event)) {
      model ??= event.message.model;
    }
  }

  return {
    sessionId,
    filePath,
    ...(cwd !== undefined && { cwd }),
    ...(startedAt !== undefined && { startedAt }),
    ...(model !== undefined && { model }),
    ...(gitBranch !== undefined && { gitBranch }),
    turnCount,
    ...(firstUserText !== undefined && { firstUserText }),
  };
}

function firstText(content: string | ContentBlock[]): string | undefined {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  for (const block of content) {
    if (block.type === 'text') {
      const trimmed = block.text.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}
