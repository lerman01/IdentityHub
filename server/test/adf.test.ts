import { describe, expect, it } from 'vitest';
import { textToAdf } from '../src/lib/adf.js';

describe('textToAdf', () => {
  it('wraps plain text in a valid ADF document', () => {
    const doc = textToAdf('Hello world');
    expect(doc).toEqual({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    });
  });

  it('splits blank-line-separated blocks into paragraphs', () => {
    const doc = textToAdf('First paragraph\n\nSecond paragraph');
    expect(doc.content).toHaveLength(2);
  });

  it('turns single newlines into hard breaks within a paragraph', () => {
    const doc = textToAdf('line one\nline two');
    const nodes = doc.content[0]!.content!;
    expect(nodes.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
  });

  it('never emits empty text nodes (Jira rejects them)', () => {
    const doc = textToAdf('\n\nabc\n\n');
    const walk = (nodes: Array<{ type: string; text?: string; content?: unknown[] }>): void => {
      for (const node of nodes) {
        if (node.type === 'text') expect(node.text!.length).toBeGreaterThan(0);
        if (node.content) walk(node.content as never);
      }
    };
    walk(doc.content as never);
  });

  it('handles CRLF input', () => {
    const doc = textToAdf('a\r\n\r\nb');
    expect(doc.content).toHaveLength(2);
  });
});
