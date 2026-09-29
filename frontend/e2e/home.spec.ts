import { expect, test } from "@playwright/test";

/** The platform shell, and that each gate leads where it says it does. */

test.describe("the home page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("offers both games", async ({ page }) => {
    await expect(page.getByTestId("gate-trivia")).toBeVisible();
    await expect(page.getByTestId("gate-scribblex")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trivia", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ScribbleX" })).toBeVisible();
  });

  test("keeps admin out of the header and in the footer", async ({ page }) => {
    // A maintenance link should not compete with the two things players came for.
    await expect(page.locator("header").getByTestId("shell-admin-login")).toHaveCount(0);
    await expect(page.locator("footer").getByTestId("shell-admin-login")).toBeVisible();
  });

  test("refuses a trivia PIN that is not six digits", async ({ page }) => {
    await page.getByTestId("trivia-pin-input").fill("123");
    await page.getByTestId("trivia-join-btn").click();

    await expect(page.getByTestId("trivia-pin-error")).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("takes a full trivia PIN to that game", async ({ page }) => {
    await page.getByTestId("trivia-pin-input").fill("123456");
    await page.getByTestId("trivia-join-btn").click();
    await expect(page).toHaveURL(/\/trivia\/play\/123456/);
  });

  test("refuses a room code that could not exist", async ({ page }) => {
    // O is deliberately not in the alphabet, because it is misread as zero.
    await page.getByTestId("scribblex-code-input").fill("ABC23O");
    await page.getByTestId("scribblex-join-btn").click();
    await expect(page.getByTestId("scribblex-code-error")).toBeVisible();
  });

  test("sends a valid room code through the profile step", async ({ page }) => {
    await page.getByTestId("scribblex-code-input").fill("ABC234");
    await page.getByTestId("scribblex-join-btn").click();
    await expect(page).toHaveURL(/\/scribblex\/avatar\?.*intent=join.*code=ABC234/);
  });

  test("reaches the room browser", async ({ page }) => {
    await page.getByTestId("scribblex-browse-btn").click();
    await expect(page).toHaveURL(/\/scribblex\/rooms/);
    await expect(page.getByRole("heading", { name: "Live rooms" })).toBeVisible();
  });
});

test.describe("old invite links", () => {
  test("still reach the game after the route move", async ({ page }) => {
    // Links already shared before trivia moved under /trivia must not break.
    await page.goto("/play/123456");
    await expect(page).toHaveURL(/\/trivia\/play\/123456/);
  });

  test("redirect the host routes too", async ({ page }) => {
    await page.goto("/host/create");
    await expect(page).toHaveURL(/\/trivia\/host\/create/);
  });
});
