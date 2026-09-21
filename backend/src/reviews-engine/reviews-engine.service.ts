import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type EngineReview = {
  review_id: string | null;
  author: string | null;
  author_photo: string | null;
  rating: number | null;
  text: string;
  published_at_text: string | null;
  images: string[];
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
  error?: string;
};

@Injectable()
export class ReviewsEngineService {
  private readonly log = new Logger(ReviewsEngineService.name);

  constructor(private readonly config: ConfigService) {}

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
    const url = new URL(`${this.baseUrl()}/v1/reviews`);
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('count', String(count));
    url.searchParams.set('sort', sort);

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
      // The engine scrapes on a cold cache, which can take a while.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        this.log.warn(`Review engine returned ${res.status} for ${placeId}`);
        return empty(`Review engine returned ${res.status}`);
      }

      const data = (await res.json()) as Omit<EngineResult, 'took_ms'>;
      const took = Date.now() - started;
      this.log.log(
        `reviews ${placeId} in ${took}ms (${data.served ?? '?'} / ${data.source ?? '?'})`,
      );
      return { ...data, took_ms: took };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.log.error(`Review engine failed for ${placeId}: ${reason}`);
      return empty(reason);
    }
  }
}
