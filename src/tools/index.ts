import type { SerpAPIClient } from '../services/serpapi.js';
import { searchFlightsTool, handleSearchFlights } from './search-flights.js';
import { getBestDealTool, handleGetBestDeal } from './get-best-deal.js';
import { getFlightDetailsTool, handleGetFlightDetails } from './get-flight-details.js';
import { trackPriceTool, handleTrackPrice } from './track-price.js';

export const toolDefinitions = [
  searchFlightsTool,
  getBestDealTool,
  getFlightDetailsTool,
  trackPriceTool,
];

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  serpapi: SerpAPIClient
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case 'search_flights':
      return handleSearchFlights(args, serpapi);
    case 'get_best_deal':
      return handleGetBestDeal(args, serpapi);
    case 'get_flight_details':
      return handleGetFlightDetails(args, serpapi);
    case 'track_price':
      return handleTrackPrice(args, serpapi);
    default:
      throw new Error(
        `Unknown tool: "${name}". Available: ${toolDefinitions.map((t) => t.name).join(', ')}`
      );
  }
}
