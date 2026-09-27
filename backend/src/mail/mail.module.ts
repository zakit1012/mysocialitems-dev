import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { BounceService } from './bounce.service';

@Global()
@Module({
  providers: [MailService, BounceService],
  exports: [MailService, BounceService],
})
export class MailModule {}
