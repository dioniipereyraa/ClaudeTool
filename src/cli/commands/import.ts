import { type Command } from 'commander';

import { formatConversation } from '../../formatters/claudeai-markdown.js';
import { readClaudeAiExport } from '../../importers/claudeai/reader.js';
import { type ClaudeAiConversation } from '../../importers/claudeai/schema.js';
import { writeSummary, writeWithPreview } from '../io.js';

interface ImportListOptions {
  readonly source: string;
}

interface ImportShowOptions {
  readonly source: string;
  readonly out?: string;
  readonly redact: boolean;
  readonly includeTools?: boolean;
  readonly includeAttachments?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
}

const PREVIEW_MAX = 60;

export function registerImport(program: Command): void {
  const importCmd = program
    .command('import')
    .description('Import conversations from an external source (claude.ai)');

  importCmd
    .command('list <zip>')
    .description('List conversations contained in a claude.ai export ZIP')
    .option(
      '--source <source>',
      'Source of the export (only "claudeai" is supported for now)',
      'claudeai',
    )
    .action(async (zipPath: string, opts: ImportListOptions) => {
      if (opts.source !== 'claudeai') {
        throw new Error(`Unsupported import source: ${opts.source}`);
      }

      const exp = await readClaudeAiExport(zipPath);

      for (const warning of exp.warnings) {
        process.stderr.write(`WARN: ${warning}\n`);
      }

      const count = exp.conversations.length;
      const label = count === 1 ? 'conversation' : 'conversations';
      process.stdout.write(`\n# claude.ai export  (${String(count)} ${label})\n\n`);

      const sorted = [...exp.conversations].sort(compareByCreatedDesc);
      for (const conv of sorted) {
        const date = conv.created_at.slice(0, 10);
        const messages = conv.chat_messages.length;
        const name = truncate(conv.name.length > 0 ? conv.name : '(untitled)', PREVIEW_MAX);
        process.stdout.write(
          `  ${conv.uuid}  [${date}] messages=${String(messages)}  ${name}\n`,
        );
      }
    });

  importCmd
    .command('show <zip> <conversationId>')
    .description('Render one conversation from a claude.ai export ZIP as Markdown')
    .option(
      '--source <source>',
      'Source of the export (only "claudeai" is supported for now)',
      'claudeai',
    )
    .option('--out <file>', 'Write to file instead of stdout')
    .option('--no-redact', 'Disable redaction (not recommended)')
    .option('--include-tools', 'Render tool_use and tool_result blocks as collapsibles')
    .option(
      '--include-attachments',
      'Render attachments (extracted_content) as collapsible blocks',
    )
    .option('-y, --yes', 'Skip the interactive preview prompt (for CI / scripting)')
    .option('-f, --force', 'Overwrite the output file if it already exists')
    .action(async (zipPath: string, conversationId: string, opts: ImportShowOptions) => {
      if (opts.source !== 'claudeai') {
        throw new Error(`Unsupported import source: ${opts.source}`);
      }

      const exp = await readClaudeAiExport(zipPath);
      for (const warning of exp.warnings) {
        process.stderr.write(`WARN: ${warning}\n`);
      }

      const conversation = findConversation(exp.conversations, conversationId);
      if (conversation === undefined) {
        throw new Error(
          `Conversation not found in ZIP: ${conversationId}. Run 'exportal import list <zip>' to see available IDs.`,
        );
      }

      const { markdown, report } = formatConversation(conversation, {
        redact: opts.redact,
        ...(opts.includeTools === true && { includeTools: true }),
        ...(opts.includeAttachments === true && { includeAttachments: true }),
      });

      if (opts.out === undefined) {
        process.stdout.write(markdown);
        writeSummary(report, !opts.redact);
        return;
      }

      await writeWithPreview(markdown, report, {
        out: opts.out,
        redact: opts.redact,
        ...(opts.yes === true && { yes: true }),
        ...(opts.force === true && { force: true }),
      });
    });
}

function findConversation(
  conversations: readonly ClaudeAiConversation[],
  id: string,
): ClaudeAiConversation | undefined {
  // Exact match first, then a unique prefix match — lets the user paste
  // the shortened UUID they saw in `import list` output.
  const exact = conversations.find((c) => c.uuid === id);
  if (exact !== undefined) return exact;
  const prefix = conversations.filter((c) => c.uuid.startsWith(id));
  if (prefix.length === 1) return prefix[0];
  return undefined;
}

function compareByCreatedDesc(a: ClaudeAiConversation, b: ClaudeAiConversation): number {
  if (a.created_at === b.created_at) return 0;
  return a.created_at < b.created_at ? 1 : -1;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
