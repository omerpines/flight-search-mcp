// ---- SerpAPI raw response types ----

export interface SerpAPIAirport {
  name: string;
  id: string;
  time: string; // "YYYY-MM-DD HH:MM"
}

export interface SerpAPIFlightLeg {
  departure_airport: SerpAPIAirport;
  arrival_airport: SerpAPIAirport;
  duration: number; // minutes
  airplane: string;
  airline: string;
  airline_logo?: string;
  travel_class: string;
  flight_number: string;
  extensions?: string[]; // e.g. ["Wi-Fi", "In-seat power"]
  legroom?: string;
  often_delayed_by_over_30_min?: boolean;
}

export interface SerpAPILayover {
  duration: number; // minutes
  name: string;
  id: string;
  overnight?: boolean;
}

export interface SerpAPIFlightOffer {
  flights: SerpAPIFlightLeg[];
  layovers?: SerpAPILayover[];
  total_duration: number; // minutes
  carbon_emissions?: {
    this_flight: number; // grams CO2
    typical_for_this_route?: number;
    difference_percent?: number;
  };
  price: number; // per person in requested currency
  type: string; // "Round trip" | "One way"
  airline_logo?: string;
  booking_token?: string;
  departure_token?: string; // for selecting outbound in 2-step round-trip
}

export interface SerpAPIFlightsResponse {
  best_flights?: SerpAPIFlightOffer[];
  other_flights?: SerpAPIFlightOffer[];
  price_insights?: {
    lowest_price: number;
    price_level?: string;
    typical_price_range?: [number, number];
    price_history?: Array<[number, number]>;
  };
  airports?: Array<{
    departure: Array<{ airport: { name: string; id: string }; city: string; country: string }>;
    arrival: Array<{ airport: { name: string; id: string }; city: string; country: string }>;
  }>;
  error?: string;
}

// ---- Normalized types (service-agnostic) ----

export interface NormalizedSegment {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  carrier: string;
  flightNumber: string;
  aircraft?: string;
  legroom?: string;
  stops: number;
  amenities?: string[];
}

export interface NormalizedFlight {
  offerId: string; // booking_token or deterministic hash
  rank: number;
  tripType: 'one-way' | 'round-trip';
  price: number; // per-person
  priceTotal: number; // price × passengers
  currency: string;
  priceDisplay: string;
  airlines: string[];
  totalDurationMinutes: number;
  totalStops: number;
  stopLabel: string;
  outboundSegments: NormalizedSegment[];
  returnSegments?: NormalizedSegment[];
  outboundDepartAt: string;
  outboundArriveAt: string;
  returnDepartAt?: string;
  returnArriveAt?: string;
  carbonGrams?: number;
  carbonVsTypical?: string;
  bookingToken?: string;
}

export interface NormalizedSearchResult {
  flights: NormalizedFlight[];
  priceInsights?: {
    lowestPrice: number;
    typicalRange?: [number, number];
    priceLevel?: string;
  };
}

// ---- Tool-level params ----

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  maxResults?: number;
  nonStop?: boolean;
}

export type ScorePriority = 'price' | 'duration' | 'stops' | 'balanced';

export interface ScoredFlight {
  rank: number;
  score: number;
  flight: NormalizedFlight;
  breakdown: {
    priceScore: number;
    durationScore: number;
    stopsScore: number;
  };
}

// ---- Price tracker ----

export interface PriceTrackEntry {
  id: string;
  label: string;
  params: FlightSearchParams;
  createdAt: string;
  samples: Array<{
    timestamp: string;
    lowestPrice: number;
    currency: string;
    offerId: string;
  }>;
}

export interface PriceTrackerStore {
  entries: PriceTrackEntry[];
}
