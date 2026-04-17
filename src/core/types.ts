export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface ThinkingBlock {
  readonly type: 'thinking';
  readonly thinking: string;
}

export interface ToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

export interface ToolResultBlock {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: unknown;
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock;

export interface UserEvent {
  readonly type: 'user';
  readonly uuid: string;
  readonly parentUuid: string | null;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly cwd?: string;
  readonly gitBranch?: string;
  readonly message: {
    readonly role: 'user';
    readonly content: string | ContentBlock[];
  };
}

export interface AssistantEvent {
  readonly type: 'assistant';
  readonly uuid: string;
  readonly parentUuid: string | null;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly cwd?: string;
  readonly message: {
    readonly role: 'assistant';
    readonly model?: string;
    readonly content: ContentBlock[];
  };
}

export type Event = UserEvent | AssistantEvent;

export interface SessionMetadata {
  readonly sessionId: string;
  readonly filePath: string;
  readonly cwd?: string;
  readonly startedAt?: string;
  readonly model?: string;
  readonly gitBranch?: string;
  readonly turnCount: number;
  readonly firstUserText?: string;
}

export function isUserEvent(e: unknown): e is UserEvent {
  return isRecord(e) && e.type === 'user' && isRecord(e.message);
}

export function isAssistantEvent(e: unknown): e is AssistantEvent {
  return isRecord(e) && e.type === 'assistant' && isRecord(e.message);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
