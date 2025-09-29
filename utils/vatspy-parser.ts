export interface VatspyAirport {
  icao: string;
  name: string;
  latitude: number;
  longitude: number;
  iata?: string;
  fir: string;
  isPseudo: boolean;
}

let cachedAirports: Map<string, VatspyAirport> | null = null;

export async function parseVatspyData(): Promise<Map<string, VatspyAirport>> {
  if (cachedAirports) {
    return cachedAirports;
  }

  const airports = new Map<string, VatspyAirport>();
  
  try {
    // Fetch the VATSpy.dat file from the public folder
    const response = await fetch('/vatspy-data/VATSpy.dat');
    const fileContent = await response.text();
    const lines = fileContent.split('\n');
    
    let inAirportsSection = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith(';')) {
        continue;
      }
      
      // Check for section headers
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        inAirportsSection = trimmedLine === '[Airports]';
        continue;
      }
      
      // Only process lines when we're in the Airports section
      if (!inAirportsSection) {
        continue;
      }
      
      // Parse airport line: ICAO|Name|Lat|Lon|IATA|FIR|IsPseudo
      const parts = trimmedLine.split('|');
      if (parts.length >= 7) {
        const icao = parts[0].trim();
        const name = parts[1].trim();
        const latitude = parseFloat(parts[2]);
        const longitude = parseFloat(parts[3]);
        const iata = parts[4].trim() || undefined;
        const fir = parts[5].trim();
        const isPseudo = parts[6].trim() === '1';
        
        // Only include real airports (not pseudo), and prioritize the first occurrence
        if (!isPseudo && !airports.has(icao) && icao && name) {
          airports.set(icao, {
            icao,
            name,
            latitude,
            longitude,
            iata,
            fir,
            isPseudo: false
          });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing VATSpy data:', error);
  }
  
  cachedAirports = airports;
  return airports;
}

export async function getAirportByIcao(icao: string): Promise<VatspyAirport | null> {
  const airports = await parseVatspyData();
  return airports.get(icao.toUpperCase()) || null;
}

export async function searchAirportsByName(searchTerm: string, limit = 10): Promise<VatspyAirport[]> {
  const airports = await parseVatspyData();
  const results: VatspyAirport[] = [];
  const searchLower = searchTerm.toLowerCase();
  
  // Convert Map values to array to avoid iterator issues
  const airportArray = Array.from(airports.values());
  
  for (const airport of airportArray) {
    if (airport.name.toLowerCase().includes(searchLower)) {
      results.push(airport);
      if (results.length >= limit) {
        break;
      }
    }
  }
  
  return results;
}