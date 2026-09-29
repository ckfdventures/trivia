import { expect, test, type Page } from "@playwright/test";
import { contextForSeat, createRoom, drawHorizontalLine, joinRoom, openRoom } from "./helpers";

/**
 * Two players, two browsers, one match.
 *
 * The closest thing here to someone actually playing: both screens are real, the socket is
 * real, and the assertions are about what each player can see — in particular that the one who
 * is guessing cannot see the answer.
 */

/** The word, read off the drawer's own screen. Only the drawer's tiles spell it out. */
async function wordFromTiles(page: Page): Promise<string> {
  const label = await page.getByTestId("sx-word-tiles").locator(".sr-only").innerText();
  const match = /The word is (.+)/.exec(label.trim());
  if (!match) throw new Error(`not the drawer's view: ${label}`);
  return match[1]!.trim();
}

/** Whichever of the two pages is currently drawing. */
async function drawerAndGuesser(a: Page, b: Page): Promise<{ drawer: Page; guesser: Page }> {
  const aIsDrawing = await a.getByText("You're drawing").isVisible().catch(() => false);
  return aIsDrawing ? { drawer: a, guesser: b } : { drawer: b, guesser: a };
}

test.describe("a match", () => {
  test("plays from lobby to a correct guess", async ({ browser, request }) => {
    const hostSeat = await createRoom(request, "Host", { rounds: 3, turn_seconds: 80 });
    const guestSeat = await joinRoom(request, hostSeat.code, "Guest");

    const a = await contextForSeat(browser, hostSeat);
    const b = await contextForSeat(browser, guestSeat);
    await openRoom(a.page, hostSeat);
    await openRoom(b.page, guestSeat);

    // ── Lobby
    await expect(a.page.getByTestId("sx-room-code")).toHaveText(hostSeat.display_code);
    await expect(a.page.getByText("Host", { exact: false }).first()).toBeVisible();
    await expect(b.page.getByText("Guest", { exact: false }).first()).toBeVisible();

    // Only the host gets the start button; everyone else gets a ready toggle.
    await expect(a.page.getByTestId("sx-start-match")).toBeVisible();
    await expect(b.page.getByTestId("sx-start-match")).toHaveCount(0);
    await expect(b.page.getByTestId("sx-ready")).toBeVisible();

    // ── Start
    await a.page.getByTestId("sx-start-match").click();

    // ── The drawer picks a word, and only the drawer is offered one.
    const pick = a.page.getByTestId("sx-word-pick");
    await expect(pick).toBeVisible({ timeout: 15_000 });
    await expect(b.page.getByTestId("sx-word-pick")).toHaveCount(0);
    await a.page.getByTestId("sx-word-choice-0").click();
    await expect(pick).toBeHidden();

    // ── The drawer sees the word; the guesser sees blanks.
    const { drawer, guesser } = await drawerAndGuesser(a.page, b.page);
    const word = await wordFromTiles(drawer);
    expect(word.length).toBeGreaterThan(2);

    const guesserTiles = await guesser.getByTestId("sx-word-tiles").locator(".sr-only").innerText();
    expect(guesserTiles, "the guesser must not be shown the word").not.toContain(word);
    expect(guesserTiles).toMatch(/letters/i);

    // ── The drawer draws, and it arrives on the other screen.
    await drawHorizontalLine(drawer);

    // ── A wrong guess is just chat.
    await guesser.getByTestId("sx-guess-input").fill("definitelynotit");
    await guesser.getByTestId("sx-guess-send").click();
    await expect(guesser.getByTestId("sx-chat")).toContainText("definitelynotit");

    // ── And straight away the right one, with no pause. Players type in bursts, and the
    // server rate-limits chat; a guess sent inside that window must still arrive.
    await guesser.getByTestId("sx-guess-input").fill(word);
    await guesser.getByTestId("sx-guess-send").click();

    await expect(guesser.getByTestId("sx-chat")).toContainText(/guessed the word/i, { timeout: 10_000 });
    // The guess itself is never broadcast — only that they got it.
    await expect(drawer.getByTestId("sx-chat")).toContainText(/guessed the word/i);

    // With both players accounted for, the turn ends and the word is revealed.
    await expect(guesser.getByTestId("sx-turn-reveal")).toBeVisible({ timeout: 10_000 });
    await expect(guesser.getByTestId("sx-turn-reveal")).toContainText(word);

    await a.context.close();
    await b.context.close();
  });

  test("shows the host's settings changes to everyone, and only lets the host make them", async ({
    browser,
    request,
  }) => {
    const hostSeat = await createRoom(request, "Host");
    const guestSeat = await joinRoom(request, hostSeat.code, "Guest");

    const a = await contextForSeat(browser, hostSeat);
    const b = await contextForSeat(browser, guestSeat);
    await openRoom(a.page, hostSeat);
    await openRoom(b.page, guestSeat);

    // The guest sees the same controls, disabled, so the rules stay legible to them.
    const guestRounds = b.page.getByTestId("sx-rounds").getByRole("radio", { name: "8" });
    await expect(guestRounds).toBeDisabled();

    await a.page.getByTestId("sx-rounds").getByRole("radio", { name: "8" }).click();
    await expect(guestRounds).toBeChecked({ timeout: 10_000 });

    await a.context.close();
    await b.context.close();
  });

  test("will not start without a deck", async ({ browser, request }) => {
    // A room is created before its host has chosen anything, so this is a question the lobby
    // asks rather than a state the room is prevented from being in.
    const hostSeat = await createRoom(request, "Host", { decks: [] });
    await joinRoom(request, hostSeat.code, "Guest");

    const a = await contextForSeat(browser, hostSeat);
    await openRoom(a.page, hostSeat);

    await expect(a.page.getByTestId("sx-start-match")).toBeDisabled();
    await expect(a.page.getByTestId("sx-start-blocked")).toContainText(/word deck/i);

    await a.context.close();
  });
});
