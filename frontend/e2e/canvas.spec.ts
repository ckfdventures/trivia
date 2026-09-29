import { expect, test } from "@playwright/test";
import {
  contextForSeat,
  createRoom,
  drawHorizontalLine,
  inkCoverage,
  inkSegments,
  joinRoom,
  openRoom,
} from "./helpers";

/**
 * Drawing, judged by looking at the pixels.
 *
 * Every other test in this repo checks what the server was told. None of them can tell whether
 * a line actually appeared on screen — which is how strokes shipped rendering as disconnected
 * dots without a single test going red.
 */
test.describe("the canvas", () => {
  test("draws a continuous line, not a row of dots", async ({ browser, request }) => {
    const seat = await createRoom(request, "Artist");
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    const line = await drawHorizontalLine(page);

    const coverage = await inkCoverage(page, line);
    const segments = await inkSegments(page, line);

    // The regression. Before the fix each batch lost its joining segment, and a batch of one
    // point drew nothing at all, so the line arrived as fragments with large gaps.
    expect(coverage, "the drawn line should be inked along its whole length").toBeGreaterThan(0.95);
    expect(segments, "the line should be one unbroken run, not several").toBe(1);

    await context.close();
  });

  test("keeps short taps as dots", async ({ browser, request }) => {
    const seat = await createRoom(request, "Tapper");
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    const box = (await page.getByTestId("sx-canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(200);

    // A tap with no movement should still leave a mark.
    const marked = await inkCoverage(page, {
      y: box.height / 2,
      x0: box.width / 2 - 2,
      x1: box.width / 2 + 2,
    }, 5);
    expect(marked, "a tap should leave a dot").toBeGreaterThan(0.5);

    await context.close();
  });

  test("clears when the clear button is pressed", async ({ browser, request }) => {
    const seat = await createRoom(request, "Artist");
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    const line = await drawHorizontalLine(page);
    expect(await inkCoverage(page, line)).toBeGreaterThan(0.9);

    await page.getByTestId("sx-clear").click();
    await page.waitForTimeout(400);
    expect(await inkCoverage(page, line), "the canvas should be blank again").toBeLessThan(0.05);

    await context.close();
  });

  test("undo removes the last stroke", async ({ browser, request }) => {
    const seat = await createRoom(request, "Artist");
    const { context, page } = await contextForSeat(browser, seat);
    await openRoom(page, seat);

    const first = await drawHorizontalLine(page, { yRatio: 0.35 });
    const second = await drawHorizontalLine(page, { yRatio: 0.65 });
    expect(await inkCoverage(page, second)).toBeGreaterThan(0.9);

    await page.getByTestId("sx-undo").click();
    await page.waitForTimeout(400);

    expect(await inkCoverage(page, second), "the second line should be gone").toBeLessThan(0.05);
    expect(await inkCoverage(page, first), "the first should still be there").toBeGreaterThan(0.9);

    await context.close();
  });

  test("a stroke reaches the other player's screen", async ({ browser, request }) => {
    const host = await createRoom(request, "Artist");
    const guest = await joinRoom(request, host.code, "Watcher");

    const a = await contextForSeat(browser, host);
    const b = await contextForSeat(browser, guest);
    await openRoom(a.page, host);
    await openRoom(b.page, guest);

    const line = await drawHorizontalLine(a.page);
    // Relayed over the socket, merged into the watcher's log, and painted there.
    await expect
      .poll(() => inkCoverage(b.page, line), { timeout: 10_000 })
      .toBeGreaterThan(0.9);

    // And it is a line on their screen too, not the fragments the bug produced.
    expect(await inkSegments(b.page, line)).toBe(1);

    await a.context.close();
    await b.context.close();
  });

  test("a player arriving later sees what has already been drawn", async ({ browser, request }) => {
    const host = await createRoom(request, "Artist");
    const a = await contextForSeat(browser, host);
    await openRoom(a.page, host);
    const line = await drawHorizontalLine(a.page);

    // Only now does the second player exist.
    const guest = await joinRoom(request, host.code, "Latecomer");
    const b = await contextForSeat(browser, guest);
    await openRoom(b.page, guest);

    await expect
      .poll(() => inkCoverage(b.page, line), { timeout: 10_000 })
      .toBeGreaterThan(0.9);

    await a.context.close();
    await b.context.close();
  });
});
