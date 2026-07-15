export type FlowMatchType = 'equals' | 'contains';

export type FlowEdgeMatch = {
  type: FlowMatchType;
  value: string;
};

export function normalizeReplyText(value: string): string {
  return value.trim().toLowerCase();
}

export function isFlowMatchType(value: string): value is FlowMatchType {
  return value === 'equals' || value === 'contains';
}

export function replyMatchesEdge(
  replyBody: string,
  match: FlowEdgeMatch,
): boolean {
  const reply = normalizeReplyText(replyBody);
  const expected = normalizeReplyText(match.value);
  if (!expected) {
    return false;
  }
  if (match.type === 'equals') {
    return reply === expected;
  }
  return reply.includes(expected);
}

export function pickMatchingEdge<T extends { match: FlowEdgeMatch }>(
  replyBody: string,
  edges: T[],
): T | null {
  for (const edge of edges) {
    if (replyMatchesEdge(replyBody, edge.match)) {
      return edge;
    }
  }
  return null;
}

export const FLOW_STEP_CAP = 20;
