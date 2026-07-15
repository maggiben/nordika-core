import { BadRequestException } from '@nestjs/common';
import { assertValidFlowGraph } from './messaging.flow-validate';

describe('assertValidFlowGraph', () => {
  const base = {
    startNodeId: 'a',
    nodes: [
      {
        id: 'a',
        title: 'Start',
        body: '¿Cómo fue?',
        position: { x: 0, y: 0 },
      },
      {
        id: 'b',
        title: 'Thanks',
        body: 'Gracias',
        position: { x: 120, y: 0 },
      },
    ],
    edges: [
      {
        id: 'e1',
        fromNodeId: 'a',
        toNodeId: 'b',
        match: { type: 'equals' as const, value: 'ok' },
      },
    ],
  };

  it('accepts a valid graph', () => {
    expect(() => assertValidFlowGraph(base)).not.toThrow();
  });

  it('rejects an empty node list', () => {
    expect(() =>
      assertValidFlowGraph({ ...base, nodes: [], edges: [] }),
    ).toThrow(BadRequestException);
  });

  it('rejects blank or duplicate node ids', () => {
    expect(() =>
      assertValidFlowGraph({
        ...base,
        nodes: [{ ...base.nodes[0], id: '  ' }, base.nodes[1]],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidFlowGraph({
        ...base,
        nodes: [base.nodes[0], { ...base.nodes[1], id: 'a' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty title/body or missing position', () => {
    expect(() =>
      assertValidFlowGraph({
        ...base,
        nodes: [{ ...base.nodes[0], title: ' ' }, base.nodes[1]],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidFlowGraph({
        ...base,
        nodes: [
          {
            ...base.nodes[0],
            position: undefined as unknown as { x: number; y: number },
          },
          base.nodes[1],
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing start node', () => {
    expect(() =>
      assertValidFlowGraph({ ...base, startNodeId: 'missing' }),
    ).toThrow(BadRequestException);
  });

  it('rejects blank, duplicate, or broken edges', () => {
    expect(() =>
      assertValidFlowGraph({
        ...base,
        edges: [{ ...base.edges[0], id: ' ' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidFlowGraph({
        ...base,
        edges: [base.edges[0], { ...base.edges[0], id: 'e1' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidFlowGraph({
        ...base,
        edges: [{ ...base.edges[0], toNodeId: 'missing' }],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidFlowGraph({
        ...base,
        edges: [
          {
            ...base.edges[0],
            match: { type: 'startsWith' as 'equals', value: 'ok' },
          },
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidFlowGraph({
        ...base,
        edges: [
          {
            ...base.edges[0],
            match: { type: 'contains', value: '  ' },
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
