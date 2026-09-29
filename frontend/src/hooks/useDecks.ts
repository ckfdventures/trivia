"use client";

import { useEffect, useState } from "react";
import { listDecks } from "../lib/scribblex/api";
import type { DeckSummary } from "../lib/scribblex/types";

/**
 * The word-deck catalogue.
 *
 * Decks are records the admin panel owns, so the lobby asks the server rather than shipping a
 * list that would drift the moment anyone edited one.
 */
export function useDecks(): { decks: DeckSummary[]; loading: boolean; failed: boolean } {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listDecks()
      .then((rows) => {
        if (!cancelled) setDecks(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { decks, loading, failed };
}
