export interface RetryOptions {
  maxRetries: number;
  baseMs: number;
  isRetryable?: (err: unknown) => boolean;
}

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      const retryable = opts.isRetryable ? opts.isRetryable(error) : true;

      if (!retryable || attempt > opts.maxRetries) throw error;

      const delay =
        opts.baseMs * 2 ** (attempt - 1) +
        Math.floor(Math.random() * opts.baseMs);

      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
