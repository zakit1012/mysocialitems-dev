import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
};

type GoogleError = {
  error?: { code?: number; message?: string; status?: string };
};

@Injectable()
export class PlacesService {
  constructor(private readonly config: ConfigService) {}

  async autocomplete(input: string, sessionToken?: string) {
    const body: Record<string, unknown> = { input };
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
        const description = prediction.text?.text ?? '';
        return {
          placeId: prediction.placeId as string,
          name: prediction.structuredFormat?.mainText?.text ?? description,
          address: prediction.structuredFormat?.secondaryText?.text ?? '',
          description,
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
        'X-Goog-FieldMask': 'id,displayName,formattedAddress',
      },
    });

    if (!data.id) {
      throw new BadRequestException('Place details returned no place id');
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
      throw new BadRequestException(
        'GOOGLE_PLACES_API_KEY is missing. Add it to backend/.env',
      );
    }
    return key;
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        'X-Goog-Api-Key': this.apiKey(),
      },
    });

    const payload: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = (payload as GoogleError)?.error?.message;
      throw new BadRequestException(
        message || `Places API request failed (${response.status})`,
      );
    }

    return payload as T;
  }
}
