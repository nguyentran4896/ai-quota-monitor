import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DIRECTORY_PREFIX = "quotadeck-notary-";
const KEY_FILE_NAME = "AuthKey_QuotaDeck.p8";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function decodePrivateKey(encoded) {
  const compact = encoded.replaceAll(/\s/g, "");
  if (
    compact.length === 0 ||
    compact.length > 128_000 ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)
  ) {
    throw new Error("APPLE_API_KEY_BASE64 is not valid base64.");
  }
  const decoded = Buffer.from(compact, "base64");
  const text = decoded.toString("utf8");
  if (
    decoded.length === 0 ||
    decoded.length > 64_000 ||
    !text.includes("-----BEGIN PRIVATE KEY-----") ||
    !text.includes("-----END PRIVATE KEY-----")
  ) {
    throw new Error(
      "APPLE_API_KEY_BASE64 is not an App Store Connect .p8 key.",
    );
  }
  return decoded;
}

async function prepare() {
  const encoded = process.env.APPLE_API_KEY_BASE64;
  const githubEnvironment = process.env.GITHUB_ENV;
  const runnerTemp = process.env.RUNNER_TEMP ?? os.tmpdir();
  if (!encoded) throw new Error("APPLE_API_KEY_BASE64 is missing.");
  if (!githubEnvironment) throw new Error("GITHUB_ENV is missing.");

  const key = decodePrivateKey(encoded);
  const directory = await mkdtemp(path.join(runnerTemp, DIRECTORY_PREFIX));
  const keyPath = path.join(directory, KEY_FILE_NAME);
  await writeFile(keyPath, key, { mode: 0o600 });
  await appendFile(githubEnvironment, `APPLE_API_KEY=${keyPath}\n`, "utf8");
  console.log(
    "Apple notarization key prepared in the runner temporary directory.",
  );
}

async function cleanup() {
  const keyPath = process.env.APPLE_API_KEY;
  const runnerTemp = path.resolve(process.env.RUNNER_TEMP ?? os.tmpdir());
  if (!keyPath) {
    console.log("No Apple notarization key path was present.");
    return;
  }

  const resolvedKeyPath = path.resolve(keyPath);
  const directory = path.dirname(resolvedKeyPath);
  if (
    !resolvedKeyPath.startsWith(`${runnerTemp}${path.sep}`) ||
    !path.basename(directory).startsWith(DIRECTORY_PREFIX) ||
    path.basename(resolvedKeyPath) !== KEY_FILE_NAME
  ) {
    throw new Error("Refusing to remove an unexpected notarization key path.");
  }
  await rm(directory, { recursive: true, force: true });
  console.log("Apple notarization key removed from the runner.");
}

const command = process.argv[2];
try {
  if (command === "prepare") await prepare();
  else if (command === "cleanup") await cleanup();
  else
    throw new Error("Usage: node scripts/apple-api-key.mjs <prepare|cleanup>");
} catch (error) {
  fail(error instanceof Error ? error.message : "Apple key operation failed.");
}
