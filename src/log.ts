// Log helpers: every QA-visible line starts with `[soglia] `.
// Normal path uses log/warn only; never console.error.

const PREFIX = '[soglia] ';

export function slog(message: string): void {
  console.log(PREFIX + message);
}

export function swarn(message: string): void {
  console.warn(PREFIX + message);
}
