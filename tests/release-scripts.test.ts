import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const projectRoot = path.resolve(import.meta.dirname, "..");

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Apple notarization key preparation", () => {
  it("materializes a base64 key for later workflow steps and cleans it up", async () => {
    const runnerTemp = await temporaryDirectory("quotadeck-notary-test-");
    const githubEnvironment = path.join(runnerTemp, "github-env.txt");
    await writeFile(githubEnvironment, "", "utf8");
    const key =
      "-----BEGIN PRIVATE KEY-----\nquota-deck-test-key\n-----END PRIVATE KEY-----\n";
    const encodedKey = Buffer.from(key).toString("base64");
    const script = path.join(projectRoot, "scripts", "apple-api-key.mjs");
    const prepared = spawnSync(process.execPath, [script, "prepare"], {
      encoding: "utf8",
      env: {
        ...process.env,
        APPLE_API_KEY_BASE64: `${encodedKey.slice(0, 32)}\n${encodedKey.slice(32)}`,
        GITHUB_ENV: githubEnvironment,
        RUNNER_TEMP: runnerTemp,
      },
    });

    expect(prepared.status, prepared.stderr).toBe(0);
    const environmentLines = await readFile(githubEnvironment, "utf8");
    const keyPath = environmentLines
      .split(/\r?\n/)
      .find((line) => line.startsWith("APPLE_API_KEY="))
      ?.slice("APPLE_API_KEY=".length);
    expect(keyPath).toBeTruthy();
    await expect(readFile(keyPath!, "utf8")).resolves.toBe(key);

    const cleaned = spawnSync(process.execPath, [script, "cleanup"], {
      encoding: "utf8",
      env: {
        ...process.env,
        APPLE_API_KEY: keyPath,
        RUNNER_TEMP: runnerTemp,
      },
    });
    expect(cleaned.status, cleaned.stderr).toBe(0);
    await expect(readFile(keyPath!, "utf8")).rejects.toThrow();
  });

  it("rejects base64 content where notarization expects a key path", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, "scripts", "verify-signing-env.mjs"), "macos"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CSC_LINK: "test-certificate",
          CSC_KEY_PASSWORD: "test-password",
          APPLE_API_KEY: Buffer.from("not-a-path").toString("base64"),
          APPLE_API_KEY_ID: "TESTKEY123",
          APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
          APPLE_TEAM_ID: "TEAM123456",
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("filesystem path");
  });
});

describe("release tag verification", () => {
  async function createRepository(version: string): Promise<string> {
    const repository = await temporaryDirectory("quotadeck-tag-test-");
    await writeFile(
      path.join(repository, "package.json"),
      `${JSON.stringify({ version })}\n`,
      "utf8",
    );
    execFileSync("git", ["init", "--quiet"], { cwd: repository });
    execFileSync("git", ["config", "user.name", "QuotaDeck Test"], {
      cwd: repository,
    });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], {
      cwd: repository,
    });
    execFileSync("git", ["add", "package.json"], { cwd: repository });
    execFileSync("git", ["commit", "--quiet", "-m", "test release"], {
      cwd: repository,
    });
    return repository;
  }

  it("accepts an annotated semver tag matching package.json", async () => {
    const repository = await createRepository("1.2.3");
    execFileSync("git", ["tag", "-a", "v1.2.3", "-m", "release"], {
      cwd: repository,
    });
    const result = spawnSync(
      process.execPath,
      [path.join(projectRoot, "scripts", "verify-release-tag.mjs"), "v1.2.3"],
      { cwd: repository, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects lightweight and version-mismatched tags", async () => {
    const repository = await createRepository("1.2.3");
    execFileSync("git", ["tag", "v1.2.3"], { cwd: repository });
    const script = path.join(projectRoot, "scripts", "verify-release-tag.mjs");
    const lightweight = spawnSync(process.execPath, [script, "v1.2.3"], {
      cwd: repository,
      encoding: "utf8",
    });
    expect(lightweight.status).toBe(1);
    expect(lightweight.stderr).toContain("annotated");

    execFileSync("git", ["tag", "-a", "v2.0.0", "-m", "wrong version"], {
      cwd: repository,
    });
    const mismatch = spawnSync(process.execPath, [script, "v2.0.0"], {
      cwd: repository,
      encoding: "utf8",
    });
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain("package version");
  });
});

describe("release workflow trust boundary", () => {
  it("keeps unsigned builds secret-free and protects release builds", async () => {
    const workflow = await readFile(
      path.join(projectRoot, ".github", "workflows", "release.yml"),
      "utf8",
    );
    const unsignedBuild = workflow.split("  release-policy:")[0];

    expect(unsignedBuild).not.toContain("secrets.");
    expect(workflow).toContain("    environment: release");
    expect(workflow).toContain("scripts/verify-release-tag.mjs");
    expect(workflow).toContain("scripts/apple-api-key.mjs prepare");
    expect(workflow).toContain("-c.forceCodeSigning=true");
    expect(unsignedBuild).toContain("-c.mac.hardenedRuntime=false");
    expect(unsignedBuild).toContain("-c.mac.notarize=false");
    expect(workflow).toContain("Verify Authenticode signatures");
    expect(workflow).toContain("Verify notarization and signatures");
    expect(workflow).not.toContain("-print -quit");
    expect(workflow).toContain('test "$app_count" -eq 2');
    expect(workflow).toContain('xcrun stapler validate "$app_bundle"');
    expect(workflow).toContain('hdiutil verify "$artifact"');
    expect(workflow).toContain("SHA256SUMS.txt");
  });
});
