import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { AccountLifecycleService } from '../auth/account-lifecycle.service';
import { GmailMailerService } from './gmail-mailer.service';

export const NOTIFICATION_DISPATCH_INTERVAL_MS = 30_000;

/** Small bounded dispatcher over existing MailDelivery rows; no external queue. */
@Injectable()
export class NotificationDispatchService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDispatchService.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly accounts: AccountLifecycleService,
    private readonly mailer: GmailMailerService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.NODE_ENV === 'test' ||
      !this.mailer.isConfigured() ||
      this.timer
    )
      return;
    // Never send during startup. The adapter remains explicitly opt-in through
    // MAIL_ENABLED and configured credentials; tests never run background sends.
    this.timer = setInterval(
      () => this.tick(),
      NOTIFICATION_DISPATCH_INTERVAL_MS,
    );
    this.timer.unref();
  }

  private tick(): void {
    if (this.stopped || this.active || !this.mailer.isConfigured()) return;
    this.active = this.accounts
      .retryPendingNotifications()
      .catch(() => {
        this.logger.warn(
          'Pending account notifications could not be dispatched',
        );
      })
      .finally(() => {
        this.active = undefined;
      });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.active;
  }
}
