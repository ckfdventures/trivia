import { api } from "../api";
import type { DeckSummary } from "./types";

/**
 * Owner-only deck management.
 *
 * The same upload → preview → import shape the trivia question bank uses, so the admin panel
 * behaves one way rather than two.
 */

export interface DeckDetail extends Omit<DeckSummary, "word_count"> {
  words: string[];
  created_at: string;
}

export interface WordUploadPreview {
  total_rows: number;
  valid_count: number;
  error_count: number;
  valid_words: string[];
  errors: string[];
}

export interface DeckMeta {
  name: string;
  blurb?: string;
  emoji?: string;
}

const base = "/admin/scribblex/decks";

export const deckAdminApi = {
  async list(): Promise<DeckSummary[]> {
    const { data } = await api.get<DeckSummary[]>(base);
    return data;
  },

  async get(id: string): Promise<DeckDetail> {
    const { data } = await api.get<DeckDetail>(`${base}/${encodeURIComponent(id)}`);
    return data;
  },

  async create(meta: DeckMeta): Promise<DeckSummary> {
    const { data } = await api.post<DeckSummary>(base, meta);
    return data;
  },

  async update(id: string, meta: Partial<DeckMeta>): Promise<DeckSummary> {
    const { data } = await api.patch<DeckSummary>(`${base}/${encodeURIComponent(id)}`, meta);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`${base}/${encodeURIComponent(id)}`);
  },

  /** Step 1: read a file and report what is in it. Nothing is saved. */
  async previewUpload(file: File): Promise<WordUploadPreview> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<WordUploadPreview>(`${base}/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  /** Step 2: add the previewed words. Words already in the deck are skipped, not duplicated. */
  async addWords(id: string, words: string[]): Promise<{ added: number; word_count: number }> {
    const { data } = await api.post(`${base}/${encodeURIComponent(id)}/words`, { words });
    return data;
  },

  async removeWord(id: string, word: string): Promise<{ word_count: number }> {
    const { data } = await api.delete(`${base}/${encodeURIComponent(id)}/words`, { data: { word } });
    return data;
  },
};
