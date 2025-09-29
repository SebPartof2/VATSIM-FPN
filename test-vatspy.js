import { getAirportByIcao } from './utils/vatspy-parser';

// Test the VATSpy parser
async function testVatspyParser() {
  console.log('Testing VATSpy parser...');
  
  const testAirports = ['KJFK', 'KLAX', 'EGLL', 'LFPG', 'EDDF'];
  
  for (const icao of testAirports) {
    try {
      const airport = await getAirportByIcao(icao);
      console.log(`${icao}:`, airport ? `${airport.name} (${airport.icao})` : 'Not found');
    } catch (error) {
      console.error(`Error fetching ${icao}:`, error);
    }
  }
}

testVatspyParser();