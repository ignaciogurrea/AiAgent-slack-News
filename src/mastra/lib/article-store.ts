// ─────────────────────────────────────────────────────────────────────────────
// DB abstraction for persisting sent articles.
//
// Plug in a real implementation when DB_CREDS_* env vars are available.
// Until then the placeholder lets the workflow run end-to-end: it returns an
// empty "already sent" list (nothing filtered) and logs a warning instead of
// persisting, so no article is ever silently dropped.
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Placeholder (no DB configured) ───────────────────────────────────────────

class PlaceholderArticleStore implements ArticleStore {
  async getSentThisWeek(): Promise<string[]> {
    // TODO: replace with real SELECT WHERE sent_at >= NOW() - INTERVAL '7 days'
    return [];
  }

  async saveArticles(articles: SentArticle[]): Promise<void> {
    // TODO: replace with real INSERT / UPSERT
    console.warn(
      '[ArticleStore] DB_CREDS_* not configured — articles not persisted:',
      articles.map(a => a.url),
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
// Add real implementations here as DBs are wired up.
// Each block should read from DB_CREDS_<PROVIDER>_* env vars.
//
// Example skeleton (uncomment and fill when ready):
//
//   import { RealDBStore } from './stores/real-db-store';
//   if (process.env.DB_CREDS_URL) {
//     return new RealDBStore({
//       url:      process.env.DB_CREDS_URL,
//       username: process.env.DB_CREDS_USERNAME,
//       password: process.env.DB_CREDS_PASSWORD,
//     });
//   }

export function createArticleStore(): ArticleStore {
  return new PlaceholderArticleStore();
}
