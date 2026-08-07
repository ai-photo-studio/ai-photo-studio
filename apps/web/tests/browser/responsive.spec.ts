import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";

/**
 * Compact responsive matrix: representative implemented pages checked at the
 * required viewport set. This intentionally does not duplicate the full
 * smoke-test assertion set per viewport -- only overflow, error-free load,
 * network safety, and primary-control visibility/usability are checked here,
 * since the functional/accessibility depth is already covered by smoke.spec.ts.
 */

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 }
] as const;

const PAGES = [
  {
    path: "/",
    heading: /Bring Your Precious Memories Back to Life/,
    primaryRole: "button" as const,
    primaryName: "Upload a photo",
    primaryExact: true
  },
  {
    path: "/login",
    heading: "Return to a protected customer workspace that feels premium.",
    primaryRole: "button" as const,
    primaryName: "Log in",
    primaryExact: false
  },
  {
    path: "/restore/new",
    heading: "Upload Photos for Restoration",
    primaryRole: "button" as const,
    primaryName: /drag and drop your image here/i,
    primaryExact: false
  }
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`responsive matrix @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const target of PAGES) {
      test(`${target.path} has no overflow and a usable primary control`, async ({
        page,
        consoleErrors,
        pageErrors,
        failedFirstPartyRequests,
        blockedRequests
      }) => {
        await page.goto(target.path);
        await expect(page.getByRole("heading", { level: 1, name: target.heading })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        expectNoPageErrors(consoleErrors, pageErrors);
        expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
        expectCleanNetwork(blockedRequests);

        // "Usable" means reachable by normal scrolling and visible once
        // scrolled to -- not necessarily above the fold with zero scroll.
        // On short mobile viewports a content-rich hero/auth layout
        // legitimately pushes the primary control below the initial fold;
        // requiring zero-scroll visibility there would be testing an
        // unreasonable bar, not a real defect.
        const primary = page.getByRole(target.primaryRole, { name: target.primaryName, exact: target.primaryExact });
        await primary.scrollIntoViewIfNeeded();
        await expect(primary).toBeVisible();
      });
    }
  });
}
