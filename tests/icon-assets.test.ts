import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("generated application icons", () => {
  it("keeps committed icons in sync with the deterministic generator", async () => {
    const pngPath = path.join(projectRoot, "build", "icon.png");
    const icoPath = path.join(projectRoot, "build", "icon.ico");
    const committedPng = await readFile(pngPath);
    const committedIco = await readFile(icoPath);

    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, "scripts", "render-icon.mjs")],
      { cwd: projectRoot, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);

    const generatedPng = await readFile(pngPath);
    const ico = await readFile(icoPath);
    expect(generatedPng).toEqual(committedPng);
    expect(ico).toEqual(committedIco);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(5);

    const firstImageOffset = ico.readUInt32LE(6 + 12);
    expect(ico.subarray(firstImageOffset, firstImageOffset + 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });
});
