import {
  type ChatGptConversation,
  type ChatGptMappingNode,
  type ChatGptMessage,
} from './schema.js';

/**
 * ChatGPT stores conversations as a tree, not a linear list. Each node
 * in `conversation.mapping` has a `parent` and `children`, and
 * `current_node` points to the leaf of the *active* branch — the one
 * the user is actually looking at when they hit "Export".
 *
 * Branching happens whenever the user regenerates a response or edits
 * a prompt: ChatGPT keeps the old branch around so you can scroll
 * back to it. For the import we follow the active branch only — this
 * is what the user sees in the UI and what they expect to see in the
 * exported Markdown.
 *
 * Walking the tree:
 *   1. Start at `current_node`.
 *   2. Walk up via `parent` until we hit a node with `parent === null`
 *      (the root). The root is a synthetic system node with no message.
 *   3. Reverse the collected nodes so we read them top-to-bottom.
 *   4. Drop nodes whose `message` is null/missing (synthetic roots,
 *      placeholder nodes that ChatGPT inserts for tool plumbing).
 *
 * Returns an empty array if the tree is malformed (cycle, dangling
 * parent ref, missing current_node) — callers can detect this and
 * surface a warning.
 */
export function activeBranchMessages(conversation: ChatGptConversation): ChatGptMessage[] {
  const nodes: ChatGptMessage[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined = conversation.current_node;

  // Hard cap on traversal depth as a safety belt against cycles even
  // though `visited` would also catch them. ChatGPT conversations
  // beyond this length are rare and not worth bending over backwards.
  const HARD_CAP = 50_000;
  let steps = 0;

  while (cursor !== undefined && cursor !== null && steps < HARD_CAP) {
    if (visited.has(cursor)) return []; // cycle — bail
    visited.add(cursor);
    steps += 1;

    // Explicit annotation: Zod 4's `z.record` inference produces a
    // circular type reference under --strict that TS gives up on and
    // implicitly widens to `any` (TS7022). Annotating the local breaks
    // the cycle and keeps the downstream property access typed.
    const node: ChatGptMappingNode | undefined = conversation.mapping[cursor];
    if (node === undefined) return []; // dangling ref — bail

    if (node.message !== null && node.message !== undefined) {
      nodes.push(node.message);
    }

    cursor = node.parent ?? undefined;
  }

  return nodes.reverse();
}

