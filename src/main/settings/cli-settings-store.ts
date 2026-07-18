import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderId } from "../../shared/contracts";

export type ProviderCommands = Record<ProviderId, string>;

export const DEFAULT_PROVIDER_COMMANDS: ProviderCommands = {
  claude: "claude",
  codex: "codex",
};

interface StoredCliSettings {
  schemaVersion: 1;
  commands: Partial<ProviderCommands>;
}

export class CliSettingsStore {
  private readonly filePath: string;

  constructor(private readonly dataDirectory: string) {
    this.filePath = path.join(dataDirectory, "cli-settings.json");
  }

  private async read(): Promise<StoredCliSettings> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as StoredCliSettings;
      if (parsed.schemaVersion !== 1 || !parsed.commands) throw new Error();
      const commands: Partial<ProviderCommands> = {};
      for (const provider of ["claude", "codex"] as const) {
        const candidate = parsed.commands[provider];
        if (typeof candidate === "string" && path.isAbsolute(candidate)) {
          commands[provider] = candidate;
        }
      }
      return { schemaVersion: 1, commands };
    } catch {
      return { schemaVersion: 1, commands: {} };
    }
  }

  private async write(settings: StoredCliSettings): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  async getCommands(): Promise<ProviderCommands> {
    const stored = await this.read();
    return { ...DEFAULT_PROVIDER_COMMANDS, ...stored.commands };
  }

  async setCommand(provider: ProviderId, executable: string): Promise<void> {
    if (!path.isAbsolute(executable)) {
      throw new Error("The provider executable path must be absolute.");
    }
    try {
      const details = await stat(executable);
      if (!details.isFile()) throw new Error();
    } catch {
      throw new Error("The provider executable must be an existing file.");
    }
    const stored = await this.read();
    await this.write({
      schemaVersion: 1,
      commands: { ...stored.commands, [provider]: executable },
    });
  }

  async resetCommand(provider: ProviderId): Promise<void> {
    const stored = await this.read();
    delete stored.commands[provider];
    await this.write(stored);
  }
}
