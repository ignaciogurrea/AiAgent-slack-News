// ─────────────────────────────────────────────────────────────────────────────
// DB abstraction for persisting sent articles.
//
// Priority order (first match wins):
//   1. Real DB  — when DB_CREDS_* env vars are present
//   2. File DB  — local JSON file at data/sent-articles.json (default)
// ─────────────────────────────────────────────────────────────────────────────

import { FileArticleStore } from './stores/file-article-store';

export interface SentArticle {
  url: string;
  title: string;
  score: number;
  sentAt: string; // ISO 8601
}

export interface ArticleStore {
  /** Returns the URLs of every article sent in the last 7 days. */
  getSentThisWeek(): Promise<string[]>;
  /** Persists a batch of just-sent articles. */
  saveArticles(articles: SentArticle[]): Promise<void>;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createArticleStore(): ArticleStore {
  // TODO: plug in real DB when credentials are ready.
  // Example:
  //   if (process.env.DB_CREDS_URL) {
  //     return new RealDBStore({ url: process.env.DB_CREDS_URL, ... });
  //   }

  return new FileArticleStore();
}
