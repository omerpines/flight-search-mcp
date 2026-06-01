import type { SerpAPIClient } from '../services/serpapi.js';
import { getAirportDisplay, normalizeIATA, isValidIATA } from '../services/airports.js';
import { formatDuration, formatFlight } from './search-flights.js';
import type { NormalizedFlight, ScorePriority, ScoredFlight } from '../types/index.js';

export const getBestDealTool = {
  name: 'get_best_deal',
  description:
    'Search Google Flights and return the best deal using a scoring algorithm that weighs ' +
    'price, total travel duration, and number of stops. Returns the top-ranked flight plus a full ranked list.',
  annotations: { title: 'Find Best Flight Deal', readOnlyHint: true, idempotentHint: true },
  inputSchema: {
    type: 'object',
    required: ['origin', 'destination', 'departureDate'],
    properties: {
      origin: {
        type: 'string',
        description: "IATA airport code for departure, e.g. 'TLV', 'JFK'.",
        pattern: '^[A-Za-z]{3}$',
      },
      destination: {
        type: 'string',
        description: "IATA airport code for arrival, e.g. 'CDG', 'LHR'.",
        pattern: '^[A-Za-z]{3}$',
      },
      departureDate: {
        type: 'string',
        description: 'Departure date in YYYY-MM-DD format.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      returnDate: {
        type: 'string',
        description: 'Return date for round-trip in YYYY-MM-DD format. Omit for one-way.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      adults: {
        type: 'integer',
        description: 'Number of adult passengers (default: 1)',
        minimum: 1,
        maximum: 9,
        default: 1,
      },
      travelClass: {
        type: 'string',
        enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
        description: 'Cabin class (default: ECONOMY)',
        default: 'ECONOMY',
      },
      priority: {
        type: 'string',
        enum: ['price', 'duration', 'stops', 'balanced'],
        description:
          "'price' minimizes cost, 'duration' minimizes travel time, 'stops' prefers direct flights, 'balanced' weighs all equally (default: balanced)",
        default: 'balanced',
      },
    },
  },
};

const WEIGHTS: Record<ScorePriority, { price: number; duration: number; stops: number }> = {
  price:    { price: 0.80, duration: 0.15, stops: 0.05 },
  duration: { price: 0.15, duration: 0.75, stops: 0.10 },
  stops:    { price: 0.20, duration: 0.20, stops: 0.60 },
  balanced: { price: 0.40, duration: 0.35, stops: 0.25 },
};

function norm(v: number, min: number, max: number): number {
  return max === min ? 1 : 1 - (v - min) / (max - min);
}

export function scoreFlights(flights: NormalizedFlight[], priority: ScorePriority): ScoredFlight[] {
  const w = WEIGHTS[priority];

  const prices    = flights.map((f) => f.priceTotal);
  const durations = flights.map((f) => f.totalDurationMinutes);
  const stops     = flights.map((f) => f.totalStops);

  const minP = Math.min(...prices),    maxP = Math.max(...prices);
  const minD = Math.min(...durations), maxD = Math.max(...durations);
  const minS = Math.min(...stops),     maxS = Math.max(...stops);

  return flights
    .map((f) => {
      const priceScore    = norm(f.priceTotal,            minP, maxP);
      const durationScore = norm(f.totalDurationMinutes,  minD, maxD);
      const stopsScore    = norm(f.totalStops,             minS, maxS);
      const score = w.price * priceScore + w.duration * durationScore + w.stops * stopsScore;
      return {
        rank:  0,
        score: Math.round(score * 1000) / 1000,
        flight: f,
        breakdown: {
          priceScore:    Math.round(priceScore    * 1000) / 1000,
          durationScore: Math.round(durationScore * 1000) / 1000,
          stopsScore:    Math.round(stopsScore    * 1000) / 1000,
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, i) => ({ ...item, rank: i + 1, flight: { ...item.flight, rank: i + 1 } }));
}

export async function handleGetBestDeal(
  args: Record<string, unknown>,
  serpapi: SerpAPIClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const origin      = normalizeIATA(String(args.origin ?? ''));
  const destination = normalizeIATA(String(args.destination ?? ''));
  const departureDate = String(args.departureDate ?? '');
  const priority    = (args.priority as ScorePriority) ?? 'balanced';

  if (!isValidIATA(origin))      throw new Error(`Invalid origin IATA: "${origin}".`);
  if (!isValidIATA(destination)) throw new Error(`Invalid destination IATA: "${destination}".`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate))
    throw new Error(`Invalid departureDate: "${departureDate}". Use YYYY-MM-DD.`);

  const result = await serpapi.searchFlights({
    origin,
    destination,
    departureDate,
    returnDate:  args.returnDate ? String(args.returnDate) : undefined,
    adults:      typeof args.adults === 'number' ? args.adults : 1,
    travelClass: (args.travelClass as 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST') ?? 'ECONOMY',
    maxResults:  20,
  });

  if (result.flights.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'No flights found for this route and date.',
          query: { origin, destination, departureDate, returnDate: args.returnDate ?? null },
        }),
      }],
    };
  }

  const scored = scoreFlights(result.flights, priority);
  const best   = scored[0];
  const w      = WEIGHTS[priority];

  const output = {
    query: {
      from:           getAirportDisplay(origin),
      to:             getAirportDisplay(destination),
      departureDate,
      returnDate:     args.returnDate ?? null,
      adults:         args.adults ?? 1,
      travelClass:    args.travelClass ?? 'ECONOMY',
      priority,
      scoringWeights: w,
    },
    bestDeal: {
      rank:          1,
      offerId:       best.flight.offerId,
      score:         best.score,
      price:         best.flight.priceDisplay,
      duration:      formatDuration(best.flight.totalDurationMinutes),
      stops:         best.flight.stopLabel,
      airlines:      best.flight.airlines,
      scoreBreakdown: best.breakdown,
      details:       formatFlight(best.flight),
    },
    allRanked: scored.map((s) => ({
      rank:     s.rank,
      offerId:  s.flight.offerId,
      score:    s.score,
      price:    s.flight.priceDisplay,
      duration: formatDuration(s.flight.totalDurationMinutes),
      stops:    s.flight.stopLabel,
      airlines: s.flight.airlines,
    })),
    priceInsights: result.priceInsights ?? null,
    tip: `Use get_flight_details with offerId "${best.flight.offerId}" for full itinerary details.`,
  };

  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}
