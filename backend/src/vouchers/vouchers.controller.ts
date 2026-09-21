import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { PurchaseDto } from './dto/purchase.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('vouchers')
@UseGuards(JwtAuthGuard)
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.vouchers.list(user);
  }

  @Post(':dealId')
  purchase(
    @CurrentUser() user: AuthUser,
    @Param('dealId') dealId: string,
    @Body() dto: PurchaseDto,
  ) {
    return this.vouchers.purchase(user.id, dealId, dto.quantity);
  }

  @Post(':id/redeem')
  @UseGuards(RolesGuard)
  @Roles('MERCHANT', 'ADMIN')
  redeem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vouchers.redeem(user, id);
  }
}
