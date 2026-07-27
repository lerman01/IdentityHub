import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizePost } from '../src/modules/digest/summarizer.js';

/**
 * GROQ_API_KEY is required to start a digest run (docs/DECISIONS.md #12), so
 * the interesting case here is the one that survives it: a Groq call that
 * fails mid-run must still produce a usable ticket body. Every test stubs
 * fetch — no network is touched.
 */

const POST = [
  'PromptFiction was a one-click flaw in an AI desktop client.',
  'A crafted link could hand instructions to the agent and make it act on them.',
  'Depending on configuration that ranged from copying private conversations to running code.',
].join(' ');

beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down'))));
afterEach(() => vi.unstubAllGlobals());

describe('summarizePost when Groq is unreachable', () => {
  it('falls back to an extractive summary', async () => {
    const summary = await summarizePost('PromptFiction', POST);

    expect(summary.method).toBe('extractive');
    expect(summary.text).toContain('PromptFiction was a one-click flaw');
    expect(summary.text).toContain('the AI summary was unavailable');
  });

  it('caps the excerpt rather than pasting the whole article', async () => {
    const long = 'This sentence is padding for the length cap. '.repeat(200);
    const summary = await summarizePost('Long post', long);

    // 700-char budget plus the trailing note line.
    expect(summary.text.length).toBeLessThan(900);
  });

  it('degrades to a readable note when no text could be scraped', async () => {
    const summary = await summarizePost('Empty', '');

    expect(summary.method).toBe('extractive');
    expect(summary.text).toContain('No article text could be extracted');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles text with no sentence punctuation', async () => {
    const summary = await summarizePost('No punctuation', 'just a bare fragment with no full stop');

    expect(summary.text).toContain('just a bare fragment');
  });
});

describe('summarizePost when Groq answers', () => {
  it('returns the model summary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '  • A model-written summary.  ' } }] }),
      }),
    );

    const summary = await summarizePost('PromptFiction', POST);

    expect(summary.method).toBe('ai');
    expect(summary.text).toBe('• A model-written summary.');
  });
});
