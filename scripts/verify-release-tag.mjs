import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function verifyReleaseTag(tagName) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tagName)) {
    throw new Error("Release tag must use semantic version form vX.Y.Z.");
  }
  const objectType = git("cat-file", "-t", `refs/tags/${tagName}`);
  if (objectType !== "tag") {
    throw new Error(
      "Release tag must be annotated or cryptographically signed.",
    );
  }

  const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
  if (packageMetadata.version !== tagName.slice(1)) {
    throw new Error(
      `Release tag ${tagName} does not match package version ${packageMetadata.version ?? "missing"}.`,
    );
  }
  console.log(`${tagName} is an annotated release tag matching package.json.`);
}

try {
  await verifyReleaseTag(process.argv[2] ?? "");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Release tag is invalid.",
  );
  process.exitCode = 1;
}
