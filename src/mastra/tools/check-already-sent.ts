import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createArticleStore } from '../lib/article-store';

export const checkAlreadySent = createTool({
  id: 'check-already-sent',
  description: 'Returns the URLs of articles already sent to Slack this week so the agent can filter duplicates.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    sentUrls: z.array(z.string()),
  }),
  execute: async () => {
    const store = createArticleStore();
    const sentUrls = await store.getSentThisWeek();
    return { sentUrls };
  },
});
