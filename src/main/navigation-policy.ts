export function isTrustedRendererUrl(
  targetUrl: string,
  packagedRendererUrl: string,
  developmentServerUrl: string | null,
): boolean {
  if (!developmentServerUrl) return targetUrl === packagedRendererUrl;
  try {
    return new URL(targetUrl).origin === new URL(developmentServerUrl).origin;
  } catch {
    return false;
  }
}

export function selectDevelopmentRendererUrl(
  isPackaged: boolean,
  candidate: string | null | undefined,
): string | null {
  if (isPackaged || !candidate) return null;
  try {
    const url = new URL(candidate);
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
    if (
      url.protocol !== "http:" ||
      !loopbackHosts.has(url.hostname.toLowerCase()) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return `${url.origin}/`;
  } catch {
    return null;
  }
}
