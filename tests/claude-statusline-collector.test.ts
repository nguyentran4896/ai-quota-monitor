import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Claude status-line collector", () => {
  it("stores only allow-listed quota fields on every desktop platform", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-collector-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const snapshotPath = path.join(dataDirectory, "quota.json");
    const collectorPath = path.resolve("resources", "claude-statusline.cjs");
    const input = {
      version: "2.1.214",
      session_id: "must-not-be-stored",
      transcript_path: "/private/transcript.jsonl",
      workspace: { current_dir: "/private/project" },
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1_800_000_000 },
        seven_day: { used_percentage: 41.2, resets_at: 1_800_500_000 },
      },
    };

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [collectorPath, snapshotPath], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve(stdout.trim())
          : reject(new Error(stderr || `exit ${code}`)),
      );
      child.stdin.end(JSON.stringify(input));
    });

    expect(output).toBe("QuotaDeck - 5h 24% used | 7d 41% used");
    const rawSnapshot = await readFile(snapshotPath, "utf8");
    expect(JSON.parse(rawSnapshot)).toMatchObject({
      schemaVersion: 1,
      cliVersion: "2.1.214",
      rateLimits: {
        fiveHour: { usedPercent: 23.5, resetsAt: 1_800_000_000 },
        sevenDay: { usedPercent: 41.2, resetsAt: 1_800_500_000 },
      },
    });
    expect(rawSnapshot).not.toMatch(/session|transcript|workspace|private/i);
  });
});
