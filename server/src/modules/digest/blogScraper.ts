import * as cheerio from 'cheerio';
import { upstreamError } from '../../utils/errors.js';

/**
 * Scrapes the latest post from the Oasis Security blog.
 *
 * The site (Webflow) exposes no RSS feed, so this parses HTML. Selectors are
 * kept deliberately loose: post cards are `<a href="/blog/<slug>">` links and
 * article pages carry og:title/og:description metadata — both far more stable
 * than styling classes. Verified against the live site structure (2026-07).
 */

const BLOG_INDEX_URL = 'https://www.oasis.security/blog';
const FETCH_TIMEOUT_MS = 20_000;
/** Plenty for a summary; keeps huge posts from blowing up prompt size. */
const MAX_CONTENT_CHARS = 15_000;

interface BlogPost {
  title: string;
  url: string;
  /** Plain-text article body (may be empty if extraction found nothing). */
  text: string;
}

async function fetchHtml(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'IdentityHub-Digest/1.0 (+https://localhost)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw upstreamError('BLOG_UNREACHABLE', `Could not reach ${url}.`, cause);
  }
  if (!res.ok) {
    throw upstreamError('BLOG_UNREACHABLE', `${url} responded with HTTP ${res.status}.`);
  }
  return res.text();
}

/** URL of the newest post on the blog index (cards are listed newest-first). */
async function findLatestPostUrl(): Promise<string> {
  const html = await fetchHtml(BLOG_INDEX_URL);
  const $ = cheerio.load(html);

  const candidates: string[] = [];
  $('a[href^="/blog/"], a[href^="https://www.oasis.security/blog/"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const path = href.replace('https://www.oasis.security', '');
    // Exactly one segment after /blog/ → an article, not the index or a category page.
    const segments = path.split('/').filter(Boolean);
    if (segments.length !== 2 || segments[0] !== 'blog') return;
    const url = `https://www.oasis.security${path}`;
    if (!candidates.includes(url)) candidates.push(url);
  });

  // Prefer a link that wraps a heading (a post card) over bare text links.
  const withHeading = candidates.find((url) => {
    const path = url.replace('https://www.oasis.security', '');
    return $(`a[href="${path}"], a[href="${url}"]`).find('h1,h2,h3,h4').length > 0;
  });

  const latest = withHeading ?? candidates[0];
  if (!latest) {
    throw upstreamError(
      'BLOG_PARSE_FAILED',
      `Found no post links on ${BLOG_INDEX_URL} — the page structure may have changed.`,
    );
  }
  return latest;
}

/** Fetches an article page and extracts its title + readable text. */
async function fetchPost(url: string): Promise<BlogPost> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() || $('h1').first().text().trim() || url;

  // Most-specific first: Webflow rich-text body, then semantic containers.
  const containers = ['.w-richtext', 'article', 'main'];
  let text = '';
  for (const selector of containers) {
    const node = $(selector).first();
    if (node.length === 0) continue;
    text = node
      .find('p, li, h2, h3')
      .map((_i, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join('\n');
    if (text.length > 200) break;
  }

  if (text.length < 200) {
    // Last resort: og:description still gives the summarizer something real.
    const description = $('meta[property="og:description"]').attr('content')?.trim();
    if (description) text = description;
  }

  return { title, url, text: text.slice(0, MAX_CONTENT_CHARS) };
}

export async function fetchLatestPost(): Promise<BlogPost> {
  return fetchPost(await findLatestPostUrl());
}
