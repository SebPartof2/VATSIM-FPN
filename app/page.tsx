'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { VatsimPilot, VatsimAirport, MetarData, VatsimATIS, AtisData } from '../types/vatsim';
import { parseMetar } from 'metar-taf-parser';
import { getAirportByIcao } from '../utils/vatspy-parser';

// Dynamic import for map component (Leaflet doesn't work with SSR)
const FlightMap = dynamic(() => import('../components/FlightMap'), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">Loading map...</div>
});

export default function Home() {
  const [callsign, setCallsign] = useState('');
  const [pilot, setPilot] = useState<VatsimPilot | null>(null);
  const [activeFrequency, setActiveFrequency] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [airports, setAirports] = useState<Record<string, VatsimAirport>>({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [dataChanges, setDataChanges] = useState<{[key: string]: boolean}>({});
  const [metarData, setMetarData] = useState<Record<string, MetarData>>({});
  const [showDecodedMetar, setShowDecodedMetar] = useState(false);
  const [atisData, setAtisData] = useState<Record<string, AtisData>>({});
  const [etaData, setEtaData] = useState<{ duration: string; etaUTC: string; etaLocal: string; distance: number } | null>(null);
  const [currentFIR, setCurrentFIR] = useState<{ id: string; name: string; isOceanic: boolean } | null>(null);
  const [trackingCID, setTrackingCID] = useState<string>('');
  const [showCIDInput, setShowCIDInput] = useState<boolean>(false);

  const fetchAirportInfo = async (icao: string): Promise<VatsimAirport | null> => {
    if (airports[icao]) {
      return airports[icao];
    }

    try {
      const vatspyAirport = await getAirportByIcao(icao);
      if (vatspyAirport) {
        console.log(`Found airport data in VATSpy for ${icao}:`, vatspyAirport); // Debug log
        const airport: VatsimAirport = {
          icao: vatspyAirport.icao,
          name: vatspyAirport.name,
          city: undefined, // VATSpy doesn't have city data separate from name
          country: undefined // VATSpy doesn't have country data in airport section
        };
        setAirports(prev => ({ ...prev, [icao]: airport }));
        return airport;
      } else {
        console.log(`Airport ${icao} not found in VATSpy data`);
        // Fallback: create a basic airport entry with just the ICAO code
        const fallbackAirport: VatsimAirport = {
          icao: icao,
          name: icao, // Use ICAO as name when not found
          city: undefined,
          country: undefined
        };
        setAirports(prev => ({ ...prev, [icao]: fallbackAirport }));
        return fallbackAirport;
      }
    } catch (error) {
      console.log(`Could not fetch airport info from VATSpy for ${icao}:`, error);
    }
    
    return null;
  };

  const fetchMetarData = async (icao: string): Promise<MetarData | null> => {
    if (metarData[icao]) {
      return metarData[icao];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`https://metar.vatsim.net/${icao}`, {
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
          icao: icao,
          metar: metarText.trim(),
          time: new Date().toISOString()
        };
        setMetarData(prev => ({ ...prev, [icao]: metar }));
        return metar;
      } else {
        console.log(`METAR API returned status ${response.status} for ${icao}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`METAR fetch timeout for ${icao}`);
      } else {
        console.log(`Could not fetch METAR for ${icao}:`, error);
      }
    }
    
    return null;
  };

  const fetchAtisData = async (icao: string): Promise<AtisData | null> => {
    if (atisData[icao]) {
      return atisData[icao];
    }

    try {
      const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
      if (response.ok) {
        const data = await response.json();
        const controllers = data.atis || [];
        
        // Look for ATIS stations matching the ICAO code
        // Common patterns: ICAO_ATIS, ICAO_A_ATIS, ICAO_D_ATIS
        const atisStations = controllers.filter((controller: VatsimATIS) => {
          const callsign = controller.callsign.toUpperCase();
          const icaoUpper = icao.toUpperCase();
          return callsign.includes(`${icaoUpper}_ATIS`) || 
                 callsign.includes(`${icaoUpper}_A_ATIS`) || 
                 callsign.includes(`${icaoUpper}_D_ATIS`);
        });

        let atisInfo: AtisData;
        
        if (atisStations.length > 0) {
          const station = atisStations[0]; // Use the first matching station
          atisInfo = {
            icao: icao.toUpperCase(),
            atis: station.text_atis ? station.text_atis.join(' ') : 'ATIS available but no text provided',
            callsign: station.callsign,
            frequency: station.frequency,
            time: new Date().toISOString()
          };
        } else {
          atisInfo = {
            icao: icao.toUpperCase(),
            atis: 'ATIS Station offline',
            time: new Date().toISOString()
          };
        }
        
        setAtisData(prev => ({ ...prev, [icao]: atisInfo }));
        return atisInfo;
      }
    } catch (error) {
      console.log(`Could not fetch ATIS for ${icao}:`, error);
    }
    
    return {
      icao: icao.toUpperCase(),
      atis: 'ATIS Station offline',
      time: new Date().toISOString()
    };
  };

  const formatAirportDisplay = (icao: string): string => {
    const airport = airports[icao];
    if (airport && airport.name && airport.name !== icao) {
      return `${icao} - ${airport.name}`;
    }
    return icao;
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

  // ETA Calculation Functions
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3440.065; // Earth's radius in nautical miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in nautical miles
  };

  const calculateETA = async (pilot: VatsimPilot): Promise<{ duration: string; etaUTC: string; etaLocal: string; distance: number } | null> => {
    if (!pilot.flight_plan?.arrival || pilot.groundspeed <= 0) return null;

    try {
      // Get arrival airport coordinates
      const arrivalAirport = await getAirportByIcao(pilot.flight_plan.arrival);
      if (!arrivalAirport || !arrivalAirport.latitude || !arrivalAirport.longitude) return null;

      // Calculate distance to destination
      const distance = calculateDistance(
        pilot.latitude,
        pilot.longitude,
        arrivalAirport.latitude,
        arrivalAirport.longitude
      );

      // Calculate time in hours
      const timeHours = distance / pilot.groundspeed;
      
      // Convert to hours and minutes for duration display
      const hours = Math.floor(timeHours);
      const minutes = Math.round((timeHours - hours) * 60);

      // Format duration string
      let durationString = '';
      if (hours > 0) {
        durationString = `${hours}h ${minutes}m`;
      } else {
        durationString = `${minutes}m`;
      }

      // Calculate actual arrival times
      const now = new Date();
      const arrivalTime = new Date(now.getTime() + (timeHours * 60 * 60 * 1000));

      // Format UTC time
      const etaUTC = arrivalTime.toUTCString().slice(17, 22) + 'Z'; // e.g., "15:45Z"
      
      // Format local time with timezone
      const etaLocal = arrivalTime.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      });

      return { 
        duration: durationString, 
        etaUTC, 
        etaLocal, 
        distance: Math.round(distance) 
      };
    } catch (error) {
      console.error('Error calculating ETA:', error);
      return null;
    }
  };

  const formatETADisplay = (duration: string, distance: number): string => {
    return `${duration} (${distance} nm)`;
  };

  const refreshMetarData = async () => {
    if (!pilot?.flight_plan) return;
    
    const airports = [pilot.flight_plan.departure, pilot.flight_plan.arrival].filter(Boolean);
    
    for (const icao of airports) {
      try {
        // Refresh METAR
        const metarResponse = await fetch(`https://metar.vatsim.net/${icao}`);
        if (metarResponse.ok) {
          const metarData = await metarResponse.text();
          if (metarData && metarData.trim()) {
            setMetarData(prev => ({
              ...prev,
              [icao]: {
                icao: icao,
                metar: metarData.trim(),
                time: new Date().toISOString()
              }
            }));
          }
        }
        
        // Refresh ATIS
        await fetchAtisData(icao);
        
      } catch (error) {
        console.error(`Error fetching weather data for ${icao}:`, error);
      }
    }
  };

  const refreshPilotData = async (currentCallsign: string) => {
    if (!currentCallsign) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for refresh
      
      const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        
        if (!data || !data.pilots) {
          console.error('Invalid refresh data received');
          return;
        }
        
        const foundPilot = data.pilots.find((p: VatsimPilot) => 
          p.callsign.toUpperCase() === currentCallsign.toUpperCase()
        );

        if (foundPilot) {
          // Detect changes in key flight data
          const changes: {[key: string]: boolean} = {};
          if (pilot) {
            changes.altitude = pilot.altitude !== foundPilot.altitude;
            changes.groundspeed = pilot.groundspeed !== foundPilot.groundspeed;
            changes.heading = pilot.heading !== foundPilot.heading;
            changes.transponder = pilot.transponder !== foundPilot.transponder;
          }
          
          console.log(`Data refresh for ${currentCallsign}:`, {
            altitude: `${pilot?.altitude} → ${foundPilot.altitude}`,
            groundspeed: `${pilot?.groundspeed} → ${foundPilot.groundspeed}`,
            heading: `${pilot?.heading} → ${foundPilot.heading}`,
            changes
          });
          
          setPilot(foundPilot);
          setDataChanges(changes);
          setLastUpdated(new Date());
          
          // Update FIR if position changed
          if (changes.altitude || changes.groundspeed || changes.heading) {
            const fir = await detectCurrentFIR(foundPilot);
            setCurrentFIR(fir);
          }
          
          // Update frequency periodically
          const frequency = await fetchActiveFrequency(foundPilot.callsign);
          setActiveFrequency(frequency);
          
          // Clear change indicators after 2 seconds
          setTimeout(() => {
            setDataChanges({});
          }, 2000);
        } else {
          // Pilot went offline
          setAutoRefresh(false);
          setError('Pilot is no longer online on VATSIM.');
        }
      }
    } catch (err) {
      console.error('Error refreshing pilot data:', err);
    }
  };

  const searchFlight = async () => {
    if (!callsign.trim()) {
      setError('Please enter a callsign');
      return;
    }

    // Check network connectivity (mobile-specific)
    if (!navigator.onLine) {
      setError('No internet connection detected. Please check your network and try again.');
      return;
    }

    setLoading(true);
    setError('');
    setPilot(null);

    try {
      // For static export, we need to fetch directly from VATSIM API
      // Mobile debugging and simplified fetch
      console.log('Mobile Debug: Starting fetch request...');
      console.log('Mobile Debug: User Agent:', navigator.userAgent);
      console.log('Mobile Debug: Online status:', navigator.onLine);
      
      const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json', {
        method: 'GET',
        cache: 'no-cache'
      });
      
      console.log('Mobile Debug: Response status:', response.status);
      console.log('Mobile Debug: Response ok:', response.ok);
      
      if (!response.ok) {
        throw new Error(`Network error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.pilots) {
        throw new Error('Invalid data received from VATSIM API');
      }
      
      const foundPilot = data.pilots.find((p: VatsimPilot) => 
        p.callsign.toUpperCase() === callsign.toUpperCase()
      );

      if (foundPilot) {
        setPilot(foundPilot);
        setLastUpdated(new Date());
        setAutoRefresh(true);
        
        // Detect current FIR
        const fir = await detectCurrentFIR(foundPilot);
        setCurrentFIR(fir);
        
        // Fetch active frequency
        const frequency = await fetchActiveFrequency(foundPilot.callsign);
        setActiveFrequency(frequency);
        
        // Fetch airport information for departure and arrival
        if (foundPilot.flight_plan) {
          if (foundPilot.flight_plan.departure) {
            fetchAirportInfo(foundPilot.flight_plan.departure);
            fetchMetarData(foundPilot.flight_plan.departure);
            fetchAtisData(foundPilot.flight_plan.departure);
          }
          if (foundPilot.flight_plan.arrival) {
            fetchAirportInfo(foundPilot.flight_plan.arrival);
            fetchMetarData(foundPilot.flight_plan.arrival);
            fetchAtisData(foundPilot.flight_plan.arrival);
          }
        }
      } else {
        setError('Flight not found. Make sure the callsign is correct and the pilot is currently online on VATSIM.');
      }
    } catch (err) {
      console.log('Mobile Debug: Catch block triggered');
      console.log('Mobile Debug: Error type:', typeof err);
      console.log('Mobile Debug: Error name:', err instanceof Error ? err.name : 'Not an Error object');
      console.log('Mobile Debug: Error message:', err instanceof Error ? err.message : String(err));
      console.log('Mobile Debug: Full error object:', err);
      
      let errorMessage = 'Unknown error occurred';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Request timeout - Please check your internet connection and try again';
        } else if (err.message.includes('CORS')) {
          errorMessage = 'Network access issue - Please try refreshing the page';
        } else if (err.message.includes('Network')) {
          errorMessage = 'Network error - Please check your internet connection';
        } else if (err.message.includes('JSON')) {
          errorMessage = 'Data parsing error - The server response was invalid';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(`Error fetching flight data: ${errorMessage}`);
      console.error('Mobile debug - Error details:', {
        error: err,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const searchFlightByCID = async (cid: string) => {
    if (!cid.trim()) {
      setError('Please enter a CID');
      return;
    }

    // Check network connectivity
    if (!navigator.onLine) {
      setError('No internet connection detected. Please check your network and try again.');
      return;
    }

    setLoading(true);
    setError('');
    setPilot(null);

    try {
      const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json', {
        method: 'GET',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`Network error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.pilots) {
        throw new Error('Invalid data received from VATSIM API');
      }
      
      const foundPilot = data.pilots.find((p: VatsimPilot) => 
        p.cid.toString() === cid.toString()
      );

      if (foundPilot) {
        setPilot(foundPilot);
        setCallsign(foundPilot.callsign); // Update callsign field with found pilot's callsign
        setLastUpdated(new Date());
        setAutoRefresh(true);
        
        // Detect current FIR
        const fir = await detectCurrentFIR(foundPilot);
        setCurrentFIR(fir);
        
        // Fetch active frequency
        const frequency = await fetchActiveFrequency(foundPilot.callsign);
        setActiveFrequency(frequency);
        
        // Fetch airport information for departure and arrival
        if (foundPilot.flight_plan) {
          if (foundPilot.flight_plan.departure) {
            fetchAirportInfo(foundPilot.flight_plan.departure);
            fetchMetarData(foundPilot.flight_plan.departure);
            fetchAtisData(foundPilot.flight_plan.departure);
          }
          if (foundPilot.flight_plan.arrival) {
            fetchAirportInfo(foundPilot.flight_plan.arrival);
            fetchMetarData(foundPilot.flight_plan.arrival);
            fetchAtisData(foundPilot.flight_plan.arrival);
          }
        }
      } else {
        setError(`No pilot found with CID ${cid}. Make sure the CID is correct and the pilot is currently online on VATSIM.`);
      }
    } catch (err) {
      console.error('CID search error:', err);
      let errorMessage = 'Unknown error occurred';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Request timeout - Please check your internet connection and try again';
        } else if (err.message.includes('CORS')) {
          errorMessage = 'Network access issue - Please try refreshing the page';
        } else if (err.message.includes('Network')) {
          errorMessage = 'Network error - Please check your internet connection';
        } else if (err.message.includes('JSON')) {
          errorMessage = 'Data parsing error - The server response was invalid';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(`Error fetching flight data: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Point-in-polygon algorithm to check if a point is inside a polygon
  const isPointInPolygon = (point: [number, number], polygon: number[][][]): boolean => {
    const [lng, lat] = point;
    
    // Check all rings in the polygon (first ring is exterior, others are holes)
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
      const ring = polygon[ringIndex];
      let inside = false;
      
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      
      // For exterior ring (index 0), we want to be inside
      // For hole rings (index > 0), we want to be outside
      if (ringIndex === 0 && !inside) {
        return false; // Not in exterior ring
      }
      if (ringIndex > 0 && inside) {
        return false; // Inside a hole
      }
    }
    
    return true;
  };

  // Check if point is in MultiPolygon
  const isPointInMultiPolygon = (point: [number, number], multiPolygon: number[][][][]): boolean => {
    return multiPolygon.some(polygon => isPointInPolygon(point, polygon));
  };

  // Fetch active frequency for the pilot
  const fetchActiveFrequency = async (callsign: string): Promise<string | null> => {
    try {
      const response = await fetch('https://data.vatsim.net/v3/transceivers-data.json');
      if (!response.ok) {
        console.warn('Failed to fetch transceivers data:', response.status);
        return null;
      }
      
      const data = await response.json();
      const pilotTransceiver = data.find((entry: any) => 
        entry.callsign.toUpperCase() === callsign.toUpperCase()
      );
      
      if (pilotTransceiver && pilotTransceiver.transceivers && pilotTransceiver.transceivers.length > 0) {
        // Get the first transceiver frequency and format it
        const frequency = pilotTransceiver.transceivers[0].frequency;
        // Convert from Hz to MHz with proper formatting (e.g., 122800000 -> 122.800)
        const formattedFreq = (frequency / 1000000).toFixed(3);
        return formattedFreq;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching active frequency:', error);
      return null;
    }
  };

  // Parse VATSpy.dat to get FIR names
  const parseFIRNames = async (): Promise<Map<string, string>> => {
    try {
      const response = await fetch('/vatspy-data/VATSpy.dat');
      const text = await response.text();
      const lines = text.split('\n');
      
      const firNames = new Map<string, string>();
      let inFIRSection = false;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === '[FIRs]') {
          inFIRSection = true;
          continue;
        }
        
        if (trimmedLine.startsWith('[') && trimmedLine !== '[FIRs]') {
          inFIRSection = false;
          continue;
        }
        
        if (inFIRSection && trimmedLine && !trimmedLine.startsWith(';')) {
          const parts = trimmedLine.split('|');
          if (parts.length >= 2) {
            const firId = parts[0];
            const firName = parts[1];
            
            // Only store the first occurrence (primary name) for each FIR ID
            if (!firNames.has(firId)) {
              firNames.set(firId, firName);
            }
          }
        }
      }
      
      return firNames;
    } catch (error) {
      console.error('Error parsing VATSpy.dat:', error);
      return new Map();
    }
  };

  // Detect which FIR the pilot is currently within
  const detectCurrentFIR = async (pilot: VatsimPilot): Promise<{ id: string; name: string; isOceanic: boolean } | null> => {
    try {
      const [boundariesResponse, firNamesMap] = await Promise.all([
        fetch('/vatspy-data/Boundaries.geojson'),
        parseFIRNames()
      ]);
      
      const data = await boundariesResponse.json();
      const pilotPoint: [number, number] = [pilot.longitude, pilot.latitude];
      
      // Collect all matching FIRs
      const matchingFIRs: { id: string; name: string; isOceanic: boolean }[] = [];
      
      for (const feature of data.features) {
        let isMatch = false;
        
        if (feature.geometry.type === 'MultiPolygon') {
          isMatch = isPointInMultiPolygon(pilotPoint, feature.geometry.coordinates);
        } else if (feature.geometry.type === 'Polygon') {
          isMatch = isPointInPolygon(pilotPoint, feature.geometry.coordinates);
        }
        
        if (isMatch) {
          const firId = feature.properties.id || 'Unknown FIR';
          const firName = firNamesMap.get(firId) || firId;
          
          matchingFIRs.push({
            id: firId,
            name: firName,
            isOceanic: feature.properties.oceanic === '1'
          });
        }
      }
      
      // If no matches found
      if (matchingFIRs.length === 0) {
        return null;
      }
      
      // Prioritize land-based FIRs over oceanic FIRs
      const landBasedFIRs = matchingFIRs.filter(fir => !fir.isOceanic);
      if (landBasedFIRs.length > 0) {
        return landBasedFIRs[0]; // Return the first land-based FIR
      }
      
      // If only oceanic FIRs found, return the first one
      return matchingFIRs[0];
      
    } catch (error) {
      console.error('Error detecting FIR:', error);
      return null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchFlight();
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && pilot) {
      refreshIntervalRef.current = setInterval(() => {
        refreshPilotData(pilot.callsign);
      }, 1000); // Update every second
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, pilot]);

  // Calculate ETA when pilot data changes
  useEffect(() => {
    const updateETA = async () => {
      if (pilot && pilot.flight_plan?.arrival) {
        const eta = await calculateETA(pilot);
        setEtaData(eta);
      } else {
        setEtaData(null);
      }
    };

    updateETA();
  }, [pilot]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // Load saved CID from localStorage on page load (but don't auto-search)
  useEffect(() => {
    const savedCID = localStorage.getItem('trackingCID');
    if (savedCID) {
      setTrackingCID(savedCID);
      // Don't auto-search, just load the CID for tracking
    }
  }, []);

  const handleCIDSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingCID.trim()) {
      // Save CID to localStorage
      localStorage.setItem('trackingCID', trackingCID.trim());
      setShowCIDInput(false); // Close the input form
    }
  };

  const goToTrackedFlight = () => {
    if (trackingCID.trim()) {
      searchFlightByCID(trackingCID.trim());
    }
  };

  const clearTrackingCID = () => {
    setTrackingCID('');
    localStorage.removeItem('trackingCID');
    setShowCIDInput(false);
  };

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-4xl">
      {/* CID Tracking in top right corner */}
      <div className="fixed top-4 right-4 z-50">
        {!showCIDInput && !trackingCID ? (
          <button
            onClick={() => setShowCIDInput(true)}
            className="bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg"
            title="Track a specific CID"
          >
            + Track CID
          </button>
        ) : (
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-[200px]">
            {trackingCID && !showCIDInput ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-600">Tracking CID:</div>
                <div className="font-mono text-sm font-medium text-blue-600">{trackingCID}</div>
                <div className="flex gap-2">
                  <button
                    onClick={goToTrackedFlight}
                    className="flex-1 bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
                    disabled={loading}
                  >
                    �️ Go to Flight
                  </button>
                  <button
                    onClick={() => setShowCIDInput(true)}
                    className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
                    title="Edit CID"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={clearTrackingCID}
                    className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600 transition-colors"
                    title="Stop tracking"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCIDSubmit} className="space-y-2">
                <div className="text-xs text-gray-600">Enter CID to track:</div>
                <input
                  type="text"
                  value={trackingCID}
                  onChange={(e) => setTrackingCID(e.target.value)}
                  placeholder="e.g. 1234567"
                  className="w-full px-2 py-1 text-sm text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={10}
                  pattern="[0-9]*"
                  disabled={loading}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
                    disabled={loading || !trackingCID.trim()}
                  >
                    Save CID
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (trackingCID.trim()) {
                        localStorage.setItem('trackingCID', trackingCID.trim());
                        searchFlightByCID(trackingCID.trim());
                        setShowCIDInput(false);
                      }
                    }}
                    className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 transition-colors"
                    disabled={loading || !trackingCID.trim()}
                  >
                    Save & Go
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCIDInput(false)}
                    className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
          VATSIM Flight Plan Lookup
        </h1>
        <p className="text-gray-600 text-sm sm:text-base">
          Enter a callsign to lookup current VATSIM flight information with live position updates
        </p>
        
        {/* External Services */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mt-6 mb-2">
          <a
            href="https://dispatch.simbrief.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors shadow-sm"
          >
            <img 
              src="https://www.simbrief.com/images/icon_navi_color.png" 
              alt="SimBrief" 
              className="w-4 h-4 mr-2"
            />
            Plan Flight (SimBrief)
          </a>
          <a
            href="https://my.vatsim.net/pilots/flightplan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2 text-white text-sm font-medium rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all shadow-sm"
            style={{ backgroundColor: '#29B473' }}
          >
            <img 
              src="/images/VATSIM_Logo_Official_White_Tagline_1000px.png" 
              alt="VATSIM" 
              className="h-4 mr-2"
            />
            File Flight Plan (VATSIM)
          </a>
          <a
            href="https://nattrak.vatsim.net/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-4 py-2 text-white text-sm font-medium rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all shadow-sm"
            style={{ backgroundColor: '#29B473' }}
          >
            <img 
              src="/images/VATSIM_Logo_Official_White_Tagline_1000px.png" 
              alt="VATSIM" 
              className="h-4 mr-2"
            />
            Oceanic Clearance (VATSIM)
          </a>
        </div>
        
        {/* Internal Tools */}
        <div className="flex justify-center mt-4">
          <a
            href="/metar"
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
          >
            🌤️ METAR Weather Lookup
          </a>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-6">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 sm:items-end">
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
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            
            {pilot && (
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${
                  autoRefresh 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
              </button>
            )}
          </div>
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

      {/* Network Status Indicator (Mobile Debug) */}
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <div className="text-xs text-gray-600 text-center mb-2">
          Network: {navigator.onLine ? '🟢 Online' : '🔴 Offline'} | 
          Browser: {/Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? '📱 Mobile' : '💻 Desktop'}
        </div>
        <button
          onClick={async () => {
            try {
              console.log('API Test: Starting minimal fetch test...');
              const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
              console.log('API Test: Response received:', response.status, response.ok);
              const text = await response.text();
              console.log('API Test: Response length:', text.length);
              console.log('API Test: First 200 chars:', text.substring(0, 200));
              alert(`API Test Success! Status: ${response.status}, Data length: ${text.length}`);
            } catch (error) {
              console.log('API Test: Error occurred:', error);
              alert(`API Test Failed: ${error}`);
            }
          }}
          className="w-full px-3 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
        >
          🔧 Test API Connection
        </button>
      </div>

      {pilot && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Flight Information</h2>
          
          {/* Flight Map */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Flight Map</h3>
            <FlightMap pilot={pilot} airports={airports} />
          </div>
          
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
                    <span className={`ml-2 transition-all duration-500 ${
                      dataChanges.transponder ? 'text-green-600 font-bold bg-green-50 px-2 py-1 rounded' : 'text-gray-900'
                    }`}>
                      {pilot.transponder}
                      {pilot.flight_plan?.assigned_transponder && 
                       pilot.flight_plan.assigned_transponder !== pilot.transponder &&
                       pilot.flight_plan.assigned_transponder !== "0000" && (
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
                    <span className={`ml-2 transition-all duration-500 ${
                      dataChanges.altitude ? 'text-green-600 font-bold bg-green-50 px-2 py-1 rounded' : 'text-gray-900'
                    }`}>
                      {pilot.altitude} ft
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Ground Speed:</span>
                    <span className={`ml-2 transition-all duration-500 ${
                      dataChanges.groundspeed ? 'text-green-600 font-bold bg-green-50 px-2 py-1 rounded' : 'text-gray-900'
                    }`}>
                      {pilot.groundspeed} kts
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Heading:</span>
                    <span className={`ml-2 transition-all duration-500 ${
                      dataChanges.heading ? 'text-green-600 font-bold bg-green-50 px-2 py-1 rounded' : 'text-gray-900'
                    }`}>
                      {pilot.heading}°
                    </span>
                  </div>
                  {currentFIR && (
                    <div>
                      <span className="font-medium text-gray-700">Current FIR:</span>
                      <span className="ml-2 text-gray-900">
                        {currentFIR.name} ({currentFIR.id})
                      </span>
                      {currentFIR.isOceanic && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                          Oceanic
                        </span>
                      )}
                    </div>
                  )}
                  {activeFrequency && (
                    <div>
                      <span className="font-medium text-gray-700">Active Frequency:</span>
                      <div className="mt-3 flex justify-center">
                        <div className="bg-gray-900 text-green-400 px-6 py-4 rounded-xl border-2 border-gray-700 shadow-lg shadow-gray-800/50">
                          <div className="flex items-center justify-center space-x-3">
                            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                            <span className="font-mono text-2xl font-bold tracking-widest">
                              {activeFrequency}
                            </span>
                            <span className="text-green-300 text-lg font-semibold">
                              MHz
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
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
                    <div>
                      <span className="font-medium text-gray-700">Departure:</span>
                      <span className="ml-2 text-gray-900">{formatAirportDisplay(pilot.flight_plan.departure)}</span>
                    </div>
                    <a
                      href={`https://chartfox.org/${pilot.flight_plan.departure}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-2 py-1 bg-gray-600 text-white text-xs font-medium rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors w-fit mt-1"
                    >
                      <img 
                        src="https://chartfox.org/images/ChartFoxLogoLight.svg" 
                        alt="ChartFox" 
                        className="h-3 mr-1"
                      />
                      Charts
                    </a>
                  </div>
                  <div>
                    <div>
                      <span className="font-medium text-gray-700">Arrival:</span>
                      <span className="ml-2 text-gray-900">{formatAirportDisplay(pilot.flight_plan.arrival)}</span>
                    </div>
                    <a
                      href={`https://chartfox.org/${pilot.flight_plan.arrival}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-2 py-1 bg-gray-600 text-white text-xs font-medium rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors w-fit mt-1"
                    >
                      <img 
                        src="https://chartfox.org/images/ChartFoxLogoLight.svg" 
                        alt="ChartFox" 
                        className="h-3 mr-1"
                      />
                      Charts
                    </a>
                  </div>
                  {etaData && (
                    <div>
                      <span className="font-medium text-gray-700">ETA:</span>
                      <span className="ml-2 text-gray-900">
                        {formatETADisplay(etaData.duration, etaData.distance)}
                      </span>
                    </div>
                  )}
                  {etaData && (
                    <div>
                      <span className="font-medium text-gray-700">Arrival Time:</span>
                      <span className="ml-2 text-gray-900">
                        {etaData.etaUTC} / {etaData.etaLocal}
                      </span>
                    </div>
                  )}
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
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500">
                <span>Last Updated: </span>
                <span>{lastUpdated ? lastUpdated.toLocaleString() : new Date(pilot.last_updated).toLocaleString()}</span>
                <span className="ml-4">Online Since: </span>
                <span>{new Date(pilot.logon_time).toLocaleString()}</span>
              </div>
              
              {autoRefresh && (
                <div className="flex items-center text-sm text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                  <span>Live Updates</span>
                  <span className="ml-2 text-gray-500 text-xs">
                    (Alt: {dataChanges.altitude ? '✓' : '-'} | 
                     GS: {dataChanges.groundspeed ? '✓' : '-'} | 
                     HDG: {dataChanges.heading ? '✓' : '-'})
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {pilot && pilot.flight_plan && (
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-4 sm:p-6 mt-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
            <h2 className="text-2xl font-bold text-gray-900">Weather Information (METAR & ATIS)</h2>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={refreshMetarData}
                className="px-4 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                🔄 Refresh Weather
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Departure METAR */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Departure - {formatAirportDisplay(pilot.flight_plan.departure)}
              </h3>
              <div className="bg-gray-50 p-4 rounded-md border">
                {metarData[pilot.flight_plan.departure] ? (
                  <div>
                    {showDecodedMetar ? (
                      (() => {
                        const decoded = formatDecodedMetar(metarData[pilot.flight_plan.departure].metar);
                        return decoded ? (
                          <div className="space-y-3">
                            <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${decoded.flightCategory.color} ${decoded.flightCategory.bg}`}>
                              {decoded.flightCategory.category}
                            </div>
                            <div className="text-sm space-y-2 text-gray-800">
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
                            {metarData[pilot.flight_plan.departure].metar}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="font-mono text-sm text-gray-800 leading-relaxed">
                        {metarData[pilot.flight_plan.departure].metar}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-3">
                      Updated: {new Date(metarData[pilot.flight_plan.departure].time).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic">Loading weather data...</div>
                )}
              </div>
            </div>

            {/* Arrival METAR */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Arrival - {formatAirportDisplay(pilot.flight_plan.arrival)}
              </h3>
              <div className="bg-gray-50 p-4 rounded-md border">
                {metarData[pilot.flight_plan.arrival] ? (
                  <div>
                    {showDecodedMetar ? (
                      (() => {
                        const decoded = formatDecodedMetar(metarData[pilot.flight_plan.arrival].metar);
                        return decoded ? (
                          <div className="space-y-3">
                            <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${decoded.flightCategory.color} ${decoded.flightCategory.bg}`}>
                              {decoded.flightCategory.category}
                            </div>
                            <div className="text-sm space-y-2 text-gray-800">
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
                            {metarData[pilot.flight_plan.arrival].metar}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="font-mono text-sm text-gray-800 leading-relaxed">
                        {metarData[pilot.flight_plan.arrival].metar}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-3">
                      Updated: {new Date(metarData[pilot.flight_plan.arrival].time).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 italic">Loading weather data...</div>
                )}
              </div>
            </div>
          </div>
          
          {/* ATIS Information */}
          <div className="mt-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">ATIS Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Departure ATIS */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">
                  Departure - {formatAirportDisplay(pilot.flight_plan.departure)}
                </h4>
                <div className="bg-gray-50 p-4 rounded-md border">
                  {atisData[pilot.flight_plan.departure] ? (
                    <div>
                      <div className="text-sm text-gray-800 leading-relaxed">
                        {atisData[pilot.flight_plan.departure].atis}
                      </div>
                      {atisData[pilot.flight_plan.departure].callsign && (
                        <div className="text-xs text-gray-600 mt-2">
                          <span className="font-semibold">Station:</span> {atisData[pilot.flight_plan.departure].callsign}
                          {atisData[pilot.flight_plan.departure].frequency && (
                            <span className="ml-3"><span className="font-semibold">Frequency:</span> {atisData[pilot.flight_plan.departure].frequency}</span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        Updated: {new Date(atisData[pilot.flight_plan.departure].time || '').toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">Loading ATIS data...</div>
                  )}
                </div>
              </div>

              {/* Arrival ATIS */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">
                  Arrival - {formatAirportDisplay(pilot.flight_plan.arrival)}
                </h4>
                <div className="bg-gray-50 p-4 rounded-md border">
                  {atisData[pilot.flight_plan.arrival] ? (
                    <div>
                      <div className="text-sm text-gray-800 leading-relaxed">
                        {atisData[pilot.flight_plan.arrival].atis}
                      </div>
                      {atisData[pilot.flight_plan.arrival].callsign && (
                        <div className="text-xs text-gray-600 mt-2">
                          <span className="font-semibold">Station:</span> {atisData[pilot.flight_plan.arrival].callsign}
                          {atisData[pilot.flight_plan.arrival].frequency && (
                            <span className="ml-3"><span className="font-semibold">Frequency:</span> {atisData[pilot.flight_plan.arrival].frequency}</span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2">
                        Updated: {new Date(atisData[pilot.flight_plan.arrival].time || '').toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">Loading ATIS data...</div>
                  )}
                </div>
              </div>
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