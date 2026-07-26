/**
 * Minimal Atlassian Document Format (ADF) builder. Jira Cloud's v3 API
 * rejects plain-string descriptions — they must be ADF documents.
 * Reference: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/
 */

interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
}

export interface AdfDoc {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

/** Blank lines separate paragraphs; single newlines become hard breaks. */
export function textToAdf(text: string): AdfDoc {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);

  const paragraphs: AdfNode[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const content: AdfNode[] = [];
    for (const line of lines) {
      if (content.length > 0) content.push({ type: 'hardBreak' });
      if (line.length > 0) content.push({ type: 'text', text: line });
    }
    // ADF forbids empty text nodes; an empty paragraph is legal though.
    paragraphs.push({ type: 'paragraph', content });
  }

  return {
    type: 'doc',
    version: 1,
    content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph', content: [] }],
  };
}
