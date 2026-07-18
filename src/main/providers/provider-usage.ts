import type { ProviderId } from "../../shared/contracts";

const providerUsageUrls: Record<ProviderId, string> = {
  claude:
    "https://support.claude.com/en/articles/14553413-claude-code-cheatsheet",
  codex: "https://help.openai.com/en/articles/12642688",
};

export function providerUsageUrl(provider: ProviderId): string {
  return providerUsageUrls[provider];
}
