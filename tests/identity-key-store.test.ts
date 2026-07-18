import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { IdentityKeyStore } from "../src/main/settings/identity-key-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("IdentityKeyStore", () => {
  it("creates one stable device-local verification key", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-identity-key-"),
    );
    temporaryDirectories.push(directory);
    const store = new IdentityKeyStore(directory);

    const first = await store.getKey();
    const second = await store.getKey();

    expect(first).toHaveLength(32);
    expect(second).toEqual(first);
  });
});
