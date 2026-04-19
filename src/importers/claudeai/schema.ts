import { z } from 'zod';

/**
 * Zod schemas for the `data-*-batch-0000.zip` export that claude.ai
 * produces from Settings → Export data. The format is not officially
 * documented, so every object uses `.passthrough()`: unknown fields are
 * preserved and forward-compat is preserved when Anthropic adds new
 * keys.
 *
 * The export contains four JSON files, each one a top-level array:
 *   - users.json         → [{ uuid, full_name, email_address, ... }]
 *   - memories.json      → [{ conversations_memory, account_uuid }]
 *   - projects.json      → [Project, ...]
 *   - conversations.json → [Conversation, ...]
 */

const CitationDetailsSchema = z
  .object({ type: z.string(), url: z.string().optional() })
  .passthrough();

const CitationSchema = z
  .object({
    uuid: z.string(),
    start_index: z.number(),
    end_index: z.number(),
    details: CitationDetailsSchema,
  })
  .passthrough();

const BlockBaseShape = {
  start_timestamp: z.string().nullable().optional(),
  stop_timestamp: z.string().nullable().optional(),
  flags: z.unknown().optional(),
} as const;

const TextBlockSchema = z
  .object({
    ...BlockBaseShape,
    type: z.literal('text'),
    text: z.string(),
    citations: z.array(CitationSchema).optional(),
  })
  .passthrough();

const ToolUseBlockSchema = z
  .object({
    ...BlockBaseShape,
    type: z.literal('tool_use'),
    id: z.string().optional(),
    name: z.string(),
    input: z.unknown(),
    message: z.unknown().optional(),
    integration_name: z.string().nullable().optional(),
    integration_icon_url: z.string().nullable().optional(),
    icon_name: z.string().nullable().optional(),
    is_mcp_app: z.boolean().nullable().optional(),
    mcp_server_url: z.string().nullable().optional(),
    display_content: z.unknown().optional(),
  })
  .passthrough();

const ToolResultBlockSchema = z
  .object({
    ...BlockBaseShape,
    type: z.literal('tool_result'),
    tool_use_id: z.string().optional(),
    name: z.string().optional(),
    content: z.unknown(),
    is_error: z.boolean().optional(),
    structured_content: z.unknown().optional(),
    meta: z.unknown().optional(),
    integration_name: z.string().nullable().optional(),
    mcp_server_url: z.string().nullable().optional(),
  })
  .passthrough();

const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
]);

const AttachmentSchema = z
  .object({
    file_name: z.string(),
    file_size: z.number().optional(),
    file_type: z.string().optional(),
    extracted_content: z.string().optional(),
  })
  .passthrough();

const FileRefSchema = z
  .object({
    file_uuid: z.string(),
    file_name: z.string(),
  })
  .passthrough();

const MessageSchema = z
  .object({
    uuid: z.string(),
    text: z.string().optional(),
    content: z.array(ContentBlockSchema),
    sender: z.enum(['human', 'assistant']),
    created_at: z.string(),
    updated_at: z.string().optional(),
    attachments: z.array(AttachmentSchema).optional(),
    files: z.array(FileRefSchema).optional(),
    parent_message_uuid: z.string().nullable().optional(),
  })
  .passthrough();

const ConversationSchema = z
  .object({
    uuid: z.string(),
    name: z.string(),
    summary: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string().optional(),
    account: z.object({ uuid: z.string() }).passthrough().optional(),
    chat_messages: z.array(MessageSchema),
  })
  .passthrough();

const UserProfileSchema = z
  .object({
    uuid: z.string(),
    full_name: z.string().optional(),
    email_address: z.string().optional(),
    verified_phone_number: z.string().nullable().optional(),
  })
  .passthrough();

const MemorySchema = z
  .object({
    conversations_memory: z.string(),
    account_uuid: z.string().optional(),
  })
  .passthrough();

const ProjectDocSchema = z
  .object({
    uuid: z.string(),
    filename: z.string(),
    content: z.string(),
    created_at: z.string().optional(),
  })
  .passthrough();

const ProjectSchema = z
  .object({
    uuid: z.string(),
    name: z.string(),
    description: z.string().optional(),
    is_private: z.boolean().optional(),
    is_starter_project: z.boolean().optional(),
    prompt_template: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    creator: z.object({ uuid: z.string(), full_name: z.string().optional() }).passthrough().optional(),
    docs: z.array(ProjectDocSchema).optional(),
  })
  .passthrough();

export const ConversationsFileSchema = z.array(ConversationSchema);
export const SingleConversationSchema = ConversationSchema;
export const UsersFileSchema = z.array(UserProfileSchema);
export const MemoriesFileSchema = z.array(MemorySchema);
export const ProjectsFileSchema = z.array(ProjectSchema);

export type ClaudeAiTextBlock = z.infer<typeof TextBlockSchema>;
export type ClaudeAiToolUseBlock = z.infer<typeof ToolUseBlockSchema>;
export type ClaudeAiToolResultBlock = z.infer<typeof ToolResultBlockSchema>;
export type ClaudeAiContentBlock = z.infer<typeof ContentBlockSchema>;
export type ClaudeAiCitation = z.infer<typeof CitationSchema>;
export type ClaudeAiAttachment = z.infer<typeof AttachmentSchema>;
export type ClaudeAiFileRef = z.infer<typeof FileRefSchema>;
export type ClaudeAiMessage = z.infer<typeof MessageSchema>;
export type ClaudeAiConversation = z.infer<typeof ConversationSchema>;
export type ClaudeAiUserProfile = z.infer<typeof UserProfileSchema>;
export type ClaudeAiMemory = z.infer<typeof MemorySchema>;
export type ClaudeAiProject = z.infer<typeof ProjectSchema>;
export type ClaudeAiProjectDoc = z.infer<typeof ProjectDocSchema>;

/**
 * Parse a raw value against a top-level schema. Returns the typed value
 * on success, `null` on any validation failure.
 */
export function parseConversations(raw: unknown): ClaudeAiConversation[] | null {
  const result = ConversationsFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseSingleConversation(raw: unknown): ClaudeAiConversation | null {
  const result = SingleConversationSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseUsers(raw: unknown): ClaudeAiUserProfile[] | null {
  const result = UsersFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseMemories(raw: unknown): ClaudeAiMemory[] | null {
  const result = MemoriesFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseProjects(raw: unknown): ClaudeAiProject[] | null {
  const result = ProjectsFileSchema.safeParse(raw);
  return result.success ? result.data : null;
}
