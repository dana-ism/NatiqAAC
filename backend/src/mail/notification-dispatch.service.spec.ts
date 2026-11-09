import { Logger } from '@nestjs/common';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';
import { GmailMailerService } from './gmail-mailer.service';
import {
  NOTIFICATION_DISPATCH_INTERVAL_MS,
  NotificationDispatchService,
} from './notification-dispatch.service';

describe('NotificationDispatchService bounded lifecycle', () => {
  const accounts = { retryPendingNotifications: jest.fn() };
  const mailer = { isConfigured: jest.fn() };
  const previousNodeEnv = process.env.NODE_ENV;
  let service: NotificationDispatchService;
  let warning: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    process.env.NODE_ENV = 'production';
    accounts.retryPendingNotifications.mockResolvedValue(undefined);
    mailer.isConfigured.mockReturnValue(true);
    service = new NotificationDispatchService(
      accounts as unknown as AccountLifecycleService,
      mailer as unknown as GmailMailerService,
    );
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('starts no background timer in test mode', async () => {
    process.env.NODE_ENV = 'test';
    service.onModuleInit();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(90_000);
    expect(accounts.retryPendingNotifications).not.toHaveBeenCalled();
  });

  it('starts no timer without explicitly configured outbound mail', () => {
    mailer.isConfigured.mockReturnValue(false);
    service.onModuleInit();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits thirty seconds before dispatch and avoids duplicate initialization timers', async () => {
    service.onModuleInit();
    service.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);
    expect(accounts.retryPendingNotifications).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(NOTIFICATION_DISPATCH_INTERVAL_MS - 1);
    expect(accounts.retryPendingNotifications).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(accounts.retryPendingNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not overlap dispatch while an earlier tick is still running', async () => {
    let complete!: () => void;
    accounts.retryPendingNotifications.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(90_000);
    expect(accounts.retryPendingNotifications).toHaveBeenCalledTimes(1);
    complete();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(accounts.retryPendingNotifications).toHaveBeenCalledTimes(2);
  });

  it('logs only a fixed sanitized message and permits a later tick after failure', async () => {
    accounts.retryPendingNotifications.mockRejectedValueOnce(
      new Error('sensitive email and provider diagnostics'),
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(warning).toHaveBeenCalledWith(
      'Pending account notifications could not be dispatched',
    );
    expect(warning).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(accounts.retryPendingNotifications).toHaveBeenCalledTimes(2);
  });

  it('stops future dispatches immediately when destroyed', async () => {
    service.onModuleInit();
    await service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(90_000);
    expect(accounts.retryPendingNotifications).not.toHaveBeenCalled();
  });

  it('waits for the current bounded dispatch before module shutdown completes', async () => {
    let complete!: () => void;
    accounts.retryPendingNotifications.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(30_000);
    let stopped = false;
    const closing = service.onModuleDestroy().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    complete();
    await closing;
    expect(stopped).toBe(true);
    await jest.advanceTimersByTimeAsync(90_000);
    expect(accounts.retryPendingNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch after configuration is disabled between ticks', async () => {
    service.onModuleInit();
    mailer.isConfigured.mockReturnValue(false);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(accounts.retryPendingNotifications).not.toHaveBeenCalled();
  });
});
