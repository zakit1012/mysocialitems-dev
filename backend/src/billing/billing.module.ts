import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { DodoClient } from './dodo.client';
import { PlansService } from './plans.service';
import { AdminBillingController } from './admin-billing.controller';
import { BillingReconcileService } from './billing-reconcile.service';

/** Global: widgets, sources, the public embed and signup all check plans. */
@Global()
@Module({
  imports: [MailModule],
  controllers: [BillingController, AdminBillingController],
  providers: [
    BillingService,
    DodoClient,
    PlansService,
    BillingReconcileService,
  ],
  exports: [BillingService, PlansService],
})
export class BillingModule {}
