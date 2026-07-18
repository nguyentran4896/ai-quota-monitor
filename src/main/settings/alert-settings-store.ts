import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AlertThreshold } from "../../shared/contracts";

const DEFAULT_THRESHOLD: AlertThreshold = null;

interface StoredAlertSettings {
  schemaVersion: 1;
  thresholdPercent: AlertThreshold;
}

export function isAlertThreshold(value: unknown): value is AlertThreshold {
  return value === null || value === 75 || value === 85 || value === 95;
}

export class AlertSettingsStore {
  private readonly filePath: string;

  constructor(private readonly dataDirectory: string) {
    this.filePath = path.join(dataDirectory, "alert-settings.json");
  }

  async getThreshold(): Promise<AlertThreshold> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as StoredAlertSettings;
      if (
        parsed.schemaVersion !== 1 ||
        !isAlertThreshold(parsed.thresholdPercent)
      ) {
        return DEFAULT_THRESHOLD;
      }
      return parsed.thresholdPercent;
    } catch {
      return DEFAULT_THRESHOLD;
    }
  }

  async setThreshold(threshold: AlertThreshold): Promise<void> {
    if (!isAlertThreshold(threshold)) {
      throw new Error("Alert threshold must be off, 75, 85, or 95 percent.");
    }
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(
        { schemaVersion: 1, thresholdPercent: threshold },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, this.filePath);
  }
}
