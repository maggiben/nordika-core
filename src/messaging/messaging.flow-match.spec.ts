import {
  isFlowMatchType,
  pickMatchingEdge,
  replyMatchesEdge,
} from './messaging.flow-match';

describe('messaging.flow-match', () => {
  it('recognizes equals/contains match types', () => {
    expect(isFlowMatchType('equals')).toBe(true);
    expect(isFlowMatchType('contains')).toBe(true);
    expect(isFlowMatchType('startsWith')).toBe(false);
  });
  it('matches equals case-insensitively', () => {
    expect(
      replyMatchesEdge('  Día Completo ', {
        type: 'equals',
        value: 'día completo',
      }),
    ).toBe(true);
    expect(
      replyMatchesEdge('media', { type: 'equals', value: 'día completo' }),
    ).toBe(false);
  });

  it('matches contains substrings', () => {
    expect(
      replyMatchesEdge('Hoy faltó Ana', {
        type: 'contains',
        value: 'faltó',
      }),
    ).toBe(true);
  });

  it('rejects empty expected match values', () => {
    expect(replyMatchesEdge('ok', { type: 'equals', value: '   ' })).toBe(
      false,
    );
  });

  it('picks the first matching edge in order', () => {
    const edge = pickMatchingEdge('media jornada', [
      { id: 'a', match: { type: 'equals', value: 'día completo' } },
      { id: 'b', match: { type: 'contains', value: 'media' } },
      { id: 'c', match: { type: 'contains', value: 'jornada' } },
    ]);
    expect(edge?.id).toBe('b');
  });

  it('returns null when nothing matches', () => {
    expect(
      pickMatchingEdge('ok', [
        { id: 'a', match: { type: 'equals', value: 'día completo' } },
      ]),
    ).toBeNull();
  });
});
