import type { PlaceSuggestion } from "@/components/PlaceAutocomplete";

/**
 * Place search straight from the browser to Google (Maps JavaScript API),
 * instead of browser -> our backend -> Google. One hop instead of two is
 * what makes suggestions show up while the person is still typing.
 *
 * This key is public by design - it ends up in the page. It must be a
 * separate key from the backend's GOOGLE_PLACES_API_KEY, restricted in
 * Google Cloud to our website(s) and to the Maps JavaScript + Places (New)
 * APIs only, with a daily quota cap.
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

export const browserPlacesEnabled = KEY.length > 0;

type Text = { text: string };

type PlacePrediction = {
  placeId: string;
  text: Text;
  mainText: Text | null;
  secondaryText: Text | null;
  toPlace(): { fetchFields(options: { fields: string[] }): Promise<unknown> };
};

type PlacesLibrary = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      sessionToken: object;
      includedPrimaryTypes: string[];
    }): Promise<{ suggestions: Array<{ placePrediction: PlacePrediction | null }> }>;
  };
};

declare global {
  interface Window {
    google?: { maps: { importLibrary(name: string): Promise<unknown> } };
    __socialDealMapsReady?: () => void;
  }
}

let loading: Promise<PlacesLibrary> | null = null;

function loadPlaces(): Promise<PlacesLibrary> {
  if (!loading) {
    loading = new Promise<PlacesLibrary>((resolve, reject) => {
      window.__socialDealMapsReady = () => {
        window.google!.maps
          .importLibrary("places")
          .then((lib) => resolve(lib as PlacesLibrary), reject);
      };
      const script = document.createElement("script");
      script.src =
        "https://maps.googleapis.com/maps/api/js" +
        `?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&callback=__socialDealMapsReady`;
      script.async = true;
      script.onerror = () => reject(new Error("Could not load Google Maps"));
      document.head.appendChild(script);
    }).catch((err: unknown) => {
      // Let the next search try again rather than failing forever.
      loading = null;
      throw err;
    });
  }
  return loading;
}

export class BrowserPlaceSearch {
  // One token covers every search until a place is picked. Google then bills
  // the whole session as a single Place Details call instead of per keystroke.
  private token: object | null = null;
  private predictions = new Map<string, PlacePrediction>();

  async search(input: string): Promise<PlaceSuggestion[]> {
    const places = await loadPlaces();
    this.token ??= new places.AutocompleteSessionToken();

    const { suggestions } =
      await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: this.token,
        // Same rule as the backend search: businesses only, not cities or areas.
        includedPrimaryTypes: ["establishment"],
      });

    this.predictions.clear();
    return suggestions
      .map((item) => item.placePrediction)
      .filter((prediction): prediction is PlacePrediction => Boolean(prediction?.placeId))
      .map((prediction) => {
        this.predictions.set(prediction.placeId, prediction);
        const name = prediction.mainText?.text || prediction.text.text;
        return {
          placeId: prediction.placeId,
          name,
          address: prediction.secondaryText?.text ?? "",
          description: name,
        };
      });
  }

  /** Closes the billing session on the picked place and starts a fresh one. */
  finish(placeId: string) {
    const prediction = this.predictions.get(placeId);
    this.token = null;
    this.predictions.clear();
    // Only the session close matters here; the backend still checks the
    // place itself when the widget is saved.
    void prediction
      ?.toPlace()
      .fetchFields({ fields: ["id", "formattedAddress"] })
      .catch(() => undefined);
  }
}
