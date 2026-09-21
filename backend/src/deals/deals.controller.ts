import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../common/guards/optional-jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  list(@Query() query: QueryDealsDto, @CurrentUser() user?: AuthUser) {
    return this.deals.list(query, user?.id);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MERCHANT', 'ADMIN')
  mine(@CurrentUser() user: AuthUser) {
    return this.deals.mine(user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  findOne(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.deals.findOne(id, user?.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MERCHANT', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDealDto) {
    return this.deals.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MERCHANT', 'ADMIN')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.deals.update(user, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MERCHANT', 'ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deals.remove(user, id);
  }
}
