"use client";

import { useParams as useNextParams, useRouter } from "next/navigation";
import { useCallback } from "react";

/** `navigate(path)` / `navigate(path, { replace: true })`, backed by the Next.js router. */
export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (path: string, options: { replace?: boolean } = {}) => (options.replace ? router.replace(path) : router.push(path)),
    [router],
  );
}

/** The `[pin]` segment of the current route. */
export function usePin(): string {
  const params = useNextParams<{ pin?: string }>();
  return params.pin ?? "";
}

/** Read a JSON value from localStorage (null if missing or unparsable). */
export function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
