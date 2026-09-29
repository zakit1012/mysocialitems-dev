import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminMfaGuard } from '../common/guards/admin-mfa.guard';
import { AdminAuditInterceptor } from '../common/interceptors/admin-audit.interceptor';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { EmailCampaignsService } from './email-campaigns.service';

/** A JSON body; the service checks every field. */
type Input = Record<string, unknown>;

/** Admin -> Email campaigns: contacts, categories, templates and sending. */
@Controller('admin/mailing')
@UseGuards(JwtAuthGuard, RolesGuard, AdminMfaGuard)
@UseInterceptors(AdminAuditInterceptor)
@Roles('ADMIN')
export class EmailCampaignsController {
  constructor(
    private readonly campaigns: EmailCampaignsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- contacts
  @Get('contacts')
  contacts(@Query() query: { q?: string; group?: string; page?: string }) {
    return this.campaigns.listContacts(query);
  }

  @Post('contacts')
  addContacts(@Body() body: Input) {
    return this.campaigns.addContacts(body ?? {});
  }

  @Patch('contacts/:id')
  updateContact(@Param('id') id: string, @Body() body: Input) {
    return this.campaigns.updateContact(id, body ?? {});
  }

  @Post('contacts/categorize')
  categorize(@Body() body: Input) {
    return this.campaigns.categorize(body ?? {});
  }

  @Post('contacts/delete')
  deleteContacts(@Body() body: Input) {
    return this.campaigns.deleteContacts(body ?? {});
  }

  @Post('contacts/subscription')
  setSubscribed(@Body() body: Input) {
    return this.campaigns.setSubscribed(body ?? {});
  }

  // ---- categories
  @Get('categories')
  categories() {
    return this.campaigns.categories();
  }

  @Post('categories')
  createCategory(@Body() body: Input) {
    return this.campaigns.createCategory(body ?? {});
  }

  @Patch('categories/:id')
  renameCategory(@Param('id') id: string, @Body() body: Input) {
    return this.campaigns.renameCategory(id, body ?? {});
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.campaigns.deleteCategory(id);
  }

  // ---- templates
  @Get('templates')
  templates() {
    return this.campaigns.templates();
  }

  @Get('templates/:id')
  template(@Param('id') id: string) {
    return this.campaigns.template(id);
  }

  @Post('templates')
  createTemplate(@Body() body: Input) {
    return this.campaigns.createTemplate(body ?? {});
  }

  @Put('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: Input) {
    return this.campaigns.updateTemplate(id, body ?? {});
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.campaigns.deleteTemplate(id);
  }

  @Post('test')
  async sendTest(@CurrentUser() me: AuthUser, @Body() body: Input) {
    const user = await this.prisma.user.findUnique({
      where: { id: me.id },
      select: { email: true, name: true },
    });
    return this.campaigns.sendTest(body ?? {}, user ?? { email: me.email });
  }

  // ---- campaigns
  @Get('audience')
  audience() {
    return this.campaigns.audienceOptions();
  }

  @Get('campaigns')
  list() {
    return this.campaigns.campaigns();
  }

  @Get('campaigns/:id')
  campaign(
    @Param('id') id: string,
    @Query() query: { filter?: string; page?: string },
  ) {
    return this.campaigns.campaign(id, query);
  }

  @Post('campaigns')
  create(@CurrentUser() me: AuthUser, @Body() body: Input) {
    return this.campaigns.createCampaign(body ?? {}, me);
  }

  @Post('campaigns/:id/stop')
  stop(@Param('id') id: string) {
    return this.campaigns.stopCampaign(id);
  }

  @Put('speed')
  setRate(@Body() body: Input) {
    return this.campaigns.setRate(body ?? {});
  }
}

/**
 * The live preview and the audience count: asked for on every pause in
 * typing or ticking, and they change nothing, so they stay out of the
 * change log.
 */
@Controller('admin/mailing')
@UseGuards(JwtAuthGuard, RolesGuard, AdminMfaGuard)
@Roles('ADMIN')
export class EmailPreviewController {
  constructor(
    private readonly campaigns: EmailCampaignsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('preview')
  async preview(@CurrentUser() me: AuthUser, @Body() body: Input) {
    const user = await this.prisma.user.findUnique({
      where: { id: me.id },
      select: { email: true, name: true },
    });
    return this.campaigns.preview(body ?? {}, user ?? { email: me.email });
  }

  @Post('audience/count')
  count(@Body() body: Input) {
    return this.campaigns.audienceCount(body ?? {});
  }
}
