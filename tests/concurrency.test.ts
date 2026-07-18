import { describe, expect, it } from "vitest";
import {
  createAsyncRequestCoalescer,
  mapWithConcurrency,
} from "../src/main/services/concurrency";

describe("bounded asynchronous work", () => {
  it("preserves result order while respecting the concurrency limit", async () => {
    let active = 0;
    let highestActive = 0;
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (item) => {
        active += 1;
        highestActive = Math.max(highestActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return item * 10;
      },
    );

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(highestActive).toBe(2);
  });

  it("coalesces overlapping requests and starts fresh after invalidation", async () => {
    let calls = 0;
    const coalescer = createAsyncRequestCoalescer(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return calls;
    });

    const first = coalescer.run();
    const overlapping = coalescer.run();
    expect(overlapping).toBe(first);
    await expect(Promise.all([first, overlapping])).resolves.toEqual([1, 1]);

    coalescer.invalidate();
    await expect(coalescer.run()).resolves.toBe(2);
  });
});
