export function isAllowedRendererNavigation(
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
