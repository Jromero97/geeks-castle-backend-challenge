import { retry } from './retry';

describe('retry', () => {
  const opts = { maxRetries: 3, baseMs: 1 };

  it('first try return if fn success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    await expect(retry(fn, opts)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retry and success before all attempts', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce('transient-1')
      .mockRejectedValueOnce('transient-2')
      .mockResolvedValueOnce('ok');

    await expect(retry(fn, opts)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throw error after spent all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(retry(fn, opts)).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('no retry if isRetryable false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('permanent'));

    await expect(
      retry(fn, { ...opts, isRetryable: () => false }),
    ).rejects.toThrow('permanent');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retry only marked as retryable', async () => {
    const permanent = new Error('permanent');

    const fn = jest.fn().mockRejectedValue(permanent);

    await expect(
      retry(fn, {
        ...opts,
        isRetryable: (err) => (err as Error).message !== 'permanent',
      }),
    ).rejects.toBe(permanent);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
