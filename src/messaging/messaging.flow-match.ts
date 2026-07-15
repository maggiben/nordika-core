export type FlowMatchType = 'equals' | 'contains' | 'any';

export type FlowEdgeMatch = {
  type: FlowMatchType;
  value: string;
};

export function normalizeReplyText(value: string): string {
  return value.trim().toLowerCase();
}

export function isFlowMatchType(value: string): value is FlowMatchType {
  return value === 'equals' || value === 'contains' || value === 'any';
}

export function replyMatchesEdge(
  replyBody: string,
  match: FlowEdgeMatch,
): boolean {
  const reply = normalizeReplyText(replyBody);
  if (!reply) {
    return false;
  }
  if (match.type === 'any') {
    return true;
  }
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
  // Linear chains: a single outgoing edge advances on any non-empty reply.
  if (edges.length === 1 && normalizeReplyText(replyBody)) {
    return edges[0];
  }
  return null;
}

export const FLOW_STEP_CAP = 20;
