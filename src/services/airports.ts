interface AirportInfo {
  city: string;
  country: string;
  name: string;
}

const AIRPORTS: Record<string, AirportInfo> = {
  // North America
  JFK: { city: 'New York', country: 'US', name: 'John F. Kennedy Intl' },
  LGA: { city: 'New York', country: 'US', name: 'LaGuardia' },
  EWR: { city: 'Newark', country: 'US', name: 'Newark Liberty Intl' },
  LAX: { city: 'Los Angeles', country: 'US', name: 'Los Angeles Intl' },
  ORD: { city: 'Chicago', country: 'US', name: "O'Hare Intl" },
  MDW: { city: 'Chicago', country: 'US', name: 'Midway Intl' },
  ATL: { city: 'Atlanta', country: 'US', name: 'Hartsfield-Jackson Atlanta Intl' },
  DFW: { city: 'Dallas', country: 'US', name: 'Dallas/Fort Worth Intl' },
  DEN: { city: 'Denver', country: 'US', name: 'Denver Intl' },
  SFO: { city: 'San Francisco', country: 'US', name: 'San Francisco Intl' },
  SEA: { city: 'Seattle', country: 'US', name: 'Seattle-Tacoma Intl' },
  MIA: { city: 'Miami', country: 'US', name: 'Miami Intl' },
  BOS: { city: 'Boston', country: 'US', name: 'Logan Intl' },
  IAD: { city: 'Washington DC', country: 'US', name: 'Dulles Intl' },
  DCA: { city: 'Washington DC', country: 'US', name: 'Ronald Reagan National' },
  LAS: { city: 'Las Vegas', country: 'US', name: 'Harry Reid Intl' },
  PHX: { city: 'Phoenix', country: 'US', name: 'Sky Harbor Intl' },
  IAH: { city: 'Houston', country: 'US', name: 'George Bush Intercontinental' },
  MSP: { city: 'Minneapolis', country: 'US', name: 'Minneapolis-Saint Paul Intl' },
  DTW: { city: 'Detroit', country: 'US', name: 'Detroit Metropolitan Wayne County' },
  YYZ: { city: 'Toronto', country: 'CA', name: 'Toronto Pearson Intl' },
  YVR: { city: 'Vancouver', country: 'CA', name: 'Vancouver Intl' },
  YUL: { city: 'Montreal', country: 'CA', name: 'Montréal-Trudeau Intl' },
  MEX: { city: 'Mexico City', country: 'MX', name: 'Benito Juárez Intl' },
  // Europe
  LHR: { city: 'London', country: 'GB', name: 'Heathrow' },
  LGW: { city: 'London', country: 'GB', name: 'Gatwick' },
  STN: { city: 'London', country: 'GB', name: 'Stansted' },
  CDG: { city: 'Paris', country: 'FR', name: 'Charles de Gaulle' },
  ORY: { city: 'Paris', country: 'FR', name: 'Orly' },
  FRA: { city: 'Frankfurt', country: 'DE', name: 'Frankfurt Main' },
  MUC: { city: 'Munich', country: 'DE', name: 'Munich Intl' },
  AMS: { city: 'Amsterdam', country: 'NL', name: 'Schiphol' },
  MAD: { city: 'Madrid', country: 'ES', name: 'Adolfo Suárez Madrid-Barajas' },
  BCN: { city: 'Barcelona', country: 'ES', name: 'El Prat' },
  FCO: { city: 'Rome', country: 'IT', name: 'Leonardo da Vinci-Fiumicino' },
  MXP: { city: 'Milan', country: 'IT', name: 'Malpensa' },
  ZRH: { city: 'Zurich', country: 'CH', name: 'Zurich Airport' },
  VIE: { city: 'Vienna', country: 'AT', name: 'Vienna Intl' },
  BRU: { city: 'Brussels', country: 'BE', name: 'Brussels Airport' },
  CPH: { city: 'Copenhagen', country: 'DK', name: 'Copenhagen Airport' },
  ARN: { city: 'Stockholm', country: 'SE', name: 'Arlanda' },
  OSL: { city: 'Oslo', country: 'NO', name: 'Oslo Gardermoen' },
  HEL: { city: 'Helsinki', country: 'FI', name: 'Helsinki-Vantaa' },
  WAW: { city: 'Warsaw', country: 'PL', name: 'Chopin Airport' },
  PRG: { city: 'Prague', country: 'CZ', name: 'Václav Havel Airport' },
  BUD: { city: 'Budapest', country: 'HU', name: 'Budapest Ferenc Liszt Intl' },
  ATH: { city: 'Athens', country: 'GR', name: 'Eleftherios Venizelos' },
  IST: { city: 'Istanbul', country: 'TR', name: 'Istanbul Airport' },
  SAW: { city: 'Istanbul', country: 'TR', name: 'Sabiha Gökçen Intl' },
  LIS: { city: 'Lisbon', country: 'PT', name: 'Humberto Delgado Airport' },
  DUB: { city: 'Dublin', country: 'IE', name: 'Dublin Airport' },
  // Middle East & Africa
  TLV: { city: 'Tel Aviv', country: 'IL', name: 'Ben Gurion Intl' },
  DXB: { city: 'Dubai', country: 'AE', name: 'Dubai Intl' },
  AUH: { city: 'Abu Dhabi', country: 'AE', name: 'Zayed Intl' },
  DOH: { city: 'Doha', country: 'QA', name: 'Hamad Intl' },
  RUH: { city: 'Riyadh', country: 'SA', name: 'King Khalid Intl' },
  JED: { city: 'Jeddah', country: 'SA', name: 'King Abdulaziz Intl' },
  KWI: { city: 'Kuwait City', country: 'KW', name: 'Kuwait Intl' },
  AMM: { city: 'Amman', country: 'JO', name: 'Queen Alia Intl' },
  BEY: { city: 'Beirut', country: 'LB', name: 'Rafic Hariri Intl' },
  CAI: { city: 'Cairo', country: 'EG', name: 'Cairo Intl' },
  JNB: { city: 'Johannesburg', country: 'ZA', name: 'O.R. Tambo Intl' },
  NBO: { city: 'Nairobi', country: 'KE', name: 'Jomo Kenyatta Intl' },
  ADD: { city: 'Addis Ababa', country: 'ET', name: 'Bole Intl' },
  CMN: { city: 'Casablanca', country: 'MA', name: 'Mohammed V Intl' },
  // Asia-Pacific
  PEK: { city: 'Beijing', country: 'CN', name: 'Beijing Capital Intl' },
  PKX: { city: 'Beijing', country: 'CN', name: 'Beijing Daxing Intl' },
  PVG: { city: 'Shanghai', country: 'CN', name: 'Pudong Intl' },
  SHA: { city: 'Shanghai', country: 'CN', name: 'Hongqiao Intl' },
  HKG: { city: 'Hong Kong', country: 'HK', name: 'Hong Kong Intl' },
  SIN: { city: 'Singapore', country: 'SG', name: 'Changi Airport' },
  BKK: { city: 'Bangkok', country: 'TH', name: 'Suvarnabhumi' },
  KUL: { city: 'Kuala Lumpur', country: 'MY', name: 'Kuala Lumpur Intl' },
  CGK: { city: 'Jakarta', country: 'ID', name: 'Soekarno-Hatta Intl' },
  MNL: { city: 'Manila', country: 'PH', name: 'Ninoy Aquino Intl' },
  ICN: { city: 'Seoul', country: 'KR', name: 'Incheon Intl' },
  NRT: { city: 'Tokyo', country: 'JP', name: 'Narita Intl' },
  HND: { city: 'Tokyo', country: 'JP', name: 'Haneda' },
  KIX: { city: 'Osaka', country: 'JP', name: 'Kansai Intl' },
  SYD: { city: 'Sydney', country: 'AU', name: 'Kingsford Smith' },
  MEL: { city: 'Melbourne', country: 'AU', name: 'Tullamarine' },
  BNE: { city: 'Brisbane', country: 'AU', name: 'Brisbane Airport' },
  AKL: { city: 'Auckland', country: 'NZ', name: 'Auckland Airport' },
  DEL: { city: 'New Delhi', country: 'IN', name: 'Indira Gandhi Intl' },
  BOM: { city: 'Mumbai', country: 'IN', name: 'Chhatrapati Shivaji Maharaj Intl' },
  // Latin America
  GRU: { city: 'São Paulo', country: 'BR', name: 'Guarulhos Intl' },
  EZE: { city: 'Buenos Aires', country: 'AR', name: 'Ministro Pistarini Intl' },
  BOG: { city: 'Bogotá', country: 'CO', name: 'El Dorado Intl' },
  LIM: { city: 'Lima', country: 'PE', name: 'Jorge Chávez Intl' },
  SCL: { city: 'Santiago', country: 'CL', name: 'Arturo Merino Benítez Intl' },
};

export function getAirportDisplay(iata: string): string {
  const code = iata.toUpperCase();
  const a = AIRPORTS[code];
  return a ? `${a.name} (${code}) — ${a.city}, ${a.country}` : code;
}

export function getAirportCity(iata: string): string {
  const a = AIRPORTS[iata.toUpperCase()];
  return a ? `${a.city} (${iata})` : iata;
}

export function isValidIATA(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export function normalizeIATA(code: string): string {
  return code.trim().toUpperCase();
}
