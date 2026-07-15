import { BadRequestException } from '@nestjs/common';
import type { MessageFlowEdge, MessageFlowNode } from './messaging.schema';

export function assertValidFlowGraph(input: {
  startNodeId: string;
  nodes: MessageFlowNode[];
  edges: MessageFlowEdge[];
}): void {
  const { startNodeId, nodes, edges } = input;
  if (!nodes.length) {
    throw new BadRequestException('Flow must include at least one node.');
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    const id = node.id?.trim();
    if (!id) {
      throw new BadRequestException('Each flow node needs an id.');
    }
    if (nodeIds.has(id)) {
      throw new BadRequestException(`Duplicate flow node id: ${id}`);
    }
    if (!node.title?.trim() || !node.body?.trim()) {
      throw new BadRequestException(
        `Flow node ${id} requires non-empty title and body.`,
      );
    }
    if (
      typeof node.position?.x !== 'number' ||
      typeof node.position?.y !== 'number'
    ) {
      throw new BadRequestException(`Flow node ${id} needs position x/y.`);
    }
    nodeIds.add(id);
  }

  if (!nodeIds.has(startNodeId.trim())) {
    throw new BadRequestException(
      'startNodeId must reference an existing node.',
    );
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    const id = edge.id?.trim();
    if (!id) {
      throw new BadRequestException('Each flow edge needs an id.');
    }
    if (edgeIds.has(id)) {
      throw new BadRequestException(`Duplicate flow edge id: ${id}`);
    }
    edgeIds.add(id);
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      throw new BadRequestException(
        `Flow edge ${id} references a missing node.`,
      );
    }
    if (
      edge.match?.type !== 'equals' &&
      edge.match?.type !== 'contains' &&
      edge.match?.type !== 'any'
    ) {
      throw new BadRequestException(
        `Flow edge ${id} match.type must be equals, contains, or any.`,
      );
    }
    if (edge.match.type !== 'any' && !edge.match.value?.trim()) {
      throw new BadRequestException(
        `Flow edge ${id} needs a non-empty match value.`,
      );
    }
  }
}
