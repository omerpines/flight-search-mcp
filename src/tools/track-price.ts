import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { SerpAPIClient } from '../services/serpapi.js';
import { normalizeIATA, isValidIATA, getAirportCity } from '../services/airports.js';
import type { FlightSearchParams, PriceTrackerStore, PriceTrackEntry } from '../types/index.js';

export const trackPriceTool = {
  name: 'track_price',
  description:
    'Monitor flight prices over time. Add a search to track it, list all tracked searches, ' +
    'check the current price for a saved search (records the delta vs. last check), or remove a search.',
  annotations: { title: 'Track Flight Prices' },
  inputSchema: {
    type: 'object',
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'list', 'check', 'remove'],
        description:
          "'add' saves a new search to track (returns trackId). " +
          "'list' shows all tracked searches with last recorded price. " +
          "'check' re-runs the search and records the current lowest price (returns price delta). " +
          "'remove' deletes a tracked search by trackId.",
      },
      trackId: {
        type: 'string',
        description: "Required for 'check' and 'remove' — the UUID returned by 'add'.",
      },
      origin: {
        type: 'string',
        description: "IATA departure code. Required for 'add'.",
        pattern: '^[A-Za-z]{3}$',
      },
      destination: {
        type: 'string',
        description: "IATA arrival code. Required for 'add'.",
        pattern: '^[A-Za-z]{3}$',
      },
      departureDate: {
        type: 'string',
        description: "Departure date YYYY-MM-DD. Required for 'add'.",
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      returnDate: {
        type: 'string',
        description: "Return date for round-trip (optional for 'add').",
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      adults: {
        type: 'integer',
        description: 'Adult passengers (default: 1).',
        minimum: 1,
        maximum: 9,
        default: 1,
      },
      travelClass: {
        type: 'string',
        enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'],
        description: 'Cabin class (default: ECONOMY).',
        default: 'ECONOMY',
      },
    },
  },
};

function getStorePath(): string {
  return process.env.PRICE_TRACKER_PATH ?? './data/price-tracker.json';
}

function loadStore(): PriceTrackerStore {
  const p = getStorePath();
  if (!fs.existsSync(p)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as PriceTrackerStore;
  } catch {
    return { entries: [] };
  }
}

function saveStore(store: PriceTrackerStore): void {
  const p = getStorePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf-8');
}

function makeLabel(params: FlightSearchParams): string {
  const trip = params.returnDate ? 'Round-trip' : 'One-way';
  const adults = params.adults ?? 1;
  return (
    `${trip}: ${getAirportCity(params.origin)} → ${getAirportCity(params.destination)}` +
    ` on ${params.departureDate}` +
    (params.returnDate ? ` ↩ ${params.returnDate}` : '') +
    ` (${adults} adult${adults > 1 ? 's' : ''}, ${params.travelClass ?? 'ECONOMY'})`
  );
}

async function fetchLowestPrice(
  params: FlightSearchParams,
  serpapi: SerpAPIClient
): Promise<{ lowestPrice: number; currency: string; offerId: string } | null> {
  const result = await serpapi.searchFlights({ ...params, maxResults: 5 });
  if (result.flights.length === 0) return null;
  const cheapest = result.flights.reduce((a, b) => (a.priceTotal < b.priceTotal ? a : b));
  return {
    lowestPrice: cheapest.priceTotal,
    currency:    cheapest.currency,
    offerId:     cheapest.offerId,
  };
}

export async function handleTrackPrice(
  args: Record<string, unknown>,
  serpapi: SerpAPIClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const action = String(args.action ?? '');

  if (action === 'add') {
    const origin      = normalizeIATA(String(args.origin ?? ''));
    const destination = normalizeIATA(String(args.destination ?? ''));
    const departureDate = String(args.departureDate ?? '');

    if (!isValidIATA(origin))      throw new Error(`Invalid origin IATA: "${origin}".`);
    if (!isValidIATA(destination)) throw new Error(`Invalid destination IATA: "${destination}".`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate))
      throw new Error(`Invalid departureDate: "${departureDate}".`);

    const params: FlightSearchParams = {
      origin,
      destination,
      departureDate,
      returnDate:  args.returnDate ? String(args.returnDate) : undefined,
      adults:      typeof args.adults === 'number' ? args.adults : 1,
      travelClass: (args.travelClass as FlightSearchParams['travelClass']) ?? 'ECONOMY',
    };

    const initial = await fetchLowestPrice(params, serpapi);

    const entry: PriceTrackEntry = {
      id:        uuidv4(),
      label:     makeLabel(params),
      params,
      createdAt: new Date().toISOString(),
      samples:   initial ? [{ timestamp: new Date().toISOString(), ...initial }] : [],
    };

    const store = loadStore();
    store.entries.push(entry);
    saveStore(store);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success:      true,
          trackId:      entry.id,
          label:        entry.label,
          initialPrice: initial ? `${initial.currency} ${initial.lowestPrice.toFixed(2)}` : 'Could not fetch initial price',
          tip: `Use track_price with action "check" and trackId "${entry.id}" to check the latest price.`,
        }),
      }],
    };
  }

  if (action === 'list') {
    const store = loadStore();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count:   store.entries.length,
          tracked: store.entries.map((e) => ({
            trackId:      e.id,
            label:        e.label,
            createdAt:    e.createdAt,
            sampleCount:  e.samples.length,
            latestPrice:  e.samples.length > 0
              ? `${e.samples[e.samples.length - 1].currency} ${e.samples[e.samples.length - 1].lowestPrice.toFixed(2)}`
              : 'No price recorded yet',
            latestCheck:  e.samples.length > 0 ? e.samples[e.samples.length - 1].timestamp : null,
          })),
          tip: store.entries.length > 0
            ? 'Use action "check" with a trackId to record the latest price.'
            : 'Use action "add" to start tracking a flight price.',
        }, null, 2),
      }],
    };
  }

  if (action === 'check') {
    const trackId = String(args.trackId ?? '').trim();
    if (!trackId) throw new Error('trackId is required for action "check".');

    const store = loadStore();
    const entry = store.entries.find((e) => e.id === trackId);
    if (!entry) throw new Error(`No tracked search found with trackId "${trackId}".`);

    const current = await fetchLowestPrice(entry.params, serpapi);
    if (!current) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ trackId, label: entry.label, message: 'No flights found today for this route.' }),
        }],
      };
    }

    const previous = entry.samples.length > 0 ? entry.samples[entry.samples.length - 1] : null;
    const delta    = previous ? current.lowestPrice - previous.lowestPrice : null;

    entry.samples.push({ timestamp: new Date().toISOString(), ...current });
    saveStore(store);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          trackId,
          label:        entry.label,
          currentPrice: `${current.currency} ${current.lowestPrice.toFixed(2)}`,
          offerId:      current.offerId,
          priceChange:  delta !== null
            ? {
                delta:         delta.toFixed(2),
                direction:     delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged',
                previousPrice: `${previous!.currency} ${previous!.lowestPrice.toFixed(2)}`,
                lastChecked:   previous!.timestamp,
              }
            : { note: 'First price sample recorded.' },
          totalSamples: entry.samples.length,
          tip:
            delta !== null && delta < 0
              ? `Price dropped ${Math.abs(delta).toFixed(2)} ${current.currency}! ` +
                `Use get_flight_details with offerId "${current.offerId}" for full details.`
              : `Use get_flight_details with offerId "${current.offerId}" for full details.`,
        }),
      }],
    };
  }

  if (action === 'remove') {
    const trackId = String(args.trackId ?? '').trim();
    if (!trackId) throw new Error('trackId is required for action "remove".');

    const store = loadStore();
    const index = store.entries.findIndex((e) => e.id === trackId);
    if (index === -1) throw new Error(`No tracked search found with trackId "${trackId}".`);

    const removed = store.entries.splice(index, 1)[0];
    saveStore(store);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, removed: { trackId: removed.id, label: removed.label } }),
      }],
    };
  }

  throw new Error(`Unknown action "${action}". Use: add, list, check, or remove.`);
}
