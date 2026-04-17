export type {
  AssistantEvent,
  CompactBoundary,
  ContentBlock,
  Event,
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
  readonly model?: string;
  readonly gitBranch?: string;
  readonly turnCount: number;
  readonly firstUserText?: string;
  readonly compactCount: number;
}
