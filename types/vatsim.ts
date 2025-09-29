export interface VatsimPilot {
  cid: number;
  name: string;
  callsign: string;
  server: string;
  pilot_rating: number;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  transponder: string;
  heading: number;
  qnh_i_hg: number;
  qnh_mb: number;
  flight_plan?: {
    flight_rules: string;
    aircraft: string;
    aircraft_faa: string;
    aircraft_short: string;
    departure: string;
    arrival: string;
    alternate: string;
    cruise_tas: string;
    altitude: string;
    deptime: string;
    enroute_time: string;
    fuel_time: string;
    remarks: string;
    route: string;
    revision_id: number;
    assigned_transponder: string;
  };
  logon_time: string;
  last_updated: string;
}

export interface VatsimData {
  general: {
    version: number;
    reload: number;
    update: string;
    update_timestamp: string;
    connected_clients: number;
    unique_users: number;
  };
  pilots: VatsimPilot[];
  controllers: any[];
  atis: any[];
  servers: any[];
  prefiles: any[];
  facilities: any[];
  ratings: any[];
  pilot_ratings: any[];
}

export interface VatsimAirport {
  icao: string;
  name: string;
  city?: string;
  country?: string;
}

export interface MetarData {
  icao: string;
  metar: string;
  time: string;
}