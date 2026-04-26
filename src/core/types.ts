export type {
  AiTitleEvent,
  AssistantEvent,
  CompactBoundary,
  ContentBlock,
  CustomTitleEvent,
  Event,
  LastPromptEvent,
  SystemEvent,
  TextBlock,
  ThinkingBlock,
  ToolResultBlock,
  ToolUseBlock,
  UserEvent,
} from './schema.js';

export interface SessionMetadata {
  readonly sessionId: string;
  readonly filePath: string;
  readonly cwd?: string;
  readonly startedAt?: string;
  /** Wall-clock time of the most recent activity, taken from file mtime. */
  readonly lastActiveAt?: Date;
  readonly model?: string;
  readonly gitBranch?: string;
  readonly turnCount: number;
  readonly firstUserText?: string;
  /** User-set title for the session (overrides aiTitle when shown). */
  readonly customTitle?: string;
  /** Auto-generated title written by Claude Code after a few turns. */
  readonly aiTitle?: string;
  readonly compactCount: number;
}
