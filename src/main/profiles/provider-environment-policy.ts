import type { ProviderId } from "../../shared/contracts";

export const PROVIDER_BILLING_OVERRIDES = {
  claude: [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
  ],
  codex: ["OPENAI_API_KEY"],
} as const satisfies Record<ProviderId, readonly string[]>;

export const PROVIDER_CONFIG_VARIABLE = {
  claude: "CLAUDE_CONFIG_DIR",
  codex: "CODEX_HOME",
} as const satisfies Record<ProviderId, string>;
