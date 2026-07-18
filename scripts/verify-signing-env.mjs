import { existsSync, statSync } from "node:fs";
import path from "node:path";

const platform = process.argv[2];

const requiredByPlatform = {
  windows: ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"],
  macos: [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "APPLE_TEAM_ID",
  ],
  linux: [],
};

if (!(platform in requiredByPlatform)) {
  console.error(`Unknown release platform: ${platform ?? "missing"}`);
  process.exit(1);
}

const missing = requiredByPlatform[platform].filter(
  (name) => !process.env[name],
);
if (missing.length > 0) {
  console.error(
    `Release signing is enabled, but ${platform} is missing: ${missing.join(", ")}`,
  );
  process.exit(1);
}

if (platform === "macos") {
  const apiKeyPath = process.env.APPLE_API_KEY;
  if (
    !apiKeyPath ||
    !path.isAbsolute(apiKeyPath) ||
    !existsSync(apiKeyPath) ||
    !statSync(apiKeyPath).isFile()
  ) {
    console.error(
      "APPLE_API_KEY must be an existing absolute filesystem path to a .p8 key.",
    );
    process.exit(1);
  }
}

console.log(`${platform} release credential names are present.`);
