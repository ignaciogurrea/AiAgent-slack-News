import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { createArticleStore } from '../lib/article-store';

// ── Shared schemas ─────────────────────────────────────────────────────────────

const articleSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
});

const scoredArticleSchema = z.object({
  title: z.string(),
  titleEs: z.string(),
  description: z.string().nullable(),
  descriptionEs: z.string().nullable(),
  url: z.string(),
  score: z.number(),
  reasoning: z.string(),
});

// ── Step 1: fetchNews ─────────────────────────────────────────────────────────
// Fetches 10 articles from Event Registry sorted by relevance.

const fetchNewsStep = createStep({
  id: 'fetch-news',
  description: 'Fetches the 10 most relevant AI articles from Event Registry',
  inputSchema: z.object({}),
  outputSchema: z.object({
    articles: z.array(articleSchema),
  }),
  execute: async () => {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) throw new Error('NEWS_API_KEY environment variable is not set');

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

    if (!response.ok) throw new Error(`Event Registry error: ${response.status} ${response.statusText}`);

    const data = (await response.json()) as {
      articles?: { results?: { title: string; body: string | null; url: string }[] };
    };

    const results = data.articles?.results;
    if (!results?.length) throw new Error('Event Registry returned no articles');

    return {
      articles: results.map(a => ({
        title: a.title,
        description: a.body ? a.body.slice(0, 300) : null,
        url: a.url,
      })),
    };
  },
});

// ── Step 2: checkAlreadySent ──────────────────────────────────────────────────
// Removes articles already sent during the current week to avoid duplicates.

const checkAlreadySentStep = createStep({
  id: 'check-already-sent',
  description: 'Filters out articles already sent this week',
  inputSchema: z.object({
    articles: z.array(articleSchema),
  }),
  outputSchema: z.object({
    articles: z.array(articleSchema),
    skippedCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const store = createArticleStore();
    const sentUrls = new Set(await store.getSentThisWeek());

    const fresh = inputData.articles.filter(a => !sentUrls.has(a.url));

    return {
      articles: fresh,
      skippedCount: inputData.articles.length - fresh.length,
    };
  },
});

// ── Step 3: scoreRelevance ────────────────────────────────────────────────────
// The LLM evaluates each article, assigns a relevance score (1-10) for an AI
// professional audience, and translates title + description to Spanish in one
// pass (avoids a second LLM round-trip later).

const scoreRelevanceStep = createStep({
  id: 'score-relevance',
  description: 'LLM scores and translates each article',
  inputSchema: z.object({
    articles: z.array(articleSchema),
    skippedCount: z.number(),
  }),
  outputSchema: z.object({
    scoredArticles: z.array(scoredArticleSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    if (inputData.articles.length === 0) {
      return { scoredArticles: [] };
    }

    const agent = mastra?.getAgent('briefingAgent');
    if (!agent) throw new Error('briefingAgent not found');

    const prompt = `You are evaluating AI news articles for an AI professional audience.

For each article:
1. Score its relevance and impact from 1 to 10 (10 = breakthrough / must-read).
2. Translate the title and description to Spanish.

Articles:
${JSON.stringify(inputData.articles, null, 2)}

Respond with ONLY a valid JSON array — no markdown fences, no explanation:
[
  {
    "title": "<original title>",
    "titleEs": "<título en español>",
    "description": "<original description or null>",
    "descriptionEs": "<descripción en español, o null si no había>",
    "url": "<url>",
    "score": <1-10>,
    "reasoning": "<one sentence justifying the score>"
  }
]`;

    const response = await agent.generate([{ role: 'user', content: prompt }]);

    const clean = response.text.trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    let scored: z.infer<typeof scoredArticleSchema>[];
    try {
      scored = JSON.parse(clean);
    } catch {
      throw new Error(`Failed to parse scoring response: ${clean.slice(0, 300)}`);
    }

    if (!Array.isArray(scored)) {
      throw new Error('Scoring response is not a JSON array');
    }

    return { scoredArticles: scored };
  },
});

// ── Step 4: decide ────────────────────────────────────────────────────────────
// Sends only when at least 3 articles score ≥ 7.
// This prevents low-quality days from polluting the Slack channel.

const HIGH_SCORE_THRESHOLD = 7;
const MIN_ARTICLES_TO_SEND = 3;

const decideStep = createStep({
  id: 'decide',
  description: `Sends if ≥${MIN_ARTICLES_TO_SEND} articles score ≥${HIGH_SCORE_THRESHOLD}, otherwise skips`,
  inputSchema: z.object({
    scoredArticles: z.array(scoredArticleSchema),
  }),
  outputSchema: z.object({
    shouldSend: z.boolean(),
    topArticles: z.array(scoredArticleSchema),
    reason: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sorted = [...inputData.scoredArticles].sort((a, b) => b.score - a.score);
    const highScored = sorted.filter(a => a.score >= HIGH_SCORE_THRESHOLD);

    if (highScored.length >= MIN_ARTICLES_TO_SEND) {
      return {
        shouldSend: true,
        topArticles: highScored.slice(0, MIN_ARTICLES_TO_SEND),
        reason: `${highScored.length} articles scored ≥${HIGH_SCORE_THRESHOLD} — sending top ${MIN_ARTICLES_TO_SEND}`,
      };
    }

    return {
      shouldSend: false,
      topArticles: [],
      reason: `Only ${highScored.length}/${inputData.scoredArticles.length} articles scored ≥${HIGH_SCORE_THRESHOLD} (need ${MIN_ARTICLES_TO_SEND}) — skipping today`,
    };
  },
});

// ── Step 5: saveToMemory ──────────────────────────────────────────────────────
// If the decision was to send, posts to Slack and persists the sent articles.
// Formatting is done here directly (titles/descriptions already translated in
// scoreRelevanceStep) so no extra LLM call is needed.

const saveToMemoryStep = createStep({
  id: 'save-to-memory',
  description: 'Sends to Slack and persists sent articles to the DB',
  inputSchema: z.object({
    shouldSend: z.boolean(),
    topArticles: z.array(scoredArticleSchema),
    reason: z.string(),
  }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData }) => {
    if (!inputData.shouldSend) {
      return { result: `Skipped — ${inputData.reason}` };
    }

    const today = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const lines = inputData.topArticles.map((a, i) => {
      const desc = a.descriptionEs ? `\n${a.descriptionEs}` : '';
      return `*${i + 1}. ${a.titleEs}*${desc}\n🔗 ${a.url}`;
    });

    const message = [
      `🤖 *Briefing de Inteligencia Artificial* — ${today}`,
      '',
      ...lines,
    ].join('\n\n');

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) throw new Error('SLACK_WEBHOOK_URL environment variable is not set');

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });

    if (!slackRes.ok) {
      throw new Error(`Slack webhook error: ${slackRes.status} ${slackRes.statusText}`);
    }

    const store = createArticleStore();
    await store.saveArticles(
      inputData.topArticles.map(a => ({
        url: a.url,
        title: a.title,
        score: a.score,
        sentAt: new Date().toISOString(),
      })),
    );

    return { result: `Sent ${inputData.topArticles.length} articles to Slack and saved to memory` };
  },
});

// ── Workflow ──────────────────────────────────────────────────────────────────

export const briefingWorkflow = createWorkflow({
  id: 'briefing-workflow',
  inputSchema: z.object({}),
  outputSchema: z.object({ result: z.string() }),
  schedule: { cron: '0 8 * * *' },
})
  .then(fetchNewsStep)
  .then(checkAlreadySentStep)
  .then(scoreRelevanceStep)
  .then(decideStep)
  .then(saveToMemoryStep);

briefingWorkflow.commit();
