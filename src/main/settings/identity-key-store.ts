import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY_BYTES = 32;

export class IdentityKeyStore {
  private readonly filePath: string;

  constructor(private readonly dataDirectory: string) {
    this.filePath = path.join(dataDirectory, "identity-verifier.key");
  }

  async getKey(): Promise<Buffer> {
    try {
      const existing = await readFile(this.filePath);
      if (existing.length === KEY_BYTES) return existing;
    } catch {
      // Create a new local key below.
    }

    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const key = randomBytes(KEY_BYTES);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, key, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
    return key;
  }
}
