// Log helpers: every QA-visible line starts with `[soglia] `.
// Normal path uses log/warn only; never console.error.

const PREFIX = '[soglia] ';

export function slog(message: string): void {
  console.log(PREFIX + message);
}

export function swarn(message: string): void {
  console.warn(PREFIX + message);
}

/**
 * The text of an unexpected error for a log line: its message (and the stack when there is one), intact. Used where the app
 * gives up (`console.error` is never used: the normal path has no `error` level, T5.R6).
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const head = `${error.name}: ${error.message}`;
    const stack = error.stack ?? '';
    if (stack === '') return head;
    return stack.includes(error.message) ? stack : `${head}\n${stack}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
