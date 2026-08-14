/**
 * Structured logging for Convex functions.
 *
 * Logs one JSON line per event so deployment log streams stay greppable.
 * Never log passwords, tokens, API keys, or other secrets.
 */
type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  event: string,
  details?: Record<string, unknown>,
): void {
  const line = {
    level,
    event,
    at: new Date().toISOString(),
    ...details,
  };
  if (level === "error") {
    console.error(JSON.stringify(line));
  } else if (level === "warn") {
    console.warn(JSON.stringify(line));
  } else {
    console.log(JSON.stringify(line));
  }
}
