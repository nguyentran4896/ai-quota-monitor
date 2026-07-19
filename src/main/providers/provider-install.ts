import type {
  ProviderId,
  ProviderInstallGuidance,
} from "../../shared/contracts";

// Canonical, first-party installation documentation. Verified against the
// official Anthropic and OpenAI docs. QuotaDeck only ever opens these in the
// user's browser — it never downloads or runs an installer itself.
const providerInstallUrls: Record<ProviderId, string> = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
};

export function providerInstallUrl(provider: ProviderId): string {
  return providerInstallUrls[provider];
}

// Short, platform-aware setup guidance surfaced in CLI settings. Windows users
// are the primary audience, and the most common Codex mistake is assuming the
// ChatGPT desktop/Microsoft Store app is the CLI — it is not.
const providerInstallGuidance: Record<ProviderId, ProviderInstallGuidance> = {
  claude: {
    headline: "Install the official Claude Code CLI, then sign in once.",
    windowsCommand: "irm https://claude.ai/install.ps1 | iex",
    signIn: "Run claude and follow the browser sign-in.",
    verify: "claude --version",
    note: "winget install Anthropic.ClaudeCode also works. A Pro, Max, Team, Enterprise, or Console account is required.",
  },
  codex: {
    headline: "Install the standalone Codex CLI, then sign in with ChatGPT.",
    windowsCommand: "npm install -g @openai/codex",
    signIn: "Run codex and choose Sign in with ChatGPT.",
    verify: "codex --version",
    note: "Requires Node.js 22+. The ChatGPT desktop app and the Microsoft Store listing are not the Codex CLI — install the @openai/codex package, not the unrelated unscoped codex package.",
  },
};

export function providerInstallGuidanceFor(
  provider: ProviderId,
): ProviderInstallGuidance {
  return providerInstallGuidance[provider];
}
