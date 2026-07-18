import type { ProviderId } from "../../shared/contracts";

const claudeBillingOverrides = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
] as const;

export function createProfileEnvironment(
  provider: ProviderId,
  configRoot: string | null,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...baseEnvironment };
  if (!configRoot) return environment;

  if (provider === "claude") {
    environment.CLAUDE_CONFIG_DIR = configRoot;
    for (const variable of claudeBillingOverrides) delete environment[variable];
  } else {
    environment.CODEX_HOME = configRoot;
    delete environment.OPENAI_API_KEY;
  }
  return environment;
}

