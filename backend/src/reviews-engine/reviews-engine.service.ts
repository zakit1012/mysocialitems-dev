import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

export type EngineReview = {
  review_id: string | null;
  author: string | null;
  author_photo: string | null;
  rating: number | null;
  text: string;
  /** Apify's date (ISO); the scraper only has published_at_text. */
  published_at?: string | null;
  published_at_text: string | null;
  images: string[];
  /** "Helpful" votes, from Apify. */
  likes?: number;
  /** An object from Apify and the fixed scraper; older cached rows may hold a string. */
  owner_response?:
    { text: string; responded_at?: string | null } | string | null;
};

export type EngineResult = {
  business: {
    name: string | null;
    overall_rating: number | null;
    total_reviews: number | null;
  } | null;
  reviews: EngineReview[];
  returned: number;
  source: string | null;
  served: string | null;
  is_stale: boolean;
  link: string | null;
  /** How long our call to the engine took, in ms. Shown in the dashboard. */
  took_ms: number;
  /** A message to show the caller - a fetch failure, or the engine's own
   * note that a place genuinely has no written reviews. Either way the
   * caller should stop and say so, not silently retry. */
  error?: string;
};

/** What the engine accepts; anything else would come back as a 422. */
const SORTS = ['mostRelevant', 'newest', 'highestRanking', 'lowestRanking'];
const MAX_COUNT = 50;
// A cold place normally clears in 15-40s (Apify's own container start-up +
// crawl time). Stays under a typical 60s reverse-proxy read timeout with
// margin, so this one request does not itself get cut off mid-wait.
const MAX_WAIT_MS = 50_000;
// Embed answers per place and order. Short, so a place's new reviews still
// show up within minutes; the engine keeps its own longer cache behind this.
const EMBED_CACHE_SECONDS = 300;

/** The hours the engine refreshes a place at, written by EngineSyncService. */
export const placeHoursKey = (placeId: string) => `engine:every:${placeId}`;

/** What the owner reads when the engine cannot be reached; the details go to the log. */
const UNREACHABLE =
  'Could not get the reviews right now. Please try again in a minute - reviews already on your site keep showing.';

@Injectable()
export class ReviewsEngineService {
  private readonly log = new Logger(ReviewsEngineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private baseUrl() {
    return (
      this.config.get<string>('REVIEW_ENGINE_URL') ??
      'https://reviewengine.zedcircle.com'
    ).replace(/\/+$/, '');
  }

  async fetch(
    placeId: string,
    count = 5,
    sort = 'mostRelevant',
  ): Promise<EngineResult> {
    const safeCount = Math.min(
      MAX_COUNT,
      Math.max(1, Math.floor(Number(count)) || 5),
    );
    const url = new URL(`${this.baseUrl()}/v1/reviews`);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('count', String(safeCount));
    url.searchParams.set('sort', SORTS.includes(sort) ? sort : 'mostRelevant');

    const started = Date.now();
    const empty = (error: string): EngineResult => ({
      business: null,
      reviews: [],
      returned: 0,
      source: null,
      served: null,
      is_stale: false,
      link: null,
      took_ms: Date.now() - started,
      error,
    });

    try {
      // A cold place can take a minute on the engine side. Nobody should stare
      // at a spinner that long, so give up waiting after 20s and report
      // "fetching" - the engine keeps working and the caller simply asks again.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        this.log.warn(`Review engine returned ${res.status} for ${placeId}`);
        return empty(UNREACHABLE);
      }

      const data = (await res.json()) as Omit<EngineResult, 'took_ms'> & {
        note?: string;
      };
      const took = Date.now() - started;
      this.log.log(
        `reviews ${placeId} in ${took}ms (${data.served ?? '?'} / ${data.source ?? '?'})`,
      );
      // The engine's own "no written reviews for this place" explanation -
      // a real, completed answer, distinct from data.error (a fetch failure).
      return { ...data, took_ms: took, error: data.error ?? data.note };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.log.warn(`Review engine still working on ${placeId} after 20s`);
        return { ...empty(''), error: undefined, served: 'fetching' };
      }
      const reason = err instanceof Error ? err.message : String(err);
      this.log.error(`Review engine failed for ${placeId}: ${reason}`);
      return empty(UNREACHABLE);
    }
  }

  /**
   * fetch() for the public embed, where every page view of every customer's
   * site lands. A finished answer is kept in Redis for a few minutes, so most
   * views skip the round trip to the engine. "Still fetching" and failures
   * are never kept - the next view asks again.
   *
   * Reviews are cached per place, so a place a paid widget also shows
   * refreshes every 24h for everyone on it. A widget on a slower plan then
   * keeps its own copy for its plan's hours instead, so it still updates at
   * its own pace (a Free widget every 72h).
   */
  async fetchCached(
    placeId: string,
    count: number,
    sort: string,
    planHours: number,
  ): Promise<EngineResult> {
    let placeHours = planHours;
    try {
      placeHours =
        (await this.redis.getJson<number>(placeHoursKey(placeId))) ?? planHours;
    } catch {
      // No cadence known yet: treat the place as this plan's own.
    }
    const held = planHours > placeHours;
    const key = `engine:${placeId}:${sort}:${count}:${held ? `${planHours}h` : 'live'}`;
    try {
      const hit = await this.redis.getJson<EngineResult>(key);
      if (hit) return { ...hit, took_ms: 0 };
    } catch (err) {
      this.log.warn(`Embed cache read failed: ${String(err)}`);
    }

    const result = await this.fetch(placeId, count, sort);
    if (result.served !== 'fetching' && !result.error) {
      this.redis
        .setJson(key, result, held ? planHours * 3600 : EMBED_CACHE_SECONDS)
        .catch((err) =>
          this.log.warn(`Embed cache write failed: ${String(err)}`),
        );
    }
    return result;
  }

  /**
   * Same call, but for a caller that is already showing its own "fetching
   * reviews" spinner and can let one HTTP round trip take a while: this
   * polls the engine here instead of making the browser do it, so the
   * dashboard sends exactly one request per action. Each fetch() already
   * waits close to 8s on the engine side before answering, so no extra
   * sleep is added between attempts - just a ceiling on the total wait.
   *
   * Never use this for the public embed: a real visitor's page must not be
   * held open for tens of seconds on a cold place.
   */
  async fetchAndWait(
    placeId: string,
    count = 5,
    sort = 'mostRelevant',
  ): Promise<EngineResult> {
    const deadline = Date.now() + MAX_WAIT_MS;
    let last: EngineResult | null = null;
    do {
      last = await this.fetch(placeId, count, sort);
      if (last.served !== 'fetching') return last;
    } while (Date.now() < deadline);

    this.log.warn(
      `Review engine still fetching ${placeId} after ${MAX_WAIT_MS}ms`,
    );
    return {
      ...last,
      error:
        last.error ??
        'This place is taking longer than usual to fetch. Please try again in a minute.',
    };
  }
}
