const seen = new Set<string>();

/**
 * Logs a build-time warning the first time it is raised. Components render once
 * per page, so without this a single misconfiguration prints on every page.
 */
export function warnOnce(message: string): void {
  if (seen.has(message)) return;
  seen.add(message);
  console.warn(message);
}
