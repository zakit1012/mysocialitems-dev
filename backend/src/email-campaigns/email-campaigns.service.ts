import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { EmailCampaign, EmailDelivery, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PlansService } from '../billing/plans.service';
import { SettingsService } from '../settings/settings.service';
import { siteUrl } from '../common/urls';
import {
  fillVariables,
  renderContent,
  testBanner,
  type Recipient,
} from './render';

/**
 * Email campaigns: product news, new features and alerts, sent by the admin
 * to account holders and to addresses added by hand or imported.
 *
 * Contacts are one list. Every account is in it (kept in step with the
 * account); the admin adds others and puts anyone in their own categories.
 * A campaign goes to plan groups ("Pro users") and/or categories, never to
 * anyone who unsubscribed or whose mail bounced. Sending happens in the
 * background (CampaignSender), a few emails at a time.
 */

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
/** Contacts per add or import request; the page sends a big file in parts. */
export const MAX_IMPORT = 1000;
export const RATE_KEY = 'EMAIL_CAMPAIGN_PER_MINUTE';
export const DEFAULT_RATE = 30;
export const MAX_RATE = 600;
const PAGE = 50;

export type Audience = { segments: string[]; categoryIds: string[] };

type TemplateInput = {
  name?: unknown;
  subject?: unknown;
  preheader?: unknown;
  heading?: unknown;
  content?: unknown;
};

/** A trimmed string no longer than `max`; required ones must not be empty. */
function text(value: unknown, label: string, max: number, required = false) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (required && !s) throw new BadRequestException(`${label} is required.`);
  if (s.length > max) {
    throw new BadRequestException(`${label} can be at most ${max} characters.`);
  }
  return s;
}

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string'))]
    : [];
}

export function normalEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** The plan an account is on now, roughly as billing sees it. */
function planOf(
  sub: {
    plan: string;
    status: string;
    currentPeriodEnd: Date | null;
  } | null,
): string {
  if (!sub) return 'FREE';
  const paidThrough =
    sub.currentPeriodEnd !== null && sub.currentPeriodEnd > new Date();
  if (sub.status === 'ACTIVE' || (sub.status === 'CANCELLED' && paidThrough)) {
    return sub.plan;
  }
  return 'FREE';
}

type ContactRow = {
  id: string;
  email: string;
  name: string | null;
  source: string;
  createdAt: Date;
  userId: string | null;
  plan: string | null;
  categories: { id: string; name: string }[];
  suppressed: string | null;
};

@Injectable()
export class EmailCampaignsService {
  private syncedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  /** Where the open pixel and the unsubscribe page are served. */
  private get api(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3001'
    )
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');
  }

  // ---- contacts

  /**
   * Every account in the contact list, with its current email: new accounts
   * added, a changed address followed. At most every 30 seconds unless forced.
   */
  async syncUsers(force = false) {
    if (!force && Date.now() - this.syncedAt < 30_000) return;
    this.syncedAt = Date.now();
    const [users, contacts] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, email: true, name: true },
      }),
      this.prisma.emailContact.findMany({
        select: { id: true, email: true, userId: true, name: true },
      }),
    ]);
    const byUser = new Map(
      contacts.filter((c) => c.userId).map((c) => [c.userId as string, c]),
    );
    const byEmail = new Map(contacts.map((c) => [c.email, c]));
    const create: Prisma.EmailContactCreateManyInput[] = [];
    for (const user of users) {
      const email = user.email.toLowerCase();
      const linked = byUser.get(user.id);
      if (linked) {
        // A changed account email, unless another contact already has it.
        if (linked.email !== email && !byEmail.has(email)) {
          await this.prisma.emailContact
            .update({ where: { id: linked.id }, data: { email } })
            .catch(() => undefined);
        }
        continue;
      }
      const same = byEmail.get(email);
      if (same) {
        if (!same.userId) {
          await this.prisma.emailContact
            .update({
              where: { id: same.id },
              data: { userId: user.id, name: same.name ?? user.name },
            })
            .catch(() => undefined);
        }
        continue;
      }
      create.push({ email, name: user.name, userId: user.id, source: 'USER' });
    }
    if (create.length) {
      await this.prisma.emailContact.createMany({
        data: create,
        skipDuplicates: true,
      });
    }
  }

  /** Every contact with its plan, categories and whether it is taken off. */
  private async allContacts(q = ''): Promise<ContactRow[]> {
    const search = q.trim();
    const [rows, suppressed] = await Promise.all([
      this.prisma.emailContact.findMany({
        where: search
          ? {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              subscription: {
                select: { plan: true, status: true, currentPeriodEnd: true },
              },
            },
          },
          categories: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.emailSuppression.findMany(),
    ]);
    const off = new Map(suppressed.map((s) => [s.email, s.reason]));
    return rows.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name ?? c.user?.name ?? null,
      source: c.source,
      createdAt: c.createdAt,
      userId: c.userId,
      plan: c.userId ? planOf(c.user?.subscription ?? null) : null,
      categories: c.categories
        .map((m) => m.category)
        .sort((a, b) => a.name.localeCompare(b.name)),
      suppressed: off.get(c.email) ?? null,
    }));
  }

  /** Whether a contact is in a group ("users", "plan:PRO", "category:<id>"...). */
  private inGroup(c: ContactRow, group: string): boolean {
    if (group === 'all') return true;
    if (group === 'users') return c.userId !== null;
    if (group === 'contacts') return c.userId === null;
    if (group === 'unsubscribed') return c.suppressed !== null;
    if (group.startsWith('plan:')) return c.plan === group.slice(5);
    if (group.startsWith('category:')) {
      return c.categories.some((cat) => cat.id === group.slice(9));
    }
    return false;
  }

  async listContacts(query: { q?: string; group?: string; page?: string }) {
    await this.syncUsers();
    const group = query.group || 'all';
    const all = (await this.allContacts(query.q)).filter((c) =>
      this.inGroup(c, group),
    );
    const page = Math.max(1, Number(query.page) || 1);
    return {
      total: all.length,
      page,
      pageSize: PAGE,
      contacts: all.slice((page - 1) * PAGE, page * PAGE),
    };
  }

  /**
   * Adds contacts by hand or from a file: new addresses are added, known ones
   * keep their details (a missing name is filled in), and all of them join
   * the chosen categories - and a new one, if named.
   */
  async addContacts(body: {
    contacts?: unknown;
    categoryIds?: unknown;
    newCategory?: unknown;
    source?: unknown;
  }) {
    const list = Array.isArray(body.contacts) ? body.contacts : [];
    if (!list.length) throw new BadRequestException('No contacts to add.');
    if (list.length > MAX_IMPORT) {
      throw new BadRequestException(
        `At most ${MAX_IMPORT} contacts at a time.`,
      );
    }
    const source = body.source === 'IMPORT' ? 'IMPORT' : 'MANUAL';

    const people = new Map<string, string | null>();
    const invalid: string[] = [];
    for (const item of list) {
      const raw = (item ?? {}) as { email?: unknown; name?: unknown };
      const email = normalEmail(raw.email);
      if (!email) {
        invalid.push(
          typeof raw.email === 'string' ? raw.email.slice(0, 80) : '(empty)',
        );
        continue;
      }
      const name =
        typeof raw.name === 'string'
          ? // One line: a spreadsheet cell can hold line breaks.
            raw.name.replace(/s+/g, ' ').trim().slice(0, 120) || null
          : null;
      if (!people.has(email) || (name && !people.get(email))) {
        people.set(email, name);
      }
    }

    const categoryIds = await this.categoriesFor(
      body.categoryIds,
      body.newCategory,
    );
    const emails = [...people.keys()];
    const known = emails.length
      ? await this.prisma.emailContact.findMany({
          where: { email: { in: emails } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const knownByEmail = new Map(known.map((k) => [k.email, k]));

    const fresh = emails.filter((e) => !knownByEmail.has(e));
    if (fresh.length) {
      await this.prisma.emailContact.createMany({
        data: fresh.map((email) => ({
          email,
          name: people.get(email),
          source,
        })),
        skipDuplicates: true,
      });
    }
    for (const k of known) {
      const name = people.get(k.email);
      if (name && !k.name) {
        await this.prisma.emailContact.update({
          where: { id: k.id },
          data: { name },
        });
      }
    }
    if (categoryIds.length && emails.length) {
      const all = await this.prisma.emailContact.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      await this.prisma.emailCategoryMember.createMany({
        data: all.flatMap((c) =>
          categoryIds.map((categoryId) => ({ contactId: c.id, categoryId })),
        ),
        skipDuplicates: true,
      });
    }
    return {
      added: fresh.length,
      existing: known.length,
      invalid: invalid.length,
      invalidSamples: invalid.slice(0, 10),
      categoryIds,
    };
  }

  /** The chosen categories that exist, plus a new one by name (reused if it exists). */
  private async categoriesFor(
    raw: unknown,
    newName: unknown,
  ): Promise<string[]> {
    const chosen = ids(raw);
    const found = chosen.length
      ? await this.prisma.emailCategory.findMany({
          where: { id: { in: chosen } },
          select: { id: true },
        })
      : [];
    const out = found.map((c) => c.id);
    const name = text(newName, 'Category name', 60);
    if (name) out.push((await this.findOrCreateCategory(name)).id);
    return [...new Set(out)];
  }

  private async findOrCreateCategory(name: string) {
    const same = await this.prisma.emailCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    return same ?? this.prisma.emailCategory.create({ data: { name } });
  }

  async updateContact(
    id: string,
    body: { name?: unknown; categoryIds?: unknown },
  ) {
    const contact = await this.prisma.emailContact.findUnique({
      where: { id },
    });
    if (!contact) throw new NotFoundException('That contact is gone.');
    if (body.name !== undefined) {
      await this.prisma.emailContact.update({
        where: { id },
        data: { name: text(body.name, 'Name', 120) || null },
      });
    }
    if (body.categoryIds !== undefined) {
      const categoryIds = await this.categoriesFor(body.categoryIds, undefined);
      await this.prisma.$transaction([
        this.prisma.emailCategoryMember.deleteMany({
          where: { contactId: id },
        }),
        this.prisma.emailCategoryMember.createMany({
          data: categoryIds.map((categoryId) => ({
            contactId: id,
            categoryId,
          })),
        }),
      ]);
    }
    return { ok: true };
  }

  /** Puts several contacts in a category, or takes them out. */
  async categorize(body: {
    contactIds?: unknown;
    categoryId?: unknown;
    remove?: unknown;
  }) {
    const contactIds = ids(body.contactIds);
    const categoryId =
      typeof body.categoryId === 'string' ? body.categoryId : '';
    if (!contactIds.length || !categoryId) {
      throw new BadRequestException('Pick contacts and a category.');
    }
    const category = await this.prisma.emailCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException('That category is gone.');
    if (body.remove === true) {
      const { count } = await this.prisma.emailCategoryMember.deleteMany({
        where: { categoryId, contactId: { in: contactIds } },
      });
      return { count };
    }
    const existing = await this.prisma.emailContact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true },
    });
    const { count } = await this.prisma.emailCategoryMember.createMany({
      data: existing.map((c) => ({ contactId: c.id, categoryId })),
      skipDuplicates: true,
    });
    return { count };
  }

  /** Removes added or imported contacts. Account holders stay: they are accounts. */
  async deleteContacts(body: { ids?: unknown }) {
    const list = ids(body.ids);
    if (!list.length) throw new BadRequestException('Pick contacts to delete.');
    const { count } = await this.prisma.emailContact.deleteMany({
      where: { id: { in: list }, userId: null },
    });
    return { count, keptAccounts: list.length - count };
  }

  /**
   * Takes an address off every campaign, or puts it back. Someone who
   * unsubscribed themselves is only put back by subscribing again.
   */
  async setSubscribed(body: { email?: unknown; subscribed?: unknown }) {
    const email = normalEmail(body.email);
    if (!email) throw new BadRequestException('Not a valid email address.');
    if (body.subscribed === true) {
      const row = await this.prisma.emailSuppression.findUnique({
        where: { email },
      });
      if (row?.reason === 'UNSUBSCRIBED') {
        throw new BadRequestException(
          'They unsubscribed themselves, so only they can sign up again.',
        );
      }
      await this.prisma.emailSuppression.deleteMany({ where: { email } });
    } else {
      await this.prisma.emailSuppression.upsert({
        where: { email },
        create: { email, reason: 'ADMIN' },
        update: {},
      });
    }
    return { ok: true };
  }

  // ---- categories

  async categories() {
    const [rows, counts] = await Promise.all([
      this.prisma.emailCategory.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.emailCategoryMember.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
      }),
    ]);
    const count = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      count: count.get(c.id) ?? 0,
    }));
  }

  async createCategory(body: { name?: unknown }) {
    const name = text(body.name, 'Category name', 60, true);
    const same = await this.prisma.emailCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (same)
      throw new BadRequestException(`There is already a "${same.name}".`);
    return this.prisma.emailCategory.create({ data: { name } });
  }

  async renameCategory(id: string, body: { name?: unknown }) {
    const name = text(body.name, 'Category name', 60, true);
    const same = await this.prisma.emailCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
    });
    if (same)
      throw new BadRequestException(`There is already a "${same.name}".`);
    return this.prisma.emailCategory.update({ where: { id }, data: { name } });
  }

  /** Deletes the category; its contacts stay, in their other categories. */
  async deleteCategory(id: string) {
    await this.prisma.emailCategory.delete({ where: { id } });
    return { ok: true };
  }

  // ---- who a campaign can go to

  /** The groups to choose from, each with how many it reaches now. */
  async audienceOptions() {
    await this.syncUsers();
    const [contacts, plans, categories] = await Promise.all([
      this.allContacts(),
      this.plans.all(),
      this.categories(),
    ]);
    const reachable = contacts.filter((c) => !c.suppressed);
    const count = (group: string) =>
      reachable.filter((c) => this.inGroup(c, group)).length;
    return {
      segments: [
        { key: 'all', label: 'Everyone', count: count('all') },
        { key: 'users', label: 'All account holders', count: count('users') },
        ...plans.map((p) => ({
          key: `plan:${p.key}`,
          label: `${p.name} plan`,
          count: count(`plan:${p.key}`),
        })),
        {
          key: 'contacts',
          label: 'Added or imported (no account)',
          count: count('contacts'),
        },
      ],
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        count: count(`category:${c.id}`),
      })),
      unsubscribed: contacts.length - reachable.length,
    };
  }

  private async validAudience(raw: unknown): Promise<Audience> {
    const input = (raw ?? {}) as { segments?: unknown; categoryIds?: unknown };
    const plans = await this.plans.all();
    const allowed = new Set([
      'all',
      'users',
      'contacts',
      ...plans.map((p) => `plan:${p.key}`),
    ]);
    const segments = ids(input.segments).filter((s) => allowed.has(s));
    const categoryIds = ids(input.categoryIds);
    const found = categoryIds.length
      ? await this.prisma.emailCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true },
        })
      : [];
    if (!segments.length && !found.length) {
      throw new BadRequestException('Choose who it goes to.');
    }
    return { segments, categoryIds: found.map((c) => c.id) };
  }

  /** Everyone in any of the chosen groups, once each, none taken off. */
  async recipients(audience: Audience): Promise<Recipient[]> {
    const groups = [
      ...audience.segments,
      ...audience.categoryIds.map((id) => `category:${id}`),
    ];
    return (await this.allContacts())
      .filter((c) => !c.suppressed && groups.some((g) => this.inGroup(c, g)))
      .map((c) => ({ email: c.email, name: c.name }));
  }

  async audienceCount(body: { audience?: unknown }) {
    await this.syncUsers();
    const audience = await this.validAudience(body.audience).catch(() => null);
    return { count: audience ? (await this.recipients(audience)).length : 0 };
  }

  // ---- templates

  private templateData(input: TemplateInput) {
    return {
      name: text(input.name, 'Template name', 120, true),
      subject: text(input.subject, 'Subject', 200, true),
      preheader: text(input.preheader, 'Preview text', 200),
      heading: text(input.heading, 'Heading', 200),
      content: text(input.content, 'Content', 50_000, true),
    };
  }

  templates() {
    return this.prisma.emailTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, subject: true, updatedAt: true },
    });
  }

  async template(id: string) {
    const row = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That template is gone.');
    return row;
  }

  createTemplate(input: TemplateInput) {
    return this.prisma.emailTemplate.create({ data: this.templateData(input) });
  }

  async updateTemplate(id: string, input: TemplateInput) {
    await this.template(id);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: this.templateData(input),
    });
  }

  /** Deletes a template; campaigns sent with it keep their own copy. */
  async deleteTemplate(id: string) {
    await this.template(id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ---- building one email

  /** One recipient's email: subject, HTML and plain text. */
  compose(
    email: {
      subject: string;
      preheader: string;
      heading: string;
      content: string;
    },
    to: Recipient,
    links: { unsubscribeUrl: string; pixelUrl?: string; test?: boolean },
  ) {
    const { html: body, text: plain } = renderContent(
      email.content,
      to,
      siteUrl(this.config),
    );
    const heading = fillVariables(email.heading, to);
    const preheader =
      fillVariables(email.preheader, to) ||
      plain.split('\n').find(Boolean) ||
      '';
    const html = this.mail.campaignHtml({
      preheader,
      heading,
      body: (links.test ? testBanner(to.email) : '') + body,
      unsubscribeUrl: links.unsubscribeUrl,
      pixelUrl: links.pixelUrl,
    });
    const textVersion = [heading, plain, `Unsubscribe: ${links.unsubscribeUrl}`]
      .filter(Boolean)
      .join('\n\n');
    return {
      subject: fillVariables(email.subject, to),
      html,
      text: textVersion,
    };
  }

  /** What an email looks like, filled in for the admin who is looking. */
  preview(input: TemplateInput, me: { email: string; name?: string | null }) {
    const email = {
      subject: typeof input.subject === 'string' ? input.subject : '',
      preheader: typeof input.preheader === 'string' ? input.preheader : '',
      heading: typeof input.heading === 'string' ? input.heading : '',
      content:
        typeof input.content === 'string' ? input.content.slice(0, 50_000) : '',
    };
    const { subject, html } = this.compose(
      email,
      { email: me.email, name: me.name ?? null },
      { unsubscribeUrl: `${this.api}/e/u/test` },
    );
    return { subject, html };
  }

  /** The email to one address, marked as a test; opens are not counted. */
  async sendTest(
    body: TemplateInput & { to?: unknown },
    me: { email: string; name?: string | null },
  ) {
    const to = normalEmail(body.to);
    if (!to)
      throw new BadRequestException('Enter the address to send the test to.');
    if (!this.mail.ready) {
      throw new BadRequestException(
        'Email is not set up yet: see Admin -> Emails.',
      );
    }
    const email = {
      subject: text(body.subject, 'Subject', 200, true),
      preheader: text(body.preheader, 'Preview text', 200),
      heading: text(body.heading, 'Heading', 200),
      content: text(body.content, 'Content', 50_000, true),
    };
    const unsubscribeUrl = `${this.api}/e/u/test`;
    const message = this.compose(
      email,
      { email: to, name: to === me.email ? (me.name ?? null) : null },
      { unsubscribeUrl, test: true },
    );
    try {
      await this.mail.sendCampaign({
        to,
        subject: `[Test] ${message.subject}`,
        text: message.text,
        html: message.html,
        unsubscribeUrl,
      });
      return { ok: true };
    } catch (err) {
      throw new BadRequestException(
        `The mail server did not take it: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Sends one queued campaign email; the sender records how it went. */
  deliver(campaign: EmailCampaign, delivery: EmailDelivery) {
    const unsubscribeUrl = `${this.api}/e/u/${delivery.token}`;
    const message = this.compose(
      campaign,
      { email: delivery.email, name: delivery.name },
      { unsubscribeUrl, pixelUrl: `${this.api}/e/o/${delivery.token}.gif` },
    );
    return this.mail.sendCampaign({
      to: delivery.email,
      ...message,
      unsubscribeUrl,
    });
  }

  // ---- campaigns

  /**
   * Starts a campaign: a copy of the template, one queued email per
   * recipient. The background sender takes it from there.
   */
  async createCampaign(
    body: { name?: unknown; templateId?: unknown; audience?: unknown },
    me: { email: string },
  ) {
    if (!this.mail.ready) {
      throw new BadRequestException(
        'Email is not set up yet: see Admin -> Emails.',
      );
    }
    const template = await this.template(
      typeof body.templateId === 'string' ? body.templateId : '',
    );
    const audience = await this.validAudience(body.audience);
    await this.syncUsers(true);
    const people = await this.recipients(audience);
    if (!people.length) {
      throw new BadRequestException(
        'Nobody to send to: those groups are empty, or everyone in them unsubscribed.',
      );
    }
    const name = text(body.name, 'Campaign name', 120) || template.name;

    const campaign = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.emailCampaign.create({
          data: {
            name,
            templateId: template.id,
            subject: template.subject,
            preheader: template.preheader,
            heading: template.heading,
            content: template.content,
            audience,
            sentBy: me.email,
          },
        });
        for (let i = 0; i < people.length; i += 1000) {
          await tx.emailDelivery.createMany({
            data: people.slice(i, i + 1000).map((p) => ({
              campaignId: created.id,
              email: p.email,
              name: p.name,
              token: randomBytes(18).toString('base64url'),
            })),
            skipDuplicates: true,
          });
        }
        return created;
      },
      { timeout: 60_000 },
    );
    return { id: campaign.id, total: people.length };
  }

  /** How many are waiting, sent, failed... and opened, per campaign. */
  private async counts(campaignIds: string[]) {
    const [byStatus, opened] = await Promise.all([
      this.prisma.emailDelivery.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: campaignIds } },
        _count: { _all: true },
      }),
      this.prisma.emailDelivery.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: campaignIds }, openedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const out = new Map<string, Record<string, number>>();
    for (const id of campaignIds) {
      out.set(id, {
        total: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        bounced: 0,
        skipped: 0,
        opened: 0,
      });
    }
    for (const row of byStatus) {
      const c = out.get(row.campaignId)!;
      const n = row._count._all;
      c.total += n;
      if (row.status === 'QUEUED' || row.status === 'SENDING') c.queued += n;
      else if (row.status === 'SENT') c.sent += n;
      else if (row.status === 'FAILED') c.failed += n;
      else if (row.status === 'BOUNCED') {
        c.bounced += n;
        // It went out before the receiving server refused it.
        c.sent += n;
      } else if (row.status === 'SKIPPED') c.skipped += n;
    }
    for (const row of opened) out.get(row.campaignId)!.opened = row._count._all;
    return out;
  }

  async campaigns() {
    const rows = await this.prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        subject: true,
        status: true,
        sentBy: true,
        lastError: true,
        createdAt: true,
        finishedAt: true,
      },
    });
    const counts = await this.counts(rows.map((r) => r.id));
    return {
      campaigns: rows.map((r) => ({ ...r, counts: counts.get(r.id) })),
      perMinute: await this.rate(),
      mailReady: this.mail.ready,
    };
  }

  async campaign(id: string, query: { filter?: string; page?: string }) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException('That campaign is gone.');
    const filter = query.filter ?? 'all';
    const where: Prisma.EmailDeliveryWhereInput = { campaignId: id };
    if (filter === 'opened') where.openedAt = { not: null };
    if (filter === 'not-opened') {
      where.openedAt = null;
      where.status = { in: ['SENT'] };
    }
    if (filter === 'sent') where.status = { in: ['SENT', 'BOUNCED'] };
    if (filter === 'waiting') where.status = { in: ['QUEUED', 'SENDING'] };
    if (filter === 'failed') where.status = { in: ['FAILED', 'BOUNCED'] };
    if (filter === 'skipped') where.status = 'SKIPPED';
    const page = Math.max(1, Number(query.page) || 1);
    const [total, deliveries, counts] = await Promise.all([
      this.prisma.emailDelivery.count({ where }),
      this.prisma.emailDelivery.findMany({
        where,
        orderBy: [
          { sentAt: { sort: 'desc', nulls: 'last' } },
          { email: 'asc' },
        ],
        skip: (page - 1) * 100,
        take: 100,
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          error: true,
          sentAt: true,
          openedAt: true,
          opens: true,
        },
      }),
      this.counts([id]),
    ]);
    return {
      campaign,
      counts: counts.get(id),
      perMinute: await this.rate(),
      mailReady: this.mail.ready,
      deliveries: { total, page, pageSize: 100, rows: deliveries },
    };
  }

  /** Stops a campaign: whoever has not been sent to yet is not sent to. */
  async stopCampaign(id: string) {
    const { count } = await this.prisma.emailCampaign.updateMany({
      where: { id, status: 'SENDING' },
      data: { status: 'STOPPED', finishedAt: new Date() },
    });
    if (!count) throw new BadRequestException('That campaign is not sending.');
    await this.prisma.emailDelivery.updateMany({
      where: { campaignId: id, status: 'QUEUED' },
      data: { status: 'SKIPPED', error: 'Stopped by an admin.' },
    });
    return { ok: true };
  }

  // ---- sending speed

  async rate(): Promise<number> {
    const n = Number(await this.settings.get(RATE_KEY));
    return Number.isFinite(n) && n >= 1
      ? Math.min(Math.round(n), MAX_RATE)
      : DEFAULT_RATE;
  }

  async setRate(body: { perMinute?: unknown }) {
    const n = Number(body.perMinute);
    if (!Number.isInteger(n) || n < 1 || n > MAX_RATE) {
      throw new BadRequestException(`Choose 1 to ${MAX_RATE} emails a minute.`);
    }
    await this.settings.set(RATE_KEY, String(n));
    return { perMinute: n };
  }

  // ---- what recipients do

  /** The open pixel loaded: the first time is when it was opened. */
  async recordOpen(token: string) {
    if (!/^[\w-]{16,64}$/.test(token)) return;
    const where = { token, status: { in: ['SENT', 'SENDING', 'BOUNCED'] } };
    await this.prisma.emailDelivery.updateMany({
      where,
      data: { opens: { increment: 1 } },
    });
    await this.prisma.emailDelivery.updateMany({
      where: { ...where, openedAt: null },
      data: { openedAt: new Date() },
    });
  }

  /** The address behind an unsubscribe link, or null. */
  async tokenEmail(token: string): Promise<string | null> {
    if (!/^[\w-]{16,64}$/.test(token)) return null;
    const row = await this.prisma.emailDelivery.findUnique({
      where: { token },
      select: { email: true },
    });
    return row?.email ?? null;
  }

  /** Takes the address off every campaign from now on. */
  async unsubscribe(token: string): Promise<string | null> {
    const email = await this.tokenEmail(token);
    if (!email) return null;
    await this.prisma.emailSuppression.upsert({
      where: { email },
      create: { email, reason: 'UNSUBSCRIBED' },
      update: { reason: 'UNSUBSCRIBED' },
    });
    // Anything still queued for them is not sent.
    await this.prisma.emailDelivery.updateMany({
      where: { email, status: 'QUEUED' },
      data: { status: 'SKIPPED', error: 'Unsubscribed.' },
    });
    return email;
  }
}
