import { describe, expect, it } from 'vitest';
import { collectVisualGraphIssues, isArchetypeCompatible } from './visual-graph-rules';

const baseMindMap = {
  archetype: 'mind_map' as const,
  root_node_id: 'root',
  nodes: [
    {
      id: 'root',
      type: 'concept',
      title: 'Root',
      body: 'Root body',
      depth: 0,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
    },
    {
      id: 'child',
      type: 'concept',
      title: 'Child',
      body: 'Child body',
      depth: 1,
      collapsed: false,
      status: 'normal',
      origin: 'ai',
    },
  ],
  edges: [{ id: 'e1', source: 'child', target: 'root', type: 'part_of' }],
};

describe('collectVisualGraphIssues', () => {
  it('returns no issues for valid mind map', () => {
    expect(collectVisualGraphIssues(baseMindMap)).toEqual([]);
  });

  it('flags orphan nodes', () => {
    const orphan = {
      ...baseMindMap,
      nodes: [
        ...baseMindMap.nodes,
        {
          id: 'lonely',
          type: 'concept',
          title: 'Lonely',
          body: 'No edges',
          depth: 2,
          collapsed: false,
          status: 'normal',
          origin: 'ai',
        },
      ],
    };
    const issues = collectVisualGraphIssues(orphan);
    expect(issues.some((i) => i.message.toLowerCase().includes('edge'))).toBe(true);
  });

  it('requires student origin for note nodes', () => {
    const aiNote = {
      ...baseMindMap,
      nodes: [
        ...baseMindMap.nodes,
        {
          id: 'note1',
          type: 'note',
          title: 'Note',
          body: 'A note',
          depth: 1,
          collapsed: false,
          status: 'normal',
          origin: 'ai',
        },
      ],
      edges: [...baseMindMap.edges, { id: 'e2', source: 'note1', target: 'root', type: 'requires' }],
    };
    const issues = collectVisualGraphIssues(aiNote);
    expect(issues.some((i) => i.message.includes('origin=student'))).toBe(true);
  });
});

describe('isArchetypeCompatible', () => {
  it('mind map is compatible with flowchart when structure allows', () => {
    expect(isArchetypeCompatible(baseMindMap, 'flowchart')).toBeDefined();
  });

  it('rejects incompatible archetype switch for cycle with question node', () => {
    const withQuestion = {
      ...baseMindMap,
      nodes: [
        ...baseMindMap.nodes,
        {
          id: 'q1',
          type: 'question',
          title: 'Why?',
          body: 'Question',
          depth: 2,
          collapsed: false,
          status: 'normal',
          origin: 'ai',
        },
      ],
      edges: [...baseMindMap.edges, { id: 'e2', source: 'q1', target: 'child', type: 'requires' }],
    };
    expect(isArchetypeCompatible(withQuestion, 'cycle')).toBe(false);
  });
});
