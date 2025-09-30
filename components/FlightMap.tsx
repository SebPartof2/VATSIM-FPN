'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAirportByIcao } from '../utils/vatspy-parser';

// Define types locally to match the main app
interface VatsimPilot {
  callsign: string;
  latitude: number;
  longitude: number;
  altitude: number;
  groundspeed: number;
  heading: number;
  flight_plan?: {
    departure?: string;
    arrival?: string;
    aircraft_short?: string;
  };
}

interface VatsimAirport {
  icao: string;
  name: string;
  city?: string;
  country?: string;
}

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Function to calculate bearing between two points
const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360
};

// Function to create dynamic aircraft icon based on aircraft type with rotation
const createAircraftIcon = (aircraftType: string = 'a20n', rotation: number = 0): L.DivIcon => {
  // Clean up aircraft type and convert to lowercase
  const cleanType = aircraftType.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Use the aircraft type as filename, fallback to a20n if icon doesn't exist
  const iconUrl = `/aircraft/${cleanType}.svg`;
  
  // Create SVG with black filter and rotation
  const svgIcon = `
    <div style="
      width: 32px; 
      height: 32px; 
      transform: rotate(${rotation}deg);
      filter: brightness(0) saturate(100%);
      background-image: url('${iconUrl}');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    "></div>
  `;
  
  return new L.DivIcon({
    html: svgIcon,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
    className: 'aircraft-icon',
  });
};

// Airport icon
const airportIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red" width="20" height="20">
      <circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/>
    </svg>
  `),
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
});

interface FlightMapProps {
  pilot: VatsimPilot;
  airports: Record<string, VatsimAirport>;
}

// Function to get airport coordinates from VatSpy data
const getAirportCoordinates = async (icao: string): Promise<[number, number] | null> => {
  try {
    const airport = await getAirportByIcao(icao);
    if (airport && airport.latitude && airport.longitude) {
      return [airport.latitude, airport.longitude];
    }
  } catch (error) {
    console.log(`Could not fetch coordinates for ${icao} from VatSpy:`, error);
  }
  return null;
};

export default function FlightMap({ pilot, airports }: FlightMapProps) {
  const [departureCoords, setDepartureCoords] = useState(null as any);
  const [arrivalCoords, setArrivalCoords] = useState(null as any);
  const currentPosition: [number, number] = [pilot.latitude, pilot.longitude];
  
  // Calculate rotation angle towards destination
  const aircraftType = pilot.flight_plan?.aircraft_short || 'a20n';
  let rotation = 0;
  if (arrivalCoords) {
    rotation = calculateBearing(
      pilot.latitude,
      pilot.longitude,
      arrivalCoords[0],
      arrivalCoords[1]
    );
  }
  
  // Create aircraft icon based on aircraft type with rotation
  const aircraftIcon = createAircraftIcon(aircraftType, rotation);
  
  useEffect(() => {
    // Fetch airport coordinates for departure and arrival
    const fetchCoords = async () => {
      if (pilot.flight_plan?.departure) {
        const coords = await getAirportCoordinates(pilot.flight_plan.departure);
        setDepartureCoords(coords);
      }
      if (pilot.flight_plan?.arrival) {
        const coords = await getAirportCoordinates(pilot.flight_plan.arrival);
        setArrivalCoords(coords);
      }
    };
    fetchCoords();
  }, [pilot.flight_plan]);

  const pathCoords = [];
  if (departureCoords) pathCoords.push(departureCoords);
  pathCoords.push(currentPosition);
  if (arrivalCoords) pathCoords.push(arrivalCoords);

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-gray-300">
      <MapContainer
        center={currentPosition}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Aircraft position */}
        <Marker position={currentPosition} icon={aircraftIcon}>
          <Popup>
            <div className="text-sm">
              <strong>{pilot.callsign}</strong>
              <br />
              Altitude: {pilot.altitude} ft
              <br />
              Speed: {pilot.groundspeed} kts
              <br />
              Heading: {pilot.heading}°
            </div>
          </Popup>
        </Marker>

        {/* Departure Airport */}
        {departureCoords && (
          <Marker position={departureCoords} icon={airportIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Departure: {pilot.flight_plan?.departure}</strong>
                <br />
                {airports[pilot.flight_plan?.departure || '']?.name || pilot.flight_plan?.departure}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Arrival Airport */}
        {arrivalCoords && (
          <Marker position={arrivalCoords} icon={airportIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Arrival: {pilot.flight_plan?.arrival}</strong>
                <br />
                {airports[pilot.flight_plan?.arrival || '']?.name || pilot.flight_plan?.arrival}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Flight Path - Already Flown (Solid) */}
        {departureCoords && (
          <Polyline 
            positions={[departureCoords, currentPosition]} 
            color="blue" 
            weight={3} 
            opacity={0.7}
          />
        )}

        {/* Flight Path - Upcoming Route (Dotted) */}
        {arrivalCoords && (
          <Polyline 
            positions={[currentPosition, arrivalCoords]} 
            color="blue" 
            weight={3} 
            opacity={0.7}
            dashArray="10, 10"
          />
        )}
      </MapContainer>
    </div>
  );
}