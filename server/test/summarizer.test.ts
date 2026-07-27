import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizePost } from '../src/modules/digest/summarizer.js';

/**
 * The test env has no GROQ_API_KEY (see setup.ts), so these exercise the
 * fallback that keeps the digest working without an AI provider — the whole
 * point of the design (docs/DECISIONS.md #12). No network is touched.
 */

const POST = [
  'PromptFiction was a one-click flaw in an AI desktop client.',
  'A crafted link could hand instructions to the agent and make it act on them.',
  'Depending on configuration that ranged from copying private conversations to running code.',
].join(' ');

afterEach(() => vi.unstubAllGlobals());

describe('summarizePost without an API key', () => {
  it('falls back to an extractive summary', async () => {
    const summary = await summarizePost('PromptFiction', POST);

    expect(summary.method).toBe('extractive');
    expect(summary.text).toContain('PromptFiction was a one-click flaw');
    expect(summary.text).toContain('GROQ_API_KEY');
  });

  it('never calls out to the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await summarizePost('PromptFiction', POST);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caps the excerpt rather than pasting the whole article', async () => {
    const long = 'This sentence is padding for the length cap. '.repeat(200);
    const summary = await summarizePost('Long post', long);

    // 700-char budget plus the trailing hint line.
    expect(summary.text.length).toBeLessThan(900);
  });

  it('degrades to a readable note when no text could be scraped', async () => {
    const summary = await summarizePost('Empty', '');

    expect(summary.method).toBe('extractive');
    expect(summary.text).toContain('No article text could be extracted');
  });

  it('handles text with no sentence punctuation', async () => {
    const summary = await summarizePost('No punctuation', 'just a bare fragment with no full stop');

    expect(summary.text).toContain('just a bare fragment');
  });
});
