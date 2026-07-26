import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Summarizes a blog post for the digest ticket.
 *
 * Uses Groq's OpenAI-compatible chat-completions endpoint when GROQ_API_KEY is
 * configured; otherwise — or on any API failure — falls back to an extractive
 * summary so the digest never breaks. The AI is an enhancement, not a
 * dependency (docs/DECISIONS.md #12).
 *
 * Called with plain fetch rather than an SDK: it is one request with one
 * prompt, the failure path is already handled, and it keeps the dependency
 * list (and the code that touches an API key) as small as the Jira client's.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const FETCH_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT =
  'You summarize security blog posts for engineers who will read the summary inside a Jira ' +
  'ticket. Be concrete and factual. Never invent details that are not in the post.';

export interface Summary {
  text: string;
  method: 'ai' | 'extractive';
}

export async function summarizePost(title: string, content: string): Promise<Summary> {
  if (env.GROQ_API_KEY && content.length > 0) {
    try {
      return { text: await groqSummary(title, content), method: 'ai' };
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'AI summary failed — falling back to extractive summary',
      );
    }
  }
  return { text: extractiveSummary(content), method: 'extractive' };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string };
}

async function groqSummary(title: string, content: string): Promise<string> {
  const userPrompt =
    'Summarize this security blog post as 3-5 concise bullet points covering the key findings ' +
    'and why they matter, then a single-sentence takeaway. Plain text only — no markdown ' +
    `headings, no bold.\n\nTitle: ${title}\n\nPost content:\n${content}`;

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.DIGEST_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 1024,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new Error(`Could not reach Groq: ${cause instanceof Error ? cause.message : cause}`, {
      cause,
    });
  }

  const data = (await res.json().catch(() => ({}))) as ChatCompletionResponse;

  if (!res.ok) {
    // Groq reports a bad key, unknown model, or rate limit here — the message
    // is worth surfacing because it tells the operator what to fix.
    throw new Error(`Groq returned HTTP ${res.status}: ${data.error?.message ?? 'unknown error'}`);
  }

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned no summary text');
  return text;
}

/** First few sentences of the post — always works, no API key required. */
function extractiveSummary(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return '(No article text could be extracted.)';

  const sentences = compact.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [compact];
  let summary = '';
  for (const sentence of sentences) {
    if (summary.length + sentence.length > 700) break;
    summary += sentence;
  }

  return `${(summary || compact.slice(0, 700)).trim()}\n\n(Automatic excerpt — set GROQ_API_KEY in .env for AI-generated summaries.)`;
}
