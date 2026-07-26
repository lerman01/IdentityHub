import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Summarizes a blog post. Uses the Anthropic API when ANTHROPIC_API_KEY is
 * configured; otherwise (or on any API failure) falls back to an extractive
 * summary so the digest never breaks — the AI is an enhancement, not a
 * dependency (docs/DECISIONS.md).
 */

export interface Summary {
  text: string;
  method: 'ai' | 'extractive';
}

export async function summarizePost(title: string, content: string): Promise<Summary> {
  if (env.ANTHROPIC_API_KEY && content.length > 0) {
    try {
      return { text: await aiSummary(title, content), method: 'ai' };
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'AI summary failed — falling back to extractive summary',
      );
    }
  }
  return { text: extractiveSummary(content), method: 'extractive' };
}

async function aiSummary(title: string, content: string): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: env.DIGEST_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content:
          'Summarize this security blog post for a Jira ticket that a security team will skim. ' +
          'Write 3-5 concise bullet points covering the key findings and why they matter, ' +
          'followed by a single-sentence takeaway. Plain text only, no markdown headings.\n\n' +
          `Title: ${title}\n\nPost content:\n${content}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Model declined to summarize this content');
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('Model returned no text');
  return text;
}

/** First few sentences of the post — always works, no API required. */
function extractiveSummary(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return '(No article text could be extracted.)';

  const sentences = compact.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [compact];
  let summary = '';
  for (const sentence of sentences) {
    if (summary.length + sentence.length > 700) break;
    summary += sentence;
  }

  return `${summary.trim()}\n\n(Automatic excerpt — set ANTHROPIC_API_KEY in .env for AI-generated summaries.)`;
}
