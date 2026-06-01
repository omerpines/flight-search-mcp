import type { SerpAPIClient } from '../services/serpapi.js';
import { getAirportDisplay, normalizeIATA, isValidIATA } from '../services/airports.js';
import type { NormalizedFlight, NormalizedSegment } from '../types/index.js';

export const searchFlightsTool = {
  name: 'search_flights',
  description:
    'Search for available flights between two airports on given dates via Google Flights (SerpAPI). ' +
    'Returns a list of flight offers with pricing, duration, airlines, and stop information.',
  annotations: { title: 'Search Flights', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    type: 'object',
    required: ['origin', 'destination', 'departureDate'],
    properties: {
      origin: {
        type: 'string',
        description: "IATA airport code for departure, e.g. 'JFK', 'LHR', 'TLV'. 3 letters.",
        pattern: '^[A-Za-z]{3}$',
      },
      destination: {
        type: 'string',
        description: "IATA airport code for arrival, e.g. 'CDG', 'DXB'. 3 letters.",
        pattern: '^[A-Za-z]{3}$',
      },
      departureDate: {
        type: 'string',
        description: 'Departure date in YYYY-MM-DD format.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      returnDate: {
        type: 'string',
        description: 'Return date in YYYY-MM-DD format for round-trip. Omit for one-way.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      adults: {
        type: 'integer',
        description: 'Number of adult passengers (default: 1)',
        minimum: 1,
        maximum: 9,
        default: 1,
      },
      children: {
        type: 'integer',
        description: 'Number of child passengers aged 2-11 (default: 0)',
        minimum: 0,
        maximum: 8,
        default: 0,
      },
      travelClass: {
        type: 'string',
        enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
        description: 'Cabin class (default: ECONOMY)',
        default: 'ECONOMY',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of offers to return (default: 10, max: 20)',
        minimum: 1,
        maximum: 20,
        default: 10,
      },
      nonStop: {
        type: 'boolean',
        description: 'If true, return only non-stop/direct flights (default: false)',
        default: false,
      },
    },
  },
};

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatSegment(seg: NormalizedSegment) {
  return {
    from:            seg.from,
    fromAirport:     seg.fromName,
    to:              seg.to,
    toAirport:       seg.toName,
    departAt:        seg.departAt,
    arriveAt:        seg.arriveAt,
    duration:        formatDuration(seg.durationMinutes),
    durationMinutes: seg.durationMinutes,
    airline:         seg.carrier,
    flightNumber:    seg.flightNumber,
    aircraft:        seg.aircraft ?? null,
    legroom:         seg.legroom ?? null,
    amenities:       seg.amenities ?? [],
  };
}

export function formatFlight(flight: NormalizedFlight) {
  return {
    offerId:         flight.offerId,
    rank:            flight.rank,
    tripType:        flight.tripType,
    price:           { total: flight.priceTotal, perPerson: flight.price, currency: flight.currency, display: flight.priceDisplay },
    airlines:        flight.airlines,
    totalDuration:   formatDuration(flight.totalDurationMinutes),
    totalDurationMin: flight.totalDurationMinutes,
    stops:           flight.totalStops,
    stopLabel:       flight.stopLabel,
    outbound: {
      departAt:  flight.outboundDepartAt,
      arriveAt:  flight.outboundArriveAt,
      duration:  formatDuration(
        flight.outboundSegments.reduce((a, s) => a + s.durationMinutes, 0)
      ),
      segments:  flight.outboundSegments.map(formatSegment),
    },
    ...(flight.returnSegments && flight.returnSegments.length > 0
      ? {
          return: {
            departAt: flight.returnDepartAt,
            arriveAt: flight.returnArriveAt,
            duration: formatDuration(
              flight.returnSegments.reduce((a, s) => a + s.durationMinutes, 0)
            ),
            segments: flight.returnSegments.map(formatSegment),
          },
        }
      : {}),
    carbon: flight.carbonGrams
      ? { grams: flight.carbonGrams, vsTypical: flight.carbonVsTypical ?? null }
      : null,
  };
}

export async function handleSearchFlights(
  args: Record<string, unknown>,
  serpapi: SerpAPIClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const origin      = normalizeIATA(String(args.origin ?? ''));
  const destination = normalizeIATA(String(args.destination ?? ''));
  const departureDate = String(args.departureDate ?? '');

  if (!isValidIATA(origin))
    throw new Error(`Invalid origin IATA code: "${origin}". Use 3 capital letters (e.g. JFK).`);
  if (!isValidIATA(destination))
    throw new Error(`Invalid destination IATA code: "${destination}". Use 3 letters.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate))
    throw new Error(`Invalid departureDate: "${departureDate}". Use YYYY-MM-DD format.`);

  const result = await serpapi.searchFlights({
    origin,
    destination,
    departureDate,
    returnDate:   args.returnDate ? String(args.returnDate) : undefined,
    adults:       typeof args.adults === 'number' ? args.adults : 1,
    children:     typeof args.children === 'number' ? args.children : 0,
    travelClass:  (args.travelClass as 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST') ?? 'ECONOMY',
    maxResults:   typeof args.maxResults === 'number' ? args.maxResults : 10,
    nonStop:      args.nonStop === true,
  });

  const output = {
    query: {
      from:        getAirportDisplay(origin),
      to:          getAirportDisplay(destination),
      departureDate,
      returnDate:  args.returnDate ?? null,
      passengers:  { adults: args.adults ?? 1, children: args.children ?? 0 },
      travelClass: args.travelClass ?? 'ECONOMY',
      nonStop:     args.nonStop ?? false,
    },
    resultsCount:  result.flights.length,
    priceInsights: result.priceInsights ?? null,
    offers:        result.flights.map(formatFlight),
    tip:
      result.flights.length > 0
        ? 'Use get_best_deal for AI-ranked results, or get_flight_details with an offerId for full details.'
        : 'No flights found. Try different dates, nearby airports, or remove the nonStop filter.',
  };

  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}
