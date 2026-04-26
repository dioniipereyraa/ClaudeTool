import { z } from 'zod';

/**
 * Zod schemas for ChatGPT's official export — the ZIP that arrives by
 * email after Settings → Data controls → Export. The interesting file
 * is `conversations.json`: a top-level array of conversations, each one
 * a tree of message nodes addressed by stable UUID keys (the `mapping`
 * object) with `parent` / `children` pointers.
 *
 * Unlike the claude.ai schema (which uses `.passthrough()` on every
 * object), these schemas use the default `strip` behavior: unknown
 * fields are dropped after parsing. This keeps inferred types clean
 * for downstream consumers (the walker, formatter, jsonl writer).
 * Forward-compat is preserved by making fields optional and typing
 * free-form payloads as `z.unknown()` — so an OpenAI-added field we
 * don't care about is silently dropped, and one we *do* care about
 * simply gets added to the schema later.
 *
 * NOTE — this is a **first-draft schema** written before having a real
 * export ZIP in hand. Field names cover the well-known shape (text
 * messages, tool calls, code interpreter, browsing) and will get
 * tightened against real data in Hito 21 once the user supplies a ZIP.
 */

const AuthorSchema = z.object({
  role: z.string(),
  name: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
});

const MessageContentSchema = z.object({
  content_type: z.string(),
  // Common to text/multimodal_text/code/execution_output
  parts: z.array(z.unknown()).optional(),
  text: z.string().optional(),
  language: z.string().optional(),
  // Browsing citations (tether_quote, tether_browsing_display)
  url: z.string().optional(),
  title: z.string().optional(),
  domain: z.string().optional(),
  tether_id: z.string().optional(),
  // Reasoning surfaces (thoughts, reasoning_recap)
  thoughts: z.array(z.unknown()).optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  // Tool/code interpreter outputs and misc
  name: z.string().optional(),
  result: z.unknown().optional(),
  assets: z.array(z.unknown()).optional(),
  response_format_name: z.string().optional(),
  source_analysis_msg_id: z.string().optional(),
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

export const ConversationsFileSchema = z.array(ConversationSchema);
export const SingleConversationSchema = ConversationSchema;

export type ChatGptAuthor = z.infer<typeof AuthorSchema>;
export type ChatGptMessageContent = z.infer<typeof MessageContentSchema>;
export type ChatGptMessage = z.infer<typeof MessageSchema>;
export type ChatGptMappingNode = z.infer<typeof MappingNodeSchema>;
export type ChatGptConversation = z.infer<typeof ConversationSchema>;

export function parseConversations(raw: unknown): ChatGptConversation[] | null {
  const result = ConversationsFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseSingleConversation(raw: unknown): ChatGptConversation | null {
  const result = SingleConversationSchema.safeParse(raw);
  return result.success ? result.data : null;
}
