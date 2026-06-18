import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const articleSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
});

export const fetchNews = createTool({
  id: 'fetch-news',
  description: 'Fetches the 3 most relevant news articles about artificial intelligence from Event Registry',
  inputSchema: z.object({}),
  outputSchema: z.object({
    articles: z.array(articleSchema),
  }),
  execute: async () => {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      throw new Error('NEWS_API_KEY environment variable is not set');
    }

    const response = await fetch('https://eventregistry.org/api/v1/article/getArticles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        keyword: 'artificial intelligence',
        articlesCount: 10,
        articlesSortBy: 'rel',
        lang: 'eng',
      }),
    });

    if (!response.ok) {
      throw new Error(`Event Registry error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      articles?: {
        results?: { title: string; body: string | null; url: string }[];
      };
    };

    const results = data.articles?.results;
    if (!results || results.length === 0) {
      throw new Error('Event Registry returned no articles');
    }

    return {
      articles: results.map(a => ({
        title: a.title,
        description: a.body ? a.body.slice(0, 300) : null,
        url: a.url,
      })),
    };
  },
});
