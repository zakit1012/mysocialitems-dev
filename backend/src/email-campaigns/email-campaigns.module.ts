import { Module } from '@nestjs/common';
import {
  EmailCampaignsController,
  EmailPreviewController,
} from './email-campaigns.controller';
import { EmailTrackingController } from './email-tracking.controller';
import { EmailCampaignsService } from './email-campaigns.service';
import { CampaignSender } from './campaign-sender.service';

@Module({
  controllers: [
    EmailCampaignsController,
    EmailPreviewController,
    EmailTrackingController,
  ],
  providers: [EmailCampaignsService, CampaignSender],
})
export class EmailCampaignsModule {}
