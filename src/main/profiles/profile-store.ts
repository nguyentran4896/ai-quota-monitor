import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AddProfileInput, ProviderId } from "../../shared/contracts";
import { describeProviderCapabilities } from "../platform";

export interface ProviderProfile {
  id: string;
  provider: ProviderId;
  displayName: string;
  configRoot: string | null;
  quotaRoot?: string | null;
  isManaged: boolean;
  verifiedIdentity?: string | null;
  verifiedIdentityVerifier?: string | null;
  createdAt: string;
}

interface StoredProfiles {
  schemaVersion: 1;
  profiles: ProviderProfile[];
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// Labels are compared trimmed, whitespace-collapsed, and case-folded so
// "Work", "work", and " work " are treated as the same name within a provider.
function labelKey(value: string): string {
  return normalizeLabel(value).toLocaleLowerCase("en-US");
}

function validateDisplayName(value: string): string {
  const normalized = normalizeLabel(value);
  if (
    normalized.length < 2 ||
    normalized.length > 48 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error("Account name must be between 2 and 48 characters.");
  }
  return normalized;
}

function isProvider(value: unknown): value is ProviderId {
  return value === "claude" || value === "codex";
}

export class ProfileStore {
  private readonly filePath: string;
  private readonly profilesRoot: string;

  constructor(
    private readonly dataDirectory: string,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.filePath = path.join(dataDirectory, "profiles.json");
    this.profilesRoot = path.join(dataDirectory, "profiles");
  }

  private builtInProfiles(): ProviderProfile[] {
    return [
      {
        id: "claude-current",
        provider: "claude",
        displayName: "Current Claude",
        configRoot: null,
        quotaRoot: path.join(
          this.dataDirectory,
          "observations",
          "claude-current",
        ),
        isManaged: false,
        verifiedIdentity: null,
        verifiedIdentityVerifier: null,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      {
        id: "codex-current",
        provider: "codex",
        displayName: "Current Codex",
        configRoot: null,
        quotaRoot: null,
        isManaged: false,
        verifiedIdentity: null,
        verifiedIdentityVerifier: null,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
    ];
  }

  private async readManaged(): Promise<ProviderProfile[]> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as StoredProfiles;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.profiles))
        return [];
      return parsed.profiles
        .filter(
          (profile) =>
            typeof profile?.id === "string" &&
            isProvider(profile.provider) &&
            typeof profile.displayName === "string" &&
            profile.displayName.trim().length >= 2 &&
            profile.displayName.trim().length <= 48 &&
            !/[\u0000-\u001f\u007f]/.test(profile.displayName) &&
            typeof profile.configRoot === "string" &&
            profile.isManaged === true &&
            this.isAppOwnedPath(profile.configRoot),
        )
        .map((profile) => ({
          ...profile,
          quotaRoot: profile.configRoot,
          verifiedIdentity:
            typeof profile.verifiedIdentity === "string" &&
            profile.verifiedIdentity.includes("***") &&
            profile.verifiedIdentity.length <= 128 &&
            !/[\u0000-\u001f\u007f]/.test(profile.verifiedIdentity)
              ? profile.verifiedIdentity
              : null,
          verifiedIdentityVerifier:
            typeof profile.verifiedIdentityVerifier === "string" &&
            /^[a-f0-9]{64}$/.test(profile.verifiedIdentityVerifier)
              ? profile.verifiedIdentityVerifier
              : null,
        }));
    } catch {
      return [];
    }
  }

  private isAppOwnedPath(candidate: string): boolean {
    const resolvedRoot = path.resolve(this.profilesRoot);
    const resolvedCandidate = path.resolve(candidate);
    return resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
  }

  private async writeManaged(profiles: ProviderProfile[]): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const payload: StoredProfiles = { schemaVersion: 1, profiles };
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }

  async list(): Promise<ProviderProfile[]> {
    return [...this.builtInProfiles(), ...(await this.readManaged())];
  }

  // Rejects a label that collides (case-insensitively) with another profile of
  // the same provider. Legacy duplicate data already on disk is left loadable;
  // only new writes (create/rename) are held to uniqueness.
  private async assertUniqueLabel(
    provider: ProviderId,
    displayName: string,
    exceptId?: string,
  ): Promise<void> {
    const key = labelKey(displayName);
    const collides = (await this.list()).some(
      (profile) =>
        profile.provider === provider &&
        profile.id !== exceptId &&
        labelKey(profile.displayName) === key,
    );
    if (collides) {
      throw new Error(
        `An account named "${displayName}" already exists for ${
          provider === "claude" ? "Claude" : "Codex"
        }. Choose a different label.`,
      );
    }
  }

  async get(profileId: string): Promise<ProviderProfile | null> {
    return (
      (await this.list()).find((profile) => profile.id === profileId) ?? null
    );
  }

  async create(input: AddProfileInput): Promise<ProviderProfile> {
    if (!isProvider(input.provider)) throw new Error("Unsupported provider.");
    const capability = describeProviderCapabilities(this.platform)[
      input.provider
    ];
    if (!capability.managedProfiles) {
      throw new Error(
        capability.reason ??
          "Managed profiles are unavailable on this platform.",
      );
    }

    const displayName = validateDisplayName(input.displayName);
    await this.assertUniqueLabel(input.provider, displayName);
    const id = randomUUID();
    const configRoot = path.join(
      this.profilesRoot,
      id,
      `${input.provider}-home`,
    );
    if (!this.isAppOwnedPath(configRoot)) {
      throw new Error("Profile path escaped the application data directory.");
    }

    await mkdir(configRoot, { recursive: true, mode: 0o700 });
    const profile: ProviderProfile = {
      id,
      provider: input.provider,
      displayName,
      configRoot,
      quotaRoot: configRoot,
      isManaged: true,
      verifiedIdentity: null,
      verifiedIdentityVerifier: null,
      createdAt: new Date().toISOString(),
    };
    const profiles = await this.readManaged();
    await this.writeManaged([...profiles, profile]);
    return profile;
  }

  async verifyIdentity(
    profileId: string,
    maskedIdentity: string,
    identityVerifier: string,
  ): Promise<ProviderProfile> {
    const normalized = maskedIdentity.trim();
    if (
      normalized.length < 2 ||
      normalized.length > 128 ||
      !normalized.includes("***") ||
      /[\u0000-\u001f\u007f]/.test(normalized)
    ) {
      throw new Error("Verified account identity must be masked and valid.");
    }
    if (!/^[a-f0-9]{64}$/.test(identityVerifier)) {
      throw new Error("Verified account identity proof must be valid.");
    }

    const profiles = await this.readManaged();
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error("Managed profile was not found.");
    const updated = {
      ...profile,
      verifiedIdentity: normalized,
      verifiedIdentityVerifier: identityVerifier,
    };
    await this.writeManaged(
      profiles.map((candidate) =>
        candidate.id === profileId ? updated : candidate,
      ),
    );
    return updated;
  }

  async rename(
    profileId: string,
    displayName: string,
  ): Promise<ProviderProfile> {
    const normalized = validateDisplayName(displayName);
    const profiles = await this.readManaged();
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error("Managed profile was not found.");
    await this.assertUniqueLabel(profile.provider, normalized, profileId);
    const updated = { ...profile, displayName: normalized };
    await this.writeManaged(
      profiles.map((candidate) =>
        candidate.id === profileId ? updated : candidate,
      ),
    );
    return updated;
  }

  async getRemovalTarget(
    profileId: string,
  ): Promise<{ profile: ProviderProfile; profileDirectory: string }> {
    if (this.builtInProfiles().some((profile) => profile.id === profileId)) {
      throw new Error("Built-in profiles cannot be removed.");
    }

    const profiles = await this.readManaged();
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile?.configRoot) throw new Error("Managed profile was not found.");
    const profileDirectory = path.dirname(profile.configRoot);
    if (
      !this.isAppOwnedPath(profile.configRoot) ||
      !this.isAppOwnedPath(profileDirectory)
    ) {
      throw new Error("Profile path escaped the application data directory.");
    }

    return { profile, profileDirectory };
  }

  async remove(
    profileId: string,
  ): Promise<{ profile: ProviderProfile; profileDirectory: string }> {
    const target = await this.getRemovalTarget(profileId);
    const profiles = await this.readManaged();
    await this.writeManaged(
      profiles.filter((candidate) => candidate.id !== profileId),
    );
    return target;
  }
}
