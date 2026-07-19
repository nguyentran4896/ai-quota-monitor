import { expect, test } from "@playwright/test";
import { injectBridge, manyAccountsDashboard } from "./fixtures";

// These render the real CSS in a real browser. jsdom applies no layout, so the
// unit suite can only assert the CSS *contract* statically; this proves the
// pixels actually behave.

test.describe("Smart Switcher scaling with a large collection", () => {
  for (const width of [1040, 1280, 1440]) {
    test(`bounds the switcher list and keeps the launch action reachable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await injectBridge(page, manyAccountsDashboard(14));
      await page.goto("/");
      await expect(page.getByText("Your AI runway,")).toBeVisible();

      const list = page.locator(".switcher-list");
      await expect(list).toBeVisible();

      // The regression: without a base-rule max-height, 14 rows made the list as
      // tall as its content and pushed the launch button off-screen. The list
      // must clip and scroll internally instead.
      const metrics = await list.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }));
      expect(metrics.overflowY).toBe("auto");
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
      expect(metrics.clientHeight).toBeLessThanOrEqual(380);

      // The launch/setup action is present and reachable (scrolls into view
      // within the panel rather than being buried below an unbounded list).
      const launch = page.locator(".switcher-panel .primary-action");
      await expect(launch).toBeVisible();
      await launch.scrollIntoViewIfNeeded();
      await expect(launch).toBeInViewport();
    });
  }
});

test.describe("Accounts search focus indicator", () => {
  test("paints a visible focus ring when the search box is focused", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await injectBridge(page, manyAccountsDashboard(14));
    await page.goto("/");
    await expect(page.getByText("Your AI runway,")).toBeVisible();

    await page.getByRole("button", { name: /Accounts/i }).click();
    const search = page.getByRole("searchbox");
    await expect(search).toBeVisible();

    // Regression: the input drops its native outline. The wrapper must supply a
    // replacement via :focus-within, or keyboard focus becomes invisible.
    const wrapper = page.locator(".accounts-search");
    const before = await wrapper.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );
    await search.focus();
    const after = await wrapper.evaluate(
      (element) => getComputedStyle(element).boxShadow,
    );

    expect(after).not.toBe("none");
    expect(after).not.toBe(before);
  });

  test("focuses the search box from the Ctrl+K shortcut", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await injectBridge(page, manyAccountsDashboard(14));
    await page.goto("/");
    await expect(page.getByText("Your AI runway,")).toBeVisible();

    await page.getByRole("button", { name: /Accounts/i }).click();
    const search = page.getByRole("searchbox");
    await expect(search).not.toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(search).toBeFocused();
  });
});
