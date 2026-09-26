import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { BillingService } from './billing.service';

const EVERY_MS = 60 * 60 * 1000;

/**
 * Hourly billing checks: overdue renewals, plans whose paid time ran out, and
 * reminders before yearly renewals. Production only (or
 * BILLING_RECONCILE=true), since it talks to PayPal and emails customers.
 */
@Injectable()
export class BillingReconcileService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(BillingReconcileService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly billing: BillingService,
  ) {}

  onApplicationBootstrap() {
    const flag = this.config.get<string>('BILLING_RECONCILE');
    const on =
      flag === 'true' ||
      (flag !== 'false' && process.env.NODE_ENV === 'production');
    if (!on) return;
    const run = () => void this.run();
    this.timers.push(setTimeout(run, 2 * 60 * 1000).unref());
    this.timers.push(setInterval(run, EVERY_MS).unref());
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  private async run() {
    // More than one backend process: only one checks each round.
    if (!(await this.redis.setIfAbsent('billing-reconcile:lock', 50 * 60))) {
      return;
    }
    // Each step on its own: one failing must not stop the others.
    const steps: [string, () => Promise<number>][] = [
      [
        'overdue renewals',
        async () => (await this.billing.reconcileOverdue()).checked,
      ],
      ['ended plans', () => this.billing.closeEndedPlans()],
      ['renewal reminders', () => this.billing.sendRenewalReminders()],
    ];
    for (const [name, step] of steps) {
      try {
        const n = await step();
        if (n) this.log.log(`Billing check, ${name}: ${n}`);
      } catch (err) {
        this.log.error(`Billing check, ${name} failed: ${String(err)}`);
      }
    }
  }
}
