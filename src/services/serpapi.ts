import type {
  FlightSearchParams,
  NormalizedFlight,
  NormalizedSearchResult,
  NormalizedSegment,
  SerpAPIFlightLeg,
  SerpAPIFlightOffer,
  SerpAPIFlightsResponse,
} from '../types/index.js';

export class SerpAPIError extends Error {
  constructor(msg: string, public readonly statusCode?: number) {
    super(msg);
    this.name = 'SerpAPIError';
  }
}

// SerpAPI travel_class parameter values
const TRAVEL_CLASS_MAP: Record<string, string> = {
  ECONOMY:         '1',
  PREMIUM_ECONOMY: '2',
  BUSINESS:        '3',
  FIRST:           '4',
};

function parseSerpTime(raw: string): string {
  // SerpAPI returns "YYYY-MM-DD HH:MM" — convert to ISO-like for consistency
  return raw.replace(' ', 'T') + ':00';
}

function buildSegment(leg: SerpAPIFlightLeg): NormalizedSegment {
  return {
    from:            leg.departure_airport.id,
    fromName:        leg.departure_airport.name,
    to:              leg.arrival_airport.id,
    toName:          leg.arrival_airport.name,
    departAt:        parseSerpTime(leg.departure_airport.time),
    arriveAt:        parseSerpTime(leg.arrival_airport.time),
    durationMinutes: leg.duration,
    carrier:         leg.airline,
    flightNumber:    leg.flight_number,
    aircraft:        leg.airplane || undefined,
    legroom:         leg.legroom || undefined,
    stops:           0, // each leg is one segment (SerpAPI already splits at stopovers)
    amenities:       leg.extensions,
  };
}

function normalizeOffer(
  offer: SerpAPIFlightOffer,
  index: number,
  passengers: number,
  currency: string
): NormalizedFlight {
  const outboundSegments = offer.flights.map(buildSegment);
  const firstSeg = outboundSegments[0];
  const lastSeg  = outboundSegments[outboundSegments.length - 1];
  const totalStops = outboundSegments.length - 1 + (offer.layovers?.length ?? 0);

  const airlines = [...new Set(offer.flights.map((f) => f.airline))];
  const priceTotal = offer.price * passengers;

  let carbonVsTypical: string | undefined;
  if (offer.carbon_emissions?.difference_percent !== undefined) {
    const pct = offer.carbon_emissions.difference_percent;
    carbonVsTypical = pct < 0 ? `${Math.abs(pct)}% less than typical` : `${pct}% more than typical`;
  }

  return {
    offerId:              offer.booking_token ?? `offer-${index}`,
    rank:                 index + 1,
    tripType:             offer.type?.toLowerCase().includes('round') ? 'round-trip' : 'one-way',
    price:                offer.price,
    priceTotal,
    currency,
    priceDisplay:         `${currency} ${priceTotal.toFixed(2)}`,
    airlines,
    totalDurationMinutes: offer.total_duration,
    totalStops,
    stopLabel:            totalStops === 0 ? 'Non-stop' : `${totalStops} stop${totalStops > 1 ? 's' : ''}`,
    outboundSegments,
    outboundDepartAt:     firstSeg?.departAt ?? '',
    outboundArriveAt:     lastSeg?.arriveAt ?? '',
    carbonGrams:          offer.carbon_emissions?.this_flight,
    carbonVsTypical,
    bookingToken:         offer.booking_token,
  };
}

export class SerpAPIClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://serpapi.com/search.json';

  constructor() {
    this.apiKey = process.env.SERPAPI_KEY ?? '';
    if (!this.apiKey) {
      console.warn('[SerpAPI] SERPAPI_KEY not set — flight searches will fail');
    }
  }

  async searchFlights(params: FlightSearchParams): Promise<NormalizedSearchResult> {
    const passengers = (params.adults ?? 1) + (params.children ?? 0);
    const currency = 'USD';

    const query = new URLSearchParams({
      engine:           'google_flights',
      api_key:          this.apiKey,
      departure_id:     params.origin.toUpperCase(),
      arrival_id:       params.destination.toUpperCase(),
      outbound_date:    params.departureDate,
      type:             params.returnDate ? '1' : '2', // 1=round-trip, 2=one-way
      currency,
      hl:               'en',
      adults:           String(params.adults ?? 1),
      travel_class:     TRAVEL_CLASS_MAP[params.travelClass ?? 'ECONOMY'] ?? '1',
    });

    if (params.returnDate) query.set('return_date', params.returnDate);
    if (params.children && params.children > 0) query.set('children', String(params.children));
    if (params.nonStop) query.set('stops', '0'); // 0 = non-stop only in SerpAPI

    const resp = await fetch(`${this.baseUrl}?${query.toString()}`);
    if (!resp.ok) {
      const text = await resp.text();
      throw new SerpAPIError(`SerpAPI request failed (${resp.status}): ${text}`, resp.status);
    }

    const data = (await resp.json()) as SerpAPIFlightsResponse;

    if (data.error) {
      throw new SerpAPIError(`SerpAPI error: ${data.error}`);
    }

    const maxResults = Math.min(params.maxResults ?? 10, 20);

    // Merge best_flights first, then other_flights; cap at maxResults
    const allOffers: SerpAPIFlightOffer[] = [
      ...(data.best_flights ?? []),
      ...(data.other_flights ?? []),
    ].slice(0, maxResults);

    const flights = allOffers.map((o, i) => normalizeOffer(o, i, passengers, currency));

    const insights = data.price_insights
      ? {
          lowestPrice:  data.price_insights.lowest_price,
          typicalRange: data.price_insights.typical_price_range,
          priceLevel:   data.price_insights.price_level,
        }
      : undefined;

    return { flights, priceInsights: insights };
  }

  async findFlightByToken(
    token: string,
    params: FlightSearchParams
  ): Promise<NormalizedFlight | null> {
    const result = await this.searchFlights({ ...params, maxResults: 20 });
    return result.flights.find((f) => f.bookingToken === token || f.offerId === token) ?? null;
  }
}
