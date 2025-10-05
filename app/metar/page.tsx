'use client';

import { useState } from 'react';
import { MetarData, VatsimAirport } from '../../types/vatsim';
import { parseMetar } from 'metar-taf-parser';
import { getAirportByIcao } from '../../utils/vatspy-parser';

export default function MetarLookup() {
  const [icao, setIcao] = useState('');
  const [metarData, setMetarData] = useState<MetarData | null>(null);
  const [airportInfo, setAirportInfo] = useState<VatsimAirport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDecodedMetar, setShowDecodedMetar] = useState(false);

  const fetchMetarData = async (icaoCode: string): Promise<MetarData | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`https://metar.vatsim.net/${icaoCode}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
        },
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const metarText = await response.text();
        const metar: MetarData = {
          icao: icaoCode,
          metar: metarText.trim(),
          time: new Date().toISOString()
        };
        return metar;
      } else {
        console.log(`METAR API returned status ${response.status} for ${icaoCode}`);
        return null;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`METAR fetch timeout for ${icaoCode}`);
      } else {
        console.log(`Could not fetch METAR for ${icaoCode}:`, error);
      }
      return null;
    }
  };

  const fetchAirportInfo = async (icaoCode: string): Promise<VatsimAirport | null> => {
    try {
      const vatspyAirport = await getAirportByIcao(icaoCode);
      if (vatspyAirport) {
        const airport: VatsimAirport = {
          icao: vatspyAirport.icao,
          name: vatspyAirport.name,
          city: undefined,
          country: undefined
        };
        return airport;
      } else {
        // Fallback: create a basic airport entry with just the ICAO code
        const fallbackAirport: VatsimAirport = {
          icao: icaoCode,
          name: icaoCode,
          city: undefined,
          country: undefined
        };
        return fallbackAirport;
      }
    } catch (error) {
      console.log(`Could not fetch airport info from VATSpy for ${icaoCode}:`, error);
      return null;
    }
  };

  const formatAirportDisplay = (icaoCode: string): string => {
    if (airportInfo && airportInfo.name && airportInfo.name !== icaoCode) {
      return `${icaoCode} - ${airportInfo.name}`;
    }
    return icaoCode;
  };

  const formatDecodedMetar = (metarString: string) => {
    try {
      const decoded = parseMetar(metarString);
      return {
        wind: decoded.wind ? `${decoded.wind.direction}° at ${decoded.wind.speed} ${decoded.wind.unit}${decoded.wind.gust ? ` gusting to ${decoded.wind.gust} ${decoded.wind.unit}` : ''}` : 'Calm',
        visibility: decoded.visibility ? `${decoded.visibility.value} ${decoded.visibility.unit}` : 'Unknown',
        clouds: decoded.clouds?.length > 0 ? decoded.clouds.map(cloud => `${cloud.quantity} at ${cloud.height} ft`).join(', ') : 'Clear',
        temperature: decoded.temperature ? `${decoded.temperature}°C (${Math.round(decoded.temperature * 9/5 + 32)}°F)` : 'Unknown',
        dewpoint: decoded.dewPoint ? `${decoded.dewPoint}°C (${Math.round(decoded.dewPoint * 9/5 + 32)}°F)` : 'Unknown',
        altimeter: decoded.altimeter ? `${decoded.altimeter.value} ${decoded.altimeter.unit}` : 'Unknown',
        weather: decoded.weatherConditions?.length > 0 ? decoded.weatherConditions.map(wx => `${wx.descriptive || ''} ${wx.phenomenons?.join(' ') || ''}`.trim()).join(', ') : 'No significant weather',
        flightCategory: getFlightCategory(decoded)
      };
    } catch (error) {
      console.error('Error parsing METAR:', error);
      return null;
    }
  };

  const getFlightCategory = (decoded: any) => {
    const visibility = decoded.visibility?.value || 10;
    const ceiling = decoded.clouds?.find((c: any) => c.quantity === 'BKN' || c.quantity === 'OVC')?.height || 10000;
    
    if (visibility < 1 || ceiling < 500) return { category: 'LIFR', color: 'text-purple-700', bg: 'bg-purple-100 border-purple-200' };
    if (visibility < 3 || ceiling < 1000) return { category: 'IFR', color: 'text-red-700', bg: 'bg-red-100 border-red-200' };
    if (visibility < 5 || ceiling < 3000) return { category: 'MVFR', color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-200' };
    return { category: 'VFR', color: 'text-green-700', bg: 'bg-green-100 border-green-200' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!icao.trim()) {
      setError('Please enter an ICAO airport code');
      return;
    }

    const icaoCode = icao.trim().toUpperCase();
    
    if (icaoCode.length !== 4) {
      setError('ICAO codes must be exactly 4 characters');
      return;
    }

    setLoading(true);
    setError('');
    setMetarData(null);
    setAirportInfo(null);

    try {
      // Fetch both METAR data and airport info in parallel
      const [metar, airport] = await Promise.all([
        fetchMetarData(icaoCode),
        fetchAirportInfo(icaoCode)
      ]);

      if (metar && metar.metar) {
        setMetarData(metar);
        setAirportInfo(airport);
      } else {
        setError(`No METAR data available for ${icaoCode}. Please check the ICAO code and try again.`);
      }
    } catch (err) {
      setError('An error occurred while fetching METAR data. Please try again.');
      console.error('METAR lookup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshMetarData = async () => {
    if (!icao.trim()) return;
    
    const icaoCode = icao.trim().toUpperCase();
    setLoading(true);
    
    try {
      const metar = await fetchMetarData(icaoCode);
      if (metar && metar.metar) {
        setMetarData(metar);
      } else {
        setError(`Could not refresh METAR data for ${icaoCode}`);
      }
    } catch (err) {
      setError('An error occurred while refreshing METAR data');
      console.error('METAR refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-4xl">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
          METAR Weather Lookup
        </h1>
        <p className="text-gray-600 text-sm sm:text-base">
          Enter an ICAO airport code to get current weather conditions (METAR)
        </p>
      </div>

      {/* Search Form */}
      <div className="mb-8">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 sm:gap-4 max-w-lg mx-auto">
          <div className="flex-1">
            <input
              type="text"
              value={icao}
              onChange={(e) => setIcao(e.target.value.toUpperCase())}
              placeholder="Enter ICAO code (e.g., KJFK)"
              className="w-full px-4 py-3 border border-gray-300 rounded-md text-center font-mono text-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={4}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            {loading ? 'Loading...' : 'Get METAR'}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-300 text-red-700 rounded-md text-center">
            {error}
          </div>
        )}
      </div>

      {/* METAR Results */}
      {metarData && (
        <div className="space-y-6">
          {/* Header with controls */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900">
              Weather Information - {formatAirportDisplay(metarData.icao)}
            </h2>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={refreshMetarData}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                🔄 Refresh
              </button>
              <button
                onClick={() => setShowDecodedMetar(!showDecodedMetar)}
                className={`px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${
                  showDecodedMetar 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {showDecodedMetar ? 'Show Raw METAR' : 'Show Decoded METAR'}
              </button>
            </div>
          </div>

          {/* METAR Display */}
          <div className="bg-gray-50 p-6 rounded-lg border">
            {showDecodedMetar ? (
              (() => {
                const decoded = formatDecodedMetar(metarData.metar);
                return decoded ? (
                  <div className="space-y-4">
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${decoded.flightCategory.color} ${decoded.flightCategory.bg}`}>
                      {decoded.flightCategory.category}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between"><span className="font-semibold text-gray-700">Wind:</span> <span className="text-gray-900">{decoded.wind}</span></div>
                      <div className="flex justify-between"><span className="font-semibold text-gray-700">Visibility:</span> <span className="text-gray-900">{decoded.visibility}</span></div>
                      <div className="flex justify-between"><span className="font-semibold text-gray-700">Clouds:</span> <span className="text-gray-900">{decoded.clouds}</span></div>
                      <div className="flex justify-between"><span className="font-semibold text-gray-700">Temperature:</span> <span className="text-gray-900">{decoded.temperature}</span></div>
                      <div className="flex justify-between"><span className="font-semibold text-gray-700">Dewpoint:</span> <span className="text-gray-900">{decoded.dewpoint}</span></div>
                      <div className="flex justify-between"><span className="font-semibold text-gray-700">Altimeter:</span> <span className="text-gray-900">{decoded.altimeter}</span></div>
                      {decoded.weather !== 'No significant weather' && (
                        <div className="flex justify-between"><span className="font-semibold text-gray-700">Weather:</span> <span className="text-gray-900">{decoded.weather}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-sm text-gray-800 leading-relaxed">
                    {metarData.metar}
                  </div>
                );
              })()
            ) : (
              <div className="font-mono text-sm text-gray-800 leading-relaxed">
                {metarData.metar}
              </div>
            )}
            <div className="text-xs text-gray-500 mt-4 pt-3 border-t">
              Updated: {new Date(metarData.time).toLocaleString()}
            </div>
          </div>

          {/* Information Panel */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">About METAR</h3>
            <p className="text-blue-800 text-sm leading-relaxed">
              METAR (Meteorological Aerodrome Report) is a format for reporting weather information used by aviation. 
              It provides current weather conditions including wind, visibility, clouds, temperature, dewpoint, and atmospheric pressure. 
              The data is sourced from the VATSIM weather network and updated regularly.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 text-center">
        <a
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-700 transition-colors"
        >
          ← Back to Flight Lookup
        </a>
      </div>
    </div>
  );
}