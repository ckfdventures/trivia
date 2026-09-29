import { expect, test, type Page } from "@playwright/test";
import { API } from "./helpers";

/**
 * The word deck screen, driven the way an owner drives it.
 *
 * The deck API is covered elsewhere; this is about the admin panel itself — whether the upload
 * actually previews before saving, whether errors are readable, and whether a deck edited here
 * reaches a lobby.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@triviastream.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.skip(!ADMIN_PASSWORD, "needs E2E_ADMIN_PASSWORD");

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("login-email").fill(ADMIN_EMAIL);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD!);
  await page.getByTestId("login-submit").click();

  // Anchored: a pattern like /\/admin/ also matches /admin/login, which would let a failed
  // sign-in look like a successful one and make every later step fail somewhere unrelated.
  await expect(page).toHaveURL(/\/admin\/themes$/, { timeout: 15_000 });
  const token = await page.evaluate(() => window.localStorage.getItem("ts_auth_token"));
  expect(token, "signing in should leave a token behind").toBeTruthy();
}

/** A deck created for one test and removed afterwards, whatever happens in between. */
function withDeck(name: string) {
  return {
    name,
    async cleanup(page: Page) {
      const token = await page.evaluate(() => window.localStorage.getItem("ts_auth_token"));
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      await page.request.delete(`${API}/api/admin/scribblex/decks/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
}

test.describe("the word deck screen", () => {
  test("is behind the login", async ({ page }) => {
    await page.goto("/admin/decks");
    // Nothing about decks should be readable without signing in.
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 15_000 });
  });

  test("is reachable from the admin navigation", async ({ page }) => {
    await signIn(page);
    await page.getByTestId("nav-decks").first().click();
    await expect(page).toHaveURL(/\/admin\/decks/);
    await expect(page.getByRole("heading", { name: "Word decks" })).toBeVisible();
  });

  test("lists the decks the game plays from", async ({ page, request }) => {
    await signIn(page);
    await page.goto("/admin/decks");

    const decks = await (await request.get(`${API}/api/scribblex/decks`)).json();
    for (const deck of decks) {
      await expect(page.getByTestId(`deck-${deck.id}`)).toContainText(deck.name);
      await expect(page.getByTestId(`deck-${deck.id}`)).toContainText(`${deck.word_count} words`);
    }
  });

  test("uploads a word list: preview first, save only on import", async ({ page }) => {
    const deck = withDeck(`Upload Check ${Date.now()}`);
    await signIn(page);
    await page.goto("/admin/decks");

    // ── Create
    await page.getByTestId("deck-name-input").fill(deck.name);
    await page.getByTestId("deck-create-btn").click();

    const id = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const row = page.getByTestId(`deck-${id}`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("0 words");

    try {
      // ── Upload a deliberately mixed file
      await page.getByTestId(`deck-toggle-${id}`).click();
      await page.getByTestId(`deck-upload-${id}`).setInputFiles({
        name: "words.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("penguin\notter\nab\nidiot\npenguin\nsloth\n"),
      });

      const preview = page.getByTestId("deck-preview");
      await expect(preview).toBeVisible({ timeout: 10_000 });
      // Three good, three rejected: too short, filtered, duplicate.
      await expect(preview).toContainText("3 usable");
      await expect(preview).toContainText("3 skipped");
      await expect(preview).toContainText(/shorter than/i);
      await expect(preview).toContainText(/more than once/i);
      await expect(preview).toContainText(/language filter/i);

      // ── Nothing is saved by previewing
      await expect(row).toContainText("0 words");

      // ── Import
      await page.getByTestId("deck-import-btn").click();
      await expect(row).toContainText("3 words", { timeout: 10_000 });
      await expect(preview).toBeHidden();
      await expect(page.getByText("penguin", { exact: true })).toBeVisible();
    } finally {
      await deck.cleanup(page);
    }
  });

  test("tops a deck up when the same list is uploaded again", async ({ page }) => {
    const deck = withDeck(`Reupload Check ${Date.now()}`);
    await signIn(page);
    await page.goto("/admin/decks");
    await page.getByTestId("deck-name-input").fill(deck.name);
    await page.getByTestId("deck-create-btn").click();

    const id = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const row = page.getByTestId(`deck-${id}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    try {
      await page.getByTestId(`deck-toggle-${id}`).click();
      const upload = async (body: string) => {
        await page.getByTestId(`deck-upload-${id}`).setInputFiles({
          name: "words.txt",
          mimeType: "text/plain",
          buffer: Buffer.from(body),
        });
        await expect(page.getByTestId("deck-preview")).toBeVisible({ timeout: 10_000 });
        await page.getByTestId("deck-import-btn").click();
      };

      await upload("penguin\notter\n");
      await expect(row).toContainText("2 words", { timeout: 10_000 });

      // Re-uploading a corrected file should add what is new, not double what is there.
      await upload("penguin\notter\nwalrus\n");
      await expect(row).toContainText("3 words", { timeout: 10_000 });
    } finally {
      await deck.cleanup(page);
    }
  });

  test("adds words typed by hand, and removes one", async ({ page }) => {
    const deck = withDeck(`Typed Check ${Date.now()}`);
    await signIn(page);
    await page.goto("/admin/decks");
    await page.getByTestId("deck-name-input").fill(deck.name);
    await page.getByTestId("deck-create-btn").click();

    const id = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const row = page.getByTestId(`deck-${id}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    try {
      await page.getByTestId(`deck-toggle-${id}`).click();
      await page.getByTestId(`deck-typed-${id}`).fill("penguin, otter, sloth");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(row).toContainText("3 words", { timeout: 10_000 });

      await page.getByRole("button", { name: "Remove otter" }).click();
      await expect(row).toContainText("2 words", { timeout: 10_000 });
      await expect(page.getByText("otter", { exact: true })).toHaveCount(0);
    } finally {
      await deck.cleanup(page);
    }
  });

  test("imports a list longer than one request can carry", async ({ page }) => {
    const deck = withDeck(`Big List ${Date.now()}`);
    await signIn(page);
    await page.goto("/admin/decks");
    await page.getByTestId("deck-name-input").fill(deck.name);
    await page.getByTestId("deck-create-btn").click();

    const id = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const row = page.getByTestId(`deck-${id}`);
    await expect(row).toBeVisible({ timeout: 10_000 });

    try {
      // More words than the server accepts in a single request. A preview promising this many
      // has to be able to deliver them, rather than failing afterwards on an unannounced cap.
      const words = Array.from({ length: 2500 }, (_, i) => `sketchword${i}`);
      await page.getByTestId(`deck-toggle-${id}`).click();
      await page.getByTestId(`deck-upload-${id}`).setInputFiles({
        name: "big.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(words.join("\n")),
      });

      await expect(page.getByTestId("deck-preview")).toContainText("2500 usable", { timeout: 15_000 });
      await page.getByTestId("deck-import-btn").click();

      await expect(row).toContainText("2500 words", { timeout: 30_000 });
      await expect(page.getByTestId("decks-error")).toHaveCount(0);
    } finally {
      await deck.cleanup(page);
    }
  });

  test("explains a bad file instead of failing silently", async ({ page }) => {
    const deck = withDeck(`Bad File ${Date.now()}`);
    await signIn(page);
    await page.goto("/admin/decks");
    await page.getByTestId("deck-name-input").fill(deck.name);
    await page.getByTestId("deck-create-btn").click();

    const id = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await expect(page.getByTestId(`deck-${id}`)).toBeVisible({ timeout: 10_000 });

    try {
      await page.getByTestId(`deck-toggle-${id}`).click();
      await page.getByTestId(`deck-upload-${id}`).setInputFiles({
        name: "broken.json",
        mimeType: "application/json",
        buffer: Buffer.from("{ this is not json"),
      });

      await expect(page.getByTestId("decks-error")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("decks-error")).toContainText(/json/i);
    } finally {
      await deck.cleanup(page);
    }
  });

  test("refuses a duplicate deck name and says so", async ({ page, request }) => {
    await signIn(page);
    await page.goto("/admin/decks");

    const existing = (await (await request.get(`${API}/api/scribblex/decks`)).json())[0];
    await page.getByTestId("deck-name-input").fill(existing.name);
    await page.getByTestId("deck-create-btn").click();

    await expect(page.getByTestId("decks-error")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("decks-error")).toContainText(/already exists/i);
  });

  test("deleting asks first, and the deck then leaves the lobby", async ({ page }) => {
    const deck = withDeck(`Delete Check ${Date.now()}`);
    await signIn(page);
    await page.goto("/admin/decks");
    await page.getByTestId("deck-name-input").fill(deck.name);
    await page.getByTestId("deck-create-btn").click();

    const id = deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await expect(page.getByTestId(`deck-${id}`)).toBeVisible({ timeout: 10_000 });

    // Cancelling leaves it alone.
    await page.getByTestId(`deck-delete-${id}`).click();
    await expect(page.getByTestId("deck-delete-confirm")).toBeVisible();
    await page.getByTestId("deck-delete-confirm-cancel").click();
    await expect(page.getByTestId(`deck-${id}`)).toBeVisible();

    // Confirming removes it.
    await page.getByTestId(`deck-delete-${id}`).click();
    await page.getByTestId("deck-delete-confirm-confirm").click();
    await expect(page.getByTestId(`deck-${id}`)).toHaveCount(0, { timeout: 10_000 });

    // And it is gone from what the game offers players, not just from this screen.
    const after = await (await page.request.get(`${API}/api/scribblex/decks`)).json();
    expect(after.some((d: { id: string }) => d.id === id)).toBe(false);
  });
});
