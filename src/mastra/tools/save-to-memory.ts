import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createArticleStore } from '../lib/article-store';

const articleItemSchema = z.object({
  url: z.string(),
  title: z.string(),
  score: z.number(),
});

export const saveToMemory = createTool({
  id: 'save-to-memory',
  description: 'Persists the articles that were just sent to Slack so they are not sent again this week.',
  inputSchema: z.object({
    articles: z.array(articleItemSchema),
  }),
  outputSchema: z.object({
    saved: z.number().describe('Number of articles persisted'),
  }),
  execute: async (inputData) => {
    const store = createArticleStore();
    await store.saveArticles(
      inputData.articles.map((a: z.infer<typeof articleItemSchema>) => ({
        url: a.url,
        title: a.title,
        score: a.score,
        sentAt: new Date().toISOString(),
      })),
    );
    return { saved: inputData.articles.length };
  },
});
