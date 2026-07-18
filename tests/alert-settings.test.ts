import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AlertSettingsStore } from "../src/main/settings/alert-settings-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("AlertSettingsStore", () => {
  it("defaults to off and persists an allowed threshold", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-alert-settings-"),
    );
    temporaryDirectories.push(directory);
    const store = new AlertSettingsStore(directory);

    await expect(store.getThreshold()).resolves.toBeNull();
    await store.setThreshold(95);
    await expect(store.getThreshold()).resolves.toBe(95);
    await store.setThreshold(null);
    await expect(store.getThreshold()).resolves.toBeNull();
  });

  it("rejects unsupported values and ignores malformed settings", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-alert-settings-"),
    );
    temporaryDirectories.push(directory);
    const store = new AlertSettingsStore(directory);

    await expect(store.setThreshold(82 as never)).rejects.toThrow(
      "75, 85, or 95",
    );
    await writeFile(
      path.join(directory, "alert-settings.json"),
      '{"schemaVersion":1,"thresholdPercent":"token-secret"}',
      "utf8",
    );
    await expect(store.getThreshold()).resolves.toBeNull();
  });
});
