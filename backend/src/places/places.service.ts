import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const UNAVAILABLE =
  'Google place search is not available right now. Please try again in a minute.';

/**
 * Google Places API (New).
 * The legacy maps.googleapis.com/maps/api/place endpoints are not enabled for
 * new Google Cloud projects, so everything here uses places.googleapis.com/v1.
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places';

type Text = { text?: string };

type PlacePrediction = {
  placeId?: string;
  text?: Text;
  structuredFormat?: {
    mainText?: Text;
    secondaryText?: Text;
  };
};

type AutocompleteResponse = {
  suggestions?: Array<{ placePrediction?: PlacePrediction }>;
};

type DetailsResponse = {
  id?: string;
  displayName?: Text;
  formattedAddress?: string;
  types?: string[];
};

type GoogleError = {
  error?: { code?: number; message?: string; status?: string };
};

@Injectable()
export class PlacesService {
  private readonly log = new Logger(PlacesService.name);

  constructor(private readonly config: ConfigService) {}

  async autocomplete(input: string, sessionToken?: string) {
    // Cities and areas (Mohali, a neighbourhood) are places too. This search
    // is for a business the widget can show reviews for, so those stay out.
    const body: Record<string, unknown> = {
      input,
      includedPrimaryTypes: ['establishment'],
    };
    if (sessionToken) {
      body.sessionToken = sessionToken;
    }

    const data = await this.call<AutocompleteResponse>(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return (data.suggestions ?? [])
      .map((item) => item.placePrediction)
      .filter((prediction): prediction is PlacePrediction =>
        Boolean(prediction?.placeId),
      )
      .map((prediction) => {
        const name =
          prediction.structuredFormat?.mainText?.text ||
          prediction.text?.text ||
          '';
        const address = prediction.structuredFormat?.secondaryText?.text ?? '';
        return {
          placeId: prediction.placeId as string,
          name,
          address,
          description: name,
        };
      });
  }

  async details(placeId: string, sessionToken?: string) {
    const url = new URL(`${DETAILS_URL}/${encodeURIComponent(placeId)}`);
    if (sessionToken) {
      url.searchParams.set('sessionToken', sessionToken);
    }

    const data = await this.call<DetailsResponse>(url.toString(), {
      method: 'GET',
      headers: {
        // The new API refuses a request without an explicit field mask.
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,types',
      },
    });

    if (!data.id) {
      throw new BadRequestException('Place details returned no place id');
    }
    if (!(data.types ?? []).includes('establishment')) {
      throw new BadRequestException(
        'That place is a location, not a business. Search for the business name.',
      );
    }

    return {
      placeId: data.id,
      name: data.displayName?.text ?? '',
      address: data.formattedAddress ?? '',
    };
  }

  private apiKey() {
    const key = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!key) {
      this.log.error('GOOGLE_PLACES_API_KEY is missing from backend/.env');
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
    return key;
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        // A stuck Google call should not hold the user's search forever.
        signal: AbortSignal.timeout(10_000),
        headers: {
          ...(init.headers as Record<string, string>),
          'X-Goog-Api-Key': this.apiKey(),
        },
      });
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.log.error(`Places API unreachable: ${String(err)}`);
      throw new ServiceUnavailableException(UNAVAILABLE);
    }

    const payload: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Google's text can describe our key setup (IP restrictions, billing);
      // that is for our logs, not for the person searching.
      const message = (payload as GoogleError)?.error?.message;
      this.log.error(
        `Places API ${response.status}: ${message ?? 'no message'}`,
      );
      if (
        response.status === 400 &&
        !/key|restrict|billing|permission/i.test(message ?? '')
      ) {
        throw new BadRequestException('Google could not find that place.');
      }
      throw new ServiceUnavailableException(UNAVAILABLE);
    }

    return payload as T;
  }
}
