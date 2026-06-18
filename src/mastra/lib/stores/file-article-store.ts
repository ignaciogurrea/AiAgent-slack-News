import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { ArticleStore, SentArticle } from '../article-store';

const DB_PATH = resolve(process.cwd(), 'data', 'sent-articles.json');

export class FileArticleStore implements ArticleStore {
  private load(): SentArticle[] {
    if (!existsSync(DB_PATH)) return [];
    return JSON.parse(readFileSync(DB_PATH, 'utf-8')) as SentArticle[];
  }

  private persist(articles: SentArticle[]): void {
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(articles, null, 2), 'utf-8');
  }

  async getSentThisWeek(): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return this.load()
      .filter(a => new Date(a.sentAt) >= cutoff)
      .map(a => a.url);
  }

  async saveArticles(articles: SentArticle[]): Promise<void> {
    const updated = [...this.load(), ...articles];
    this.persist(updated);
  }
}
