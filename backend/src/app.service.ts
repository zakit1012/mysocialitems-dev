import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { ok: boolean } {
    return { ok: true };
  }
}
