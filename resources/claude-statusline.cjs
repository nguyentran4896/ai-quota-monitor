"use strict";

const fs = require("node:fs");
const path = require("node:path");

process.stdout.on("error", (error) => {
  if (error?.code === "EPIPE") process.exit(0);
  throw error;
});

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWindow(value) {
  if (!value || typeof value !== "object") return null;
  const usedPercent = finiteNumber(value.used_percentage);
  const resetsAt = finiteNumber(value.resets_at);
  if (usedPercent === null || resetsAt === null) return null;
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    resetsAt: Math.trunc(resetsAt),
  };
}

function finish(message) {
  process.stdout.write(`${message}\n`);
}

try {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error("Missing output path");

  let rawInput = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    rawInput += chunk;
  });
  process.stdin.on("end", () => {
    try {
      if (!rawInput.trim()) {
        finish("QuotaDeck - waiting for quota data");
        return;
      }

      const input = JSON.parse(rawInput);
      const fiveHour = normalizeWindow(input?.rate_limits?.five_hour);
      const sevenDay = normalizeWindow(input?.rate_limits?.seven_day);
      if (!fiveHour && !sevenDay) {
        finish("QuotaDeck - waiting for first Claude response");
        return;
      }

      const rateLimits = {};
      if (fiveHour) rateLimits.fiveHour = fiveHour;
      if (sevenDay) rateLimits.sevenDay = sevenDay;
      const snapshot = {
        schemaVersion: 1,
        observedAt: new Date().toISOString(),
        cliVersion:
          typeof input.version === "string" ? input.version.slice(0, 64) : null,
        rateLimits,
      };

      fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
      const temporaryPath = `${outputPath}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, outputPath);

      const segments = [];
      if (fiveHour)
        segments.push(`5h ${Math.round(fiveHour.usedPercent)}% used`);
      if (sevenDay)
        segments.push(`7d ${Math.round(sevenDay.usedPercent)}% used`);
      finish(`QuotaDeck - ${segments.join(" | ")}`);
    } catch {
      finish("QuotaDeck - quota capture unavailable");
    }
  });
} catch {
  finish("QuotaDeck - quota capture unavailable");
}
