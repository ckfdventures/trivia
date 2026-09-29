import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8001";

export interface Seat {
  code: string;
  display_code: string;
  player_id: string;
  session_token: string;
}

const profile = (name: string) => ({ profile: { name, avatar_id: "pip", hat_id: null } });

/**
 * Open a room through the API rather than by clicking through the UI.
 *
 * The flows that get you into a room are tested on their own; everything else starts from a
 * seat so a failure points at the thing under test rather than at the steps before it.
 */
export async function createRoom(
  request: APIRequestContext,
  name = "Host",
  settings: Record<string, unknown> = {},
): Promise<Seat> {
  const decks = await (await request.get(`${API}/api/scribblex/decks`)).json();
  const res = await request.post(`${API}/api/scribblex/rooms`, {
    data: { ...profile(name), settings: { decks: [decks[0].id], ...settings } },
  });
  expect(res.status(), "room should be created").toBe(201);
  return res.json();
}

export async function joinRoom(request: APIRequestContext, code: string, name: string): Promise<Seat> {
  const res = await request.post(`${API}/api/scribblex/rooms/${code}/join`, { data: profile(name) });
  expect(res.status(), `${name} should be able to join`).toBe(201);
  return res.json();
}

/** A browser context already holding this seat, as though it had joined in that browser. */
export async function contextForSeat(browser: Browser, seat: Seat): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [`sx_seat_${seat.code}`, JSON.stringify({ code: seat.code, player_id: seat.player_id, session_token: seat.session_token })],
  );
  const page = await context.newPage();
  return { context, page };
}

export async function openRoom(page: Page, seat: Seat): Promise<void> {
  await page.goto(`/scribblex/room/${seat.code}`);
  // The screen is client-only, so wait for it to have actually connected.
  await expect(page.getByTestId("sx-connection")).toBeVisible();
}

// ── Canvas ───────────────────────────────────────────────────────────────────

/** The canvas background, as `drawing.ts` paints it. */
const BACKGROUND = { r: 0xff, g: 0xfd, b: 0xf7 };

/**
 * Drag the pointer across the canvas in a straight horizontal line.
 *
 * `steps` matters: each one is a separate pointer event, which is what produces the batching
 * the renderer has to stitch back together.
 */
export async function drawHorizontalLine(
  page: Page,
  { fromRatio = 0.1, toRatio = 0.9, yRatio = 0.5, steps = 40 } = {},
): Promise<{ y: number; x0: number; x1: number }> {
  const canvas = page.getByTestId("sx-canvas");
  // Centre it first. Screens here have a fixed bar pinned to the bottom, so part of the canvas
  // can sit underneath it — a pointer aimed there would land on the bar, not the drawing.
  await canvas.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }));
  await page.waitForTimeout(80);

  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");

  const y = box.y + box.height * yRatio;
  const x0 = box.x + box.width * fromRatio;
  const x1 = box.x + box.width * toRatio;

  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y);
  }
  await page.mouse.up();
  // Let the last batch paint.
  await page.waitForTimeout(200);

  return { y: box.height * yRatio, x0: box.width * fromRatio, x1: box.width * toRatio };
}

/**
 * What fraction of the drawn line actually has ink on it.
 *
 * Reads the canvas back and samples across the stroke, allowing a few pixels either side of
 * the line for antialiasing. A continuous stroke covers essentially all of it; the bug this
 * guards against left long gaps and, at speed, nothing but isolated dots.
 */
export async function inkCoverage(
  page: Page,
  line: { y: number; x0: number; x1: number },
  samples = 60,
): Promise<number> {
  return page.evaluate(
    ({ line, samples, bg }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sx-canvas"]');
      if (!canvas) throw new Error("no canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no context");

      // The backing store is scaled by device pixel ratio against the CSS box.
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const inked = (px: number, py: number) => {
        const i = (py * canvas.width + px) * 4;
        const [r, g, b, a] = [image[i]!, image[i + 1]!, image[i + 2]!, image[i + 3]!];
        if (a === 0) return false;
        return Math.abs(r - bg.r) > 12 || Math.abs(g - bg.g) > 12 || Math.abs(b - bg.b) > 12;
      };

      let hits = 0;
      for (let s = 0; s < samples; s++) {
        const x = Math.round((line.x0 + ((line.x1 - line.x0) * s) / (samples - 1)) * scale);
        const yc = Math.round(line.y * scale);
        // A band either side, since a smoothed line wanders a pixel or two off the axis.
        let found = false;
        for (let dy = -6; dy <= 6 && !found; dy++) {
          const y = yc + dy;
          if (y < 0 || y >= canvas.height || x < 0 || x >= canvas.width) continue;
          if (inked(x, y)) found = true;
        }
        if (found) hits++;
      }
      return hits / samples;
    },
    { line, samples, bg: BACKGROUND },
  );
}

/** How many distinct inked runs the line breaks into. One means a continuous stroke. */
export async function inkSegments(
  page: Page,
  line: { y: number; x0: number; x1: number },
  samples = 60,
): Promise<number> {
  return page.evaluate(
    ({ line, samples, bg }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="sx-canvas"]');
      const ctx = canvas!.getContext("2d")!;
      const scale = canvas!.width / canvas!.getBoundingClientRect().width;
      const image = ctx.getImageData(0, 0, canvas!.width, canvas!.height).data;

      const inked = (px: number, py: number) => {
        const i = (py * canvas!.width + px) * 4;
        const [r, g, b, a] = [image[i]!, image[i + 1]!, image[i + 2]!, image[i + 3]!];
        if (a === 0) return false;
        return Math.abs(r - bg.r) > 12 || Math.abs(g - bg.g) > 12 || Math.abs(b - bg.b) > 12;
      };

      let runs = 0;
      let inRun = false;
      for (let s = 0; s < samples; s++) {
        const x = Math.round((line.x0 + ((line.x1 - line.x0) * s) / (samples - 1)) * scale);
        const yc = Math.round(line.y * scale);
        let found = false;
        for (let dy = -6; dy <= 6 && !found; dy++) {
          const y = yc + dy;
          if (y >= 0 && y < canvas!.height && x >= 0 && x < canvas!.width && inked(x, y)) found = true;
        }
        if (found && !inRun) runs++;
        inRun = found;
      }
      return runs;
    },
    { line, samples, bg: BACKGROUND },
  );
}
