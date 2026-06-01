import type { SerpAPIClient } from '../services/serpapi.js';
import { getAirportDisplay, normalizeIATA, isValidIATA } from '../services/airports.js';
import { formatDuration, formatFlight } from './search-flights.js';

export const getFlightDetailsTool = {
  name: 'get_flight_details',
  description:
    'Get full itinerary details for a specific flight offer returned by search_flights or get_best_deal. ' +
    'Includes segment-by-segment breakdown, amenities, legroom, carbon emissions, and a Google Flights booking link.',
  annotations: { title: 'Get Flight Details', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    required: ['offerId', 'origin', 'destination', 'departureDate', 'adults'],
    properties: {
      offerId: {
        type: 'string',
        description: 'The offerId returned from search_flights or get_best_deal.',
      },
      origin: {
        type: 'string',
        description: 'IATA departure code (same as the original search).',
        pattern: '^[A-Za-z]{3}$',
      },
      destination: {
        type: 'string',
        description: 'IATA arrival code (same as the original search).',
        pattern: '^[A-Za-z]{3}$',
      },
      departureDate: {
        type: 'string',
        description: 'Departure date YYYY-MM-DD (same as the original search).',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      returnDate: {
        type: 'string',
        description: 'Return date if it was a round-trip search.',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      adults: {
        type: 'integer',
        description: 'Number of adult passengers (same as the original search).',
        minimum: 1,
        maximum: 9,
      },
      travelClass: {
        type: 'string',
        enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
        description: 'Cabin class (same as original search, default: ECONOMY)',
        default: 'ECONOMY',
      },
    },
  },
};

export async function handleGetFlightDetails(
  args: Record<string, unknown>,
  serpapi: SerpAPIClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const offerId     = String(args.offerId ?? '').trim();
  const origin      = normalizeIATA(String(args.origin ?? ''));
  const destination = normalizeIATA(String(args.destination ?? ''));
  const departureDate = String(args.departureDate ?? '');

  if (!offerId)              throw new Error('offerId is required.');
  if (!isValidIATA(origin))  throw new Error(`Invalid origin IATA: "${origin}".`);
  if (!isValidIATA(destination)) throw new Error(`Invalid destination IATA: "${destination}".`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate))
    throw new Error(`Invalid departureDate: "${departureDate}".`);

  const flight = await serpapi.findFlightByToken(offerId, {
    origin,
    destination,
    departureDate,
    returnDate:  args.returnDate ? String(args.returnDate) : undefined,
    adults:      typeof args.adults === 'number' ? args.adults : 1,
    travelClass: (args.travelClass as 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST') ?? 'ECONOMY',
    maxResults:  20,
  });

  if (!flight) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: `Flight with offerId "${offerId}" not found in current search results. ` +
            'Offer IDs are session-scoped — run search_flights again to get fresh IDs.',
        }),
      }],
    };
  }

  // Build Google Flights booking URL (deep link)
  const gflightsBase = 'https://www.google.com/travel/flights';
  const fromCode = origin;
  const toCode   = destination;
  const bookingUrl = `${gflightsBase}/search?q=flights+from+${fromCode}+to+${toCode}+on+${departureDate}`;

  const output = {
    offerId:     flight.offerId,
    source:      'Google Flights (via SerpAPI)',
    price: {
      perPerson: `${flight.currency} ${flight.price.toFixed(2)}`,
      total:     flight.priceDisplay,
      currency:  flight.currency,
    },
    tripType:    flight.tripType,
    airlines:    flight.airlines,
    totalDuration: formatDuration(flight.totalDurationMinutes),
    totalDurationMinutes: flight.totalDurationMinutes,
    stops:       flight.totalStops,
    stopLabel:   flight.stopLabel,
    outbound: {
      from:      getAirportDisplay(origin),
      to:        getAirportDisplay(destination),
      departAt:  flight.outboundDepartAt,
      arriveAt:  flight.outboundArriveAt,
      segments:  flight.outboundSegments.map((s) => ({
        flight:    s.flightNumber,
        airline:   s.carrier,
        from:      `${s.fromName} (${s.from})`,
        to:        `${s.toName} (${s.to})`,
        departs:   s.departAt,
        arrives:   s.arriveAt,
        duration:  formatDuration(s.durationMinutes),
        aircraft:  s.aircraft ?? null,
        legroom:   s.legroom ?? null,
        amenities: s.amenities ?? [],
      })),
    },
    ...(flight.returnSegments && flight.returnSegments.length > 0
      ? {
          return: {
            from:     getAirportDisplay(destination),
            to:       getAirportDisplay(origin),
            departAt: flight.returnDepartAt,
            arriveAt: flight.returnArriveAt,
            segments: flight.returnSegments.map((s) => ({
              flight:    s.flightNumber,
              airline:   s.carrier,
              from:      `${s.fromName} (${s.from})`,
              to:        `${s.toName} (${s.to})`,
              departs:   s.departAt,
              arrives:   s.arriveAt,
              duration:  formatDuration(s.durationMinutes),
              aircraft:  s.aircraft ?? null,
              legroom:   s.legroom ?? null,
              amenities: s.amenities ?? [],
            })),
          },
        }
      : {}),
    carbon: flight.carbonGrams
      ? {
          grams:     flight.carbonGrams,
          vsTypical: flight.carbonVsTypical ?? null,
        }
      : null,
    bookingUrl,
    note: 'Click the booking URL to complete your booking on Google Flights.',
    fullDetails: formatFlight(flight),
  };

  return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
}
