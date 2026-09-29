import { expect, test } from "@playwright/test";
import { contextForSeat, createRoom, joinRoom, openRoom } from "./helpers";

/** The parts that make the game feel finished: navigation, rules, sound, saved settings. */

test.describe("getting around", () => {
  test("the rules explain the game and lead somewhere useful", async ({ page }) => {
    await page.goto("/scribblex/rules");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/draws/i);

    await page.getByTestId("sx-rules-browse").click();
    await expect(page).toHaveURL(/\/scribblex\/rooms/);
  });

  test("the tab bar moves between the standalone screens", async ({ page }) => {
    await page.goto("/scribblex");
    await expect(page.getByTestId("sx-nav")).toBeVisible();

    await page.getByTestId("sx-nav-rooms").click();
    await expect(page).toHaveURL(/\/scribblex\/rooms/);

    await page.getByTestId("sx-nav-rules").click();
    await expect(page).toHaveURL(/\/scribblex\/rules/);

    await page.getByTestId("sx-nav-play").click();
    await expect(page).toHaveURL(/\/scribblex$/);
  });

  test("marks the tab you are on", async ({ page }) => {
    await page.goto("/scribblex/rules");
    await expect(page.getByTestId("sx-nav-rules")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("sx-nav-rooms")).not.toHaveAttribute("aria-current", "page");
  });

  test("stays out of the way in a room", async ({ browser, request }) => {
    // A tab bar under a canvas is a tab bar pressed by accident while drawing.
    const seat = await createRoom(request, "Host");
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    await expect(page.getByTestId("sx-nav")).toHaveCount(0);
    await context.close();
  });
});

test.describe("sound", () => {
  test("is off until asked for, and remembered after that", async ({ browser, request }) => {
    const host = await createRoom(request, "Host", { turn_seconds: 80 });
    await joinRoom(request, host.code, "Guest");

    const { context, page } = await contextForSeat(browser, host);
    await openRoom(page, host);
    await page.getByTestId("sx-start-match").click();

    const toggle = page.getByTestId("sx-sound-toggle");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    // Off by default: a game that makes noise on arrival is a game people mute. PRD §13.10.
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByTestId("sx-sound-toggle")).toHaveAttribute("aria-pressed", "true", {
      timeout: 15_000,
    });

    await context.close();
  });
});

test.describe("saved settings", () => {
  test("a host's next room opens the way they left the last one", async ({ browser, request }) => {
    const seat = await createRoom(request, "Host", { rounds: 3 });
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    // Change the rules, then keep them.
    await page.getByTestId("sx-rounds").getByRole("radio", { name: "8" }).click();
    await expect(page.getByTestId("sx-rounds").getByRole("radio", { name: "8" })).toBeChecked();
    await page.getByTestId("sx-save-preset").click();
    await expect(page.getByTestId("sx-save-preset")).toContainText(/saved/i);

    // Open a fresh room the way a player would.
    await page.goto("/scribblex/avatar?intent=create");
    await page.getByTestId("sx-save-profile").click();
    await expect(page).toHaveURL(/\/scribblex\/room\/[A-Z0-9]{6}/, { timeout: 20_000 });

    // The new room starts from what was saved, rather than the defaults.
    await expect(page.getByTestId("sx-rounds").getByRole("radio", { name: "8" })).toBeChecked({
      timeout: 15_000,
    });

    await context.close();
  });
});
