/**
 * Cloudflare Browser Rendering /crawl endpoint.
 * Scrapes a website and returns its content as markdown.
 * Used by brand searches to ingest a client's website for AI context.
 *
 * Docs: https://developers.cloudflare.com/changelog/post/2026-03-10-br-crawl-endpoint/
 */

import { logUsage } from '@/lib/ai/usage';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CRAWL_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/crawl`;

interface CrawlResult {
  url: string;
  content: string;
}

interface CrawlJobResponse {
  success: boolean;
  result?: { job_id: string };
  errors?: { message: string }[];
}

interface CrawlResultsResponse {
  success: boolean;
  result?: {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    pages?: { url: string; content: string }[];
  };
  errors?: { message: string }[];
}

/**
 * Crawl a website and return its main page content as markdown.
 * Returns null if Cloudflare credentials aren't configured or crawl fails.
 * Timeout: 30s max wait for results.
 */
export async function crawlWebsite(websiteUrl: string): Promise<CrawlResult[] | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;

  try {
    // Start crawl job
    const startRes = await fetch(CRAWL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: websiteUrl,
        render: true,
        depth: 1,
        maxPages: 5,
        discovery: 'links',
      }),
    });

    if (!startRes.ok) {
      console.error('Cloudflare crawl start failed:', startRes.status);
      return null;
    }

    const startData: CrawlJobResponse = await startRes.json();
    if (!startData.success || !startData.result?.job_id) {
      console.error('Cloudflare crawl start error:', startData.errors);
      return null;
    }

    const jobId = startData.result.job_id;

    // Poll for results (max 30s, every 3s)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const pollRes = await fetch(`${CRAWL_URL}?job_id=${jobId}`, {
        headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` },
      });

      if (!pollRes.ok) continue;

      const pollData: CrawlResultsResponse = await pollRes.json();
      if (!pollData.success) continue;

      if (pollData.result?.status === 'completed' && pollData.result.pages) {
        logUsage({
          service: 'cloudflare',
          model: 'browser-rendering',
          feature: 'website_crawl',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        }).catch(() => {});

        return pollData.result.pages.map((p) => ({
          url: p.url,
          content: p.content.slice(0, 5000), // Cap per page to keep prompt size reasonable
        }));
      }

      if (pollData.result?.status === 'failed') {
        console.error('Cloudflare crawl job failed');
        return null;
      }
    }

    console.warn('Cloudflare crawl timed out for:', websiteUrl);
    return null;
  } catch (err) {
    console.error('Cloudflare crawl error:', err);
    return null;
  }
}
