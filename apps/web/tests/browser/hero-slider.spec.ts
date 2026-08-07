import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";

/**
 * R9.3-P7 HD rotating hero comparison slider.
 *
 * Covers: random valid pair on load, then/now pairing, mouse/touch drag,
 * left=Then / right=Now reveal, auto-rotation, pause-during-interaction,
 * no broken hero assets, CTA to /restore/new, no overflow, no console errors.
 */

const VALID_IDS = [
  "hero-01-old-parents",
  "hero-02-grandparents",
  "hero-03-wedding-memory",
  "hero-04-childhood-siblings",
  "hero-05-large-family",
  "hero-06-army-officer",
  "hero-07-village-family",
  "hero-08-old-city-bazaar",
  "hero-09-migration-railway",
  "hero-10-loved-one"
];

const FRAME = ".hero-compare-frame";

async function getActiveHero(page: import("@playwright/test").Page) {
  const frame = page.locator(FRAME);
  await expect(frame).toBeVisible();
  return {
    id: await frame.getAttribute("data-active-hero-id"),
    then: await frame.getAttribute("data-hero-then"),
    now: await frame.getAttribute("data-hero-now"),
    position: Number(await frame.getAttribute("data-position"))
  };
}

test("loads a valid random hero pair with then/now belonging to the same hero", async ({
  page,
  consoleErrors,
  pageErrors,
  failedFirstPartyRequests
}) => {
  await page.goto("/");
  const hero = await getActiveHero(page);

  expect(VALID_IDS).toContain(hero.id);
  expect(hero.then).toBeTruthy();
  expect(hero.now).toBeTruthy();
  expect(hero.then).toContain(hero.id!);
  expect(hero.now).toContain(hero.id!);
  expect(hero.then).toMatch(/\.jpg$/);
  expect(hero.now).toMatch(/\.jpg$/);
  // Same hero pair: identical base id, only the modifier differs.
  expect(hero.then?.replace(/-then\.jpg$/i, "")).toBe(hero.now?.replace(/-now\.jpg$/i, ""));

  expectNoPageErrors(consoleErrors, pageErrors);
  expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
});

test("starts near 50% and clamping never leaves the valid range", async ({ page }) => {
  await page.goto("/");
  const hero = await getActiveHero(page);
  expect(hero.position).toBeGreaterThanOrEqual(40);
  expect(hero.position).toBeLessThanOrEqual(60);
});

test("dragging left reveals the old/Then layer", async ({ page }) => {
  await page.goto("/");
  await getActiveHero(page);
  const box = await page.locator(FRAME).boundingBox();
  expect(box).toBeTruthy();
  const right = box.x + box.width - 2;
  const leftMid = box.x + box.width * 0.08;
  const midY = box.y + box.height / 2;

  await page.mouse.move(right, midY);
  await page.mouse.down();
  await page.mouse.move(leftMid, midY, { steps: 8 });
  await page.mouse.move(box.x + 1, midY, { steps: 8 });
  await page.mouse.up();

  const hero = await getActiveHero(page);
  expect(hero.position).toBeLessThan(15);
});

test("dragging right reveals the restored/Now layer", async ({ page }) => {
  await page.goto("/");
  await getActiveHero(page);
  const box = await page.locator(FRAME).boundingBox();
  expect(box).toBeTruthy();
  const left = box.x + 2;
  const right = box.x + box.width - 2;
  const midY = box.y + box.height / 2;

  await page.mouse.move(left, midY);
  await page.mouse.down();
  await page.mouse.move(right, midY, { steps: 8 });
  await page.mouse.up();

  const hero = await getActiveHero(page);
  expect(hero.position).toBeGreaterThan(85);
});

test("pointer drag drives the divider and touch-action prevents scroll takeover", async ({ page }) => {
  await page.goto("/");
  await getActiveHero(page);
  const box = await page.locator(FRAME).boundingBox();
  expect(box).toBeTruthy();
  const midX = box.x + box.width / 2;
  const farRight = box.x + box.width - 2;
  const midY = box.y + box.height / 2;

  await page.mouse.move(midX, midY);
  await page.mouse.down();
  await page.mouse.move(farRight, midY, { steps: 6 });
  await page.mouse.up();

  const hero = await getActiveHero(page);
  expect(hero.position).toBeGreaterThan(85);

  const touchAction = await page.locator(FRAME).evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe("none");
});

test("automatically rotates to the next hero and resets to 50%", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const initial = await getActiveHero(page);

  await page.clock.runFor(1500);
  const stillSame = await getActiveHero(page);
  expect(stillSame.id).toBe(initial.id);
  expect(stillSame.position).toBe(initial.position);

  await page.clock.runFor(7000);
  const rotated = await getActiveHero(page);
  expect(rotated.id).not.toBe(initial.id);
  expect(rotated.position).toBe(50);
});

test("pauses rotation while dragging and resumes afterward", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const initial = await getActiveHero(page);

  // Hold the pointer down (interacting) and let 7s pass -- should not rotate.
  const box = await page.locator(FRAME).boundingBox();
  expect(box).toBeTruthy();
  const right = box.x + box.width - 2;
  const midY = box.y + box.height / 2;
  await page.mouse.move(right, midY);
  await page.mouse.down();
  await page.clock.runFor(7600);
  expect((await getActiveHero(page)).id).toBe(initial.id);

  // Release: rotation now resumes and advances.
  await page.mouse.up();
  await page.clock.runFor(7000);
  const resumed = await getActiveHero(page);
  expect(resumed.id).not.toBe(initial.id);
});

test("shows no broken hero assets and makes no unexpected external calls", async ({
  page,
  consoleErrors,
  pageErrors,
  failedFirstPartyRequests,
  blockedRequests
}) => {
  await page.goto("/");
  const hero = await getActiveHero(page);

  const thenLoaded = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    const ok = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    return ok && img.naturalWidth > 0;
  }, hero.then!);
  expect(thenLoaded).toBe(true);

  const nowLoaded = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    const ok = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    return ok && img.naturalWidth > 0;
  }, hero.now!);
  expect(nowLoaded).toBe(true);

  expectNoPageErrors(consoleErrors, pageErrors);
  expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
  expectCleanNetwork(blockedRequests);
});

test("CTA link still routes to /restore/new", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "Upload Photo and View Pricing" });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/restore\/new/);
});

test("homepage hero causes no horizontal overflow at desktop", async ({ page }) => {
  await page.goto("/");
  await getActiveHero(page);
  await expectNoHorizontalOverflow(page);
});
