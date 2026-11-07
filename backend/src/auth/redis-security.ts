import { ServiceUnavailableException } from '@nestjs/common';
import {
  ClientClosedError,
  ClientOfflineError,
  ConnectionTimeoutError,
  DisconnectsClientError,
  SocketClosedUnexpectedlyError,
  SocketTimeoutError,
  TimeoutError,
  type RedisClientType,
} from 'redis';

export const REDIS_SECURITY_TIMEOUT_MS = 3000;
export const redisSecurityOptions = {
  disableOfflineQueue: true,
  commandsQueueMaxLength: 100,
  commandOptions: { timeout: REDIS_SECURITY_TIMEOUT_MS },
  socket: {
    connectTimeout: REDIS_SECURITY_TIMEOUT_MS,
    reconnectStrategy: false as const,
  },
};

function isInfrastructureError(error: unknown): boolean {
  if (
    error instanceof ClientClosedError ||
    error instanceof DisconnectsClientError ||
    error instanceof ClientOfflineError ||
    error instanceof ConnectionTimeoutError ||
    error instanceof SocketClosedUnexpectedlyError ||
    error instanceof SocketTimeoutError ||
    error instanceof TimeoutError
  )
    return true;
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    [
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ENETUNREACH',
      'EHOSTUNREACH',
    ].includes(code ?? '') ||
    /^(LOADING|MASTERDOWN|CLUSTERDOWN|READONLY|OOM|NOAUTH|WRONGPASS|NOPERM)\b/.test(
      error.message,
    ) ||
    error.message === 'The queue is full' ||
    (error instanceof AggregateError &&
      error.errors.length > 0 &&
      error.errors.every(isInfrastructureError))
  );
}

// Command timeout/abort only bounds the unsent queue in the installed client.
// The deadline below also closes a stalled connection, flushing in-flight work.
async function redisDeadline<T>(
  redis: RedisClientType,
  operation: () => Promise<T>,
): Promise<T> {
  const unavailable = () =>
    new ServiceUnavailableException(
      'Authentication protection is temporarily unavailable',
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (redis.isOpen) redis.destroy();
          reject(unavailable());
        }, REDIS_SECURITY_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (isInfrastructureError(error)) throw unavailable();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function runRedisSecurity<T>(
  redis: RedisClientType,
  operation: () => Promise<T>,
): Promise<T> {
  if (!redis.isReady)
    return Promise.reject(
      new ServiceUnavailableException(
        'Authentication protection is temporarily unavailable',
      ),
    );
  return redisDeadline(redis, operation);
}

export async function connectRedisSecurity(
  redis: RedisClientType,
): Promise<void> {
  try {
    await redisDeadline(redis, () => redis.connect());
  } catch (error) {
    if (redis.isOpen) redis.destroy();
    throw error;
  }
}
