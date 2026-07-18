import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const runtimePath = process.argv[2] ?? process.execPath;
const collectorPath =
  process.argv[3] ?? path.resolve("resources", "claude-statusline.cjs");
const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "quotadeck-smoke-"),
);
const snapshotPath = path.join(temporaryDirectory, "quota.json");
const syntheticInput = {
  version: "smoke-test",
  session_id: "must-not-be-stored",
  transcript_path: "/private/transcript.jsonl",
  rate_limits: {
    five_hour: { used_percentage: 12.4, resets_at: 1_800_000_000 },
    seven_day: { used_percentage: 34.6, resets_at: 1_800_500_000 },
  },
};

try {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(runtimePath, [collectorPath, snapshotPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`Collector exited ${code}: ${stderr.trim()}`));
    });
    child.stdin.end(JSON.stringify(syntheticInput));
  });

  const snapshotText = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotText);
  if (result.stdout !== "QuotaDeck - 5h 12% used | 7d 35% used") {
    throw new Error(`Unexpected status line: ${result.stdout}`);
  }
  if (result.stderr)
    throw new Error(`Unexpected collector stderr: ${result.stderr}`);
  if (
    snapshot.rateLimits?.fiveHour?.usedPercent !== 12.4 ||
    snapshot.rateLimits?.sevenDay?.usedPercent !== 34.6
  ) {
    throw new Error(
      "Collector snapshot did not preserve the expected quota values.",
    );
  }
  if (/session|transcript|private/i.test(snapshotText)) {
    throw new Error("Collector persisted a field outside the allow list.");
  }
  console.log(
    `Collector smoke test passed with ${path.basename(runtimePath)}.`,
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
