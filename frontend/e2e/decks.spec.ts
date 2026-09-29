import { expect, test, type APIRequestContext } from "@playwright/test";
import { API, contextForSeat, createRoom, openRoom } from "./helpers";

/**
 * Word decks reach the lobby from the database, not from a list compiled into the client.
 *
 * This is the whole reason decks are stored rather than shipped as files (DECISIONS.md D9):
 * an owner edits them and the next room sees the change, with no deploy. A hard-coded
 * catalogue would pass every other test in this repo while quietly making that false.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@triviastream.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

async function adminToken(request: APIRequestContext): Promise<string | null> {
  if (!ADMIN_PASSWORD) return null;
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!res.ok()) return null;
  return (await res.json()).token as string;
}

test.describe("word decks", () => {
  test("the lobby lists what the server has, with live word counts", async ({ browser, request }) => {
    const fromApi = await (await request.get(`${API}/api/scribblex/decks`)).json();
    expect(fromApi.length, "the server should have decks seeded").toBeGreaterThan(0);

    const seat = await createRoom(request, "Host");
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    // Every deck the server knows about, by the id the server gave it.
    for (const deck of fromApi) {
      const row = page.getByTestId(`sx-deck-${deck.id}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(deck.name);
      // The count is real data, not a number written into the client.
      await expect(row).toContainText(`${deck.word_count} words`);
    }

    await context.close();
  });

  test("a deck created in the admin panel shows up in a lobby", async ({ browser, request }) => {
    const token = await adminToken(request);
    test.skip(!token, "needs E2E_ADMIN_PASSWORD to reach the admin API");

    const headers = { Authorization: `Bearer ${token}` };
    const name = `E2E Deck ${Date.now()}`;
    const created = await request.post(`${API}/api/admin/scribblex/decks`, {
      headers,
      data: { name, blurb: "created by a test", emoji: "🧪" },
    });
    expect(created.status()).toBe(201);
    const deck = await created.json();

    try {
      await request.post(`${API}/api/admin/scribblex/decks/${deck.id}/words`, {
        headers,
        data: { words: ["penguin", "otter", "sloth"] },
      });

      const seat = await createRoom(request, "Host");
      const { context, page } = await contextForSeat(browser, seat);
      await openRoom(page, seat);

      // The point: a deck that did not exist a moment ago, in the lobby, with no deploy.
      const row = page.getByTestId(`sx-deck-${deck.id}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(name);
      await expect(row).toContainText("3 words");

      // And it can actually be chosen to play with.
      await row.click();
      await expect(row).toHaveAttribute("aria-pressed", "true");

      await context.close();
    } finally {
      await request.delete(`${API}/api/admin/scribblex/decks/${deck.id}`, { headers });
    }
  });
});
