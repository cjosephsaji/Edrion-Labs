import { describe, expect, it } from 'vitest';
import { remarkUnderline } from './markdown';

describe('remarkUnderline', () => {
  it('turns paired plus markers into safe underline nodes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'Keep ++this phrase++ underlined.' }],
        },
      ],
    };

    remarkUnderline()(tree);

    expect(tree.children[0]?.children).toEqual([
      { type: 'text', value: 'Keep ' },
      {
        type: 'underline',
        data: { hName: 'u' },
        children: [{ type: 'text', value: 'this phrase' }],
      },
      { type: 'text', value: ' underlined.' },
    ]);
  });

  it('leaves unmatched markers as plain text', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Keep ++this plain.' }] }],
    };

    remarkUnderline()(tree);

    expect(tree.children[0]?.children).toEqual([{ type: 'text', value: 'Keep ++this plain.' }]);
  });
});
