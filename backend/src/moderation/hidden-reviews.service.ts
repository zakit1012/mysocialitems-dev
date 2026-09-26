import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HiddenReview } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Review = { author: string | null; text: string };

// Every page view filters through this; a short in-memory cache keeps it off
// the database. Changes made here clear it at once.
const CACHE_MS = 60_000;

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Reviews a reviewer asked us to stop showing. Applied to every widget of the
 * place (and the owner's previews), after the review engine and before the
 * reviews leave the backend.
 */
@Injectable()
export class HiddenReviewsService {
  private cache = new Map<string, { rows: HiddenReview[]; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private async forPlace(placeId: string): Promise<HiddenReview[]> {
    const hit = this.cache.get(placeId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
    const rows = await this.prisma.hiddenReview.findMany({
      where: { placeId },
    });
    this.cache.set(placeId, { rows, at: Date.now() });
    return rows;
  }

  async filter<T extends Review>(placeId: string, reviews: T[]): Promise<T[]> {
    const hidden = await this.forPlace(placeId).catch((): HiddenReview[] => []);
    if (!hidden.length) return reviews;
    return reviews.filter(
      (r) =>
        !hidden.some(
          (h) =>
            norm(h.author) === norm(r.author) &&
            norm(r.text).startsWith(norm(h.textStart)),
        ),
    );
  }

  list() {
    return this.prisma.hiddenReview.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(input: {
    placeId?: unknown;
    author?: unknown;
    text?: unknown;
    note?: unknown;
  }) {
    const str = (v: unknown, max: number) =>
      typeof v === 'string' ? v.trim().slice(0, max) : '';
    const placeId = str(input.placeId, 200);
    const author = str(input.author, 200);
    if (!placeId || !author) {
      throw new BadRequestException(
        'Place ID and the reviewer name are required.',
      );
    }
    // A few words are enough to tell this reviewer's reviews apart.
    const textStart = norm(str(input.text, 200)).slice(0, 60);
    const row = await this.prisma.hiddenReview.upsert({
      where: { placeId_author_textStart: { placeId, author, textStart } },
      update: { note: str(input.note, 500) || null },
      create: {
        placeId,
        author,
        textStart,
        note: str(input.note, 500) || null,
      },
    });
    this.cache.delete(placeId);
    return row;
  }

  async remove(id: string) {
    const row = await this.prisma.hiddenReview.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    await this.prisma.hiddenReview.delete({ where: { id } });
    this.cache.delete(row.placeId);
    return { ok: true };
  }
}
