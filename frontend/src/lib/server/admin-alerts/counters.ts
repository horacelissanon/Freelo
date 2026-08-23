import 'server-only';
import type { Redis } from '../redis';

/**
 * Atomically increments a Redis counter, setting its TTL only on the first
 * increment (when the key was just created) so the window is a fixed
 * duration from the first hit rather than sliding on every increment.
 * Used for simple abuse counters (PIN failures, webhook signature failures,
 * OAuth rejections) where exact sliding-window precision isn't required.
 */
export async function incrWithWindow(
  redis: Redis,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count;
}
