'use client';

import { useState } from 'react';
import { VatsimPilot, VatsimAirport } from '../types/vatsim';

export default function Home() {
  const [callsign, setCallsign] = useState('');
  const [pilot, setPilot] = useState<VatsimPilot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [airports, setAirports] = useState<Record<string, VatsimAirport>>({});

  const fetchAirportInfo = async (icao: string): Promise<VatsimAirport | null> => {
    if (airports[icao]) {
      return airports[icao];
    }

    try {
      const response = await fetch(`https://my.vatsim.net/api/v2/aip/airports/${icao}`);
      if (response.ok) {
        const result = await response.json();
        const airportData = result.data; // The actual airport data is nested under 'data'
        console.log(`Fetched airport data for ${icao}:`, airportData); // Debug log
        const airport: VatsimAirport = {
          icao: icao,
          name: airportData.name || icao,
          city: airportData.city,
          country: airportData.country
        };
        setAirports(prev => ({ ...prev, [icao]: airport }));
        return airport;
      } else {
        console.log(`Airport API returned status ${response.status} for ${icao}`);
      }
    } catch (error) {
      console.log(`Could not fetch airport info for ${icao}:`, error);
    }
    
    return null;
  };

  const formatAirportDisplay = (icao: string): string => {
    const airport = airports[icao];
    if (airport && airport.name && airport.name !== icao) {
      return `${icao} - ${airport.name}`;
    }
    return icao;
  };

  const searchFlight = async () => {
    if (!callsign.trim()) {
      setError('Please enter a callsign');
      return;
    }

    setLoading(true);
    setError('');
    setPilot(null);

    try {
      // For static export, we need to fetch directly from VATSIM API
      const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json', {
        headers: {
          'User-Agent': 'VATSIM-FPN-Lookup-App/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      const foundPilot = data.pilots.find((p: VatsimPilot) => 
        p.callsign.toUpperCase() === callsign.toUpperCase()
      );

      if (foundPilot) {
        setPilot(foundPilot);
        
        // Fetch airport information for departure and arrival
        if (foundPilot.flight_plan) {
          if (foundPilot.flight_plan.departure) {
            fetchAirportInfo(foundPilot.flight_plan.departure);
          }
          if (foundPilot.flight_plan.arrival) {
            fetchAirportInfo(foundPilot.flight_plan.arrival);
          }
        }
      } else {
        setError('Flight not found. Make sure the callsign is correct and the pilot is currently online on VATSIM.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error fetching flight data: ${errorMessage}. Please try again.`);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchFlight();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          VATSIM Flight Plan Lookup
        </h1>
        <p className="text-gray-600">
          Enter a callsign to lookup current VATSIM flight information
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
          <div className="flex-1">
            <label htmlFor="callsign" className="block text-sm font-medium text-gray-700 mb-2">
              Callsign
            </label>
            <input
              type="text"
              id="callsign"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="Enter callsign (e.g. AAL123, UAL456)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase text-gray-900 bg-white"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error
              </h3>
              <div className="mt-2 text-sm text-red-700">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {pilot && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Flight Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Pilot Details</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-gray-700">Callsign:</span>
                    <span className="ml-2 text-gray-900">{pilot.callsign}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Pilot Name:</span>
                    <span className="ml-2 text-gray-900">{pilot.name}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Transponder:</span>
                    <span className="ml-2 text-gray-900">
                      {pilot.transponder}
                      {pilot.flight_plan?.assigned_transponder && 
                       pilot.flight_plan.assigned_transponder !== pilot.transponder && (
                        <span className="ml-2 text-orange-600">
                          (Assigned: {pilot.flight_plan.assigned_transponder})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Current Position</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-gray-700">Altitude:</span>
                    <span className="ml-2 text-gray-900">{pilot.altitude} ft</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Ground Speed:</span>
                    <span className="ml-2 text-gray-900">{pilot.groundspeed} kts</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Heading:</span>
                    <span className="ml-2 text-gray-900">{pilot.heading}°</span>
                  </div>
                </div>
              </div>
            </div>

            {pilot.flight_plan && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Flight Plan</h3>
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-gray-700">Aircraft:</span>
                    <span className="ml-2 text-gray-900">
                      {pilot.flight_plan.aircraft_short || pilot.flight_plan.aircraft}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Departure:</span>
                    <span className="ml-2 text-gray-900">{formatAirportDisplay(pilot.flight_plan.departure)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Arrival:</span>
                    <span className="ml-2 text-gray-900">{formatAirportDisplay(pilot.flight_plan.arrival)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Departure Time:</span>
                    <span className="ml-2 text-gray-900">{pilot.flight_plan.deptime}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Cruise Altitude:</span>
                    <span className="ml-2 text-gray-900">{pilot.flight_plan.altitude}</span>
                  </div>
                  {pilot.flight_plan.route && (
                    <div>
                      <span className="font-medium text-gray-700">Route:</span>
                      <div className="ml-2 text-gray-900 text-sm bg-gray-50 p-2 rounded mt-1">
                        {pilot.flight_plan.route}
                      </div>
                    </div>
                  )}
                  {pilot.flight_plan.remarks && (
                    <div>
                      <span className="font-medium text-gray-700">Remarks:</span>
                      <div className="ml-2 text-gray-900 text-sm bg-gray-50 p-2 rounded mt-1">
                        {pilot.flight_plan.remarks}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              <span>Last Updated: </span>
              <span>{new Date(pilot.last_updated).toLocaleString()}</span>
              <span className="ml-4">Online Since: </span>
              <span>{new Date(pilot.logon_time).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Data provided by VATSIM. Updates every 15 seconds.</p>
        <p className="mt-1">Only shows pilots currently online on the VATSIM network.</p>
      </div>
    </div>
  );
}