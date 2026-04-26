import { z } from 'zod';

/**
 * Zod schemas for Claude Code's .jsonl events.
 *
 * The format is not officially documented, so every object schema is
 * `passthrough()`: unknown fields survive unchanged, and new event fields
 * introduced by Claude Code updates won't invalidate known events.
 *
 * Unknown event types (e.g. `queue-operation`, `attachment`, `system` events
 * with subtypes we don't handle) are parsed as `null` by `parseEvent` and
 * dropped at the reader boundary. This keeps the exporter resilient.
 */

const TextBlockSchema = z
  .object({ type: z.literal('text'), text: z.string() })
  .passthrough();

const ThinkingBlockSchema = z
  .object({ type: z.literal('thinking'), thinking: z.string() })
  .passthrough();

const ToolUseBlockSchema = z
  .object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  })
  .passthrough();

const ToolResultBlockSchema = z
  .object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.unknown(),
  })
  .passthrough();

const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ThinkingBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
]);

const UserEventSchema = z
  .object({
    type: z.literal('user'),
    uuid: z.string(),
    parentUuid: z.string().nullable(),
    timestamp: z.string(),
    sessionId: z.string(),
    cwd: z.string().optional(),
    gitBranch: z.string().optional(),
    isCompactSummary: z.boolean().optional(),
    message: z
      .object({
        role: z.literal('user'),
        content: z.union([z.string(), z.array(ContentBlockSchema)]),
      })
      .passthrough(),
  })
  .passthrough();

const AssistantEventSchema = z
  .object({
    type: z.literal('assistant'),
    uuid: z.string(),
    parentUuid: z.string().nullable(),
    timestamp: z.string(),
    sessionId: z.string(),
    cwd: z.string().optional(),
    message: z
      .object({
        role: z.literal('assistant'),
        model: z.string().optional(),
        content: z.array(ContentBlockSchema),
      })
      .passthrough(),
  })
  .passthrough();

const CompactMetadataSchema = z
  .object({
    trigger: z.enum(['auto', 'manual']).optional(),
    preTokens: z.number().optional(),
    preCompactDiscoveredTools: z.array(z.string()).optional(),
  })
  .passthrough();

const SystemEventSchema = z
  .object({
    type: z.literal('system'),
    uuid: z.string(),
    parentUuid: z.string().nullable(),
    timestamp: z.string(),
    subtype: z.string().optional(),
    content: z.string().optional(),
    compactMetadata: CompactMetadataSchema.optional(),
  })
  .passthrough();

// Sidecar metadata events that Claude Code writes alongside the
// content events in the .jsonl. They carry no message body — just
// session-level metadata that the UI uses to label and sort sessions.
// Prior to recognising these here, the reader silently dropped them.

const AiTitleEventSchema = z
  .object({
    type: z.literal('ai-title'),
    sessionId: z.string(),
    aiTitle: z.string(),
  })
  .passthrough();

const CustomTitleEventSchema = z
  .object({
    type: z.literal('custom-title'),
    sessionId: z.string(),
    customTitle: z.string(),
  })
  .passthrough();

const LastPromptEventSchema = z
  .object({
    type: z.literal('last-prompt'),
    sessionId: z.string(),
    lastPrompt: z.string(),
  })
  .passthrough();

const EventSchema = z.discriminatedUnion('type', [
  UserEventSchema,
  AssistantEventSchema,
  SystemEventSchema,
  AiTitleEventSchema,
  CustomTitleEventSchema,
  LastPromptEventSchema,
]);

export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ThinkingBlock = z.infer<typeof ThinkingBlockSchema>;
export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;
export type ToolResultBlock = z.infer<typeof ToolResultBlockSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export type UserEvent = z.infer<typeof UserEventSchema>;
export type AssistantEvent = z.infer<typeof AssistantEventSchema>;
export type SystemEvent = z.infer<typeof SystemEventSchema>;
export type AiTitleEvent = z.infer<typeof AiTitleEventSchema>;
export type CustomTitleEvent = z.infer<typeof CustomTitleEventSchema>;
export type LastPromptEvent = z.infer<typeof LastPromptEventSchema>;
export type Event = z.infer<typeof EventSchema>;

export type CompactBoundary = SystemEvent & { subtype: 'compact_boundary' };

/**
 * Validate a raw value against the event schema.
 * Returns the typed event on success, `null` on any validation failure.
 */
export function parseEvent(raw: unknown): Event | null {
  const result = EventSchema.safeParse(raw);
  return result.success ? result.data : null;
}
