# METAR Weather Data Feature

## Overview
Added real-time weather information (METAR) for both departure and arrival airports using the VATSIM METAR API.

## Features

### Dual Airport Weather Display
- **Departure Airport**: Weather conditions at origin
- **Arrival Airport**: Weather conditions at destination
- **Side-by-side Layout**: Easy comparison on desktop, stacked on mobile
- **Airport Names**: Full airport names with ICAO codes

### METAR Data Display
- **Raw METAR**: Complete meteorological report in standard format
- **Monospace Font**: Easy-to-read aviation weather format
- **Update Timestamp**: When weather data was last fetched
- **Loading States**: Shows "Loading weather data..." while fetching

## Technical Implementation

### API Integration
- **Endpoint**: `https://metar.vatsim.net/:icao`
- **Method**: GET (returns plain text METAR)
- **Authentication**: None required
- **CORS**: Enabled for browser requests

### TypeScript Interface
```typescript
export interface MetarData {
  icao: string;
  metar: string;
  time: string;
}
```

### Core Functions

#### `fetchMetarData(icao: string)`
- Fetches METAR data from VATSIM API
- Caches results to prevent duplicate requests
- Handles API errors gracefully
- Stores with timestamp for freshness tracking

#### Integration with Flight Search
- Automatically fetches METAR when flight is found
- Parallel requests for departure and arrival airports
- Non-blocking - doesn't delay flight data display
- Error resilient - works even if weather unavailable

### UI Components

#### Weather Information Section
- **Dedicated Box**: Separate section below flight information
- **Grid Layout**: Responsive 1-column (mobile) / 2-column (desktop)
- **Professional Styling**: Clean, aviation-focused design
- **Consistent Branding**: Matches overall app aesthetics

#### METAR Display Format
```
Departure - KJFK - John F Kennedy International Airport
┌─────────────────────────────────────────────────────┐
│ KJFK 282151Z 28015G23KT 10SM FEW250 24/16 A3012    │
│ RMK AO2 SLP223 T02440161 56014                     │
│                                                     │
│ Updated: 9/28/2025, 9:51:23 PM                     │
└─────────────────────────────────────────────────────┘
```

## Benefits

### For Pilots
- **Pre-flight Planning**: Current weather at departure/arrival
- **Decision Making**: Weather-based route/altitude decisions  
- **Situational Awareness**: Real conditions vs forecast
- **Professional Experience**: Same data real pilots use

### For Controllers
- **Weather Awareness**: Conditions affecting traffic flow
- **Runway Planning**: Wind direction for active runways
- **Traffic Management**: Weather impact on operations
- **Realistic Simulation**: Authentic ATC environment

### For Aviation Enthusiasts
- **Educational**: Learn to read METAR reports
- **Realistic Experience**: Professional flight tracking
- **Weather Analysis**: Understand aviation meteorology
- **Event Planning**: Weather considerations for virtual events

## METAR Components Decoded

### Common METAR Elements
- **KJFK 282151Z**: Airport code and observation time (UTC)
- **28015G23KT**: Wind from 280° at 15kt, gusts to 23kt
- **10SM**: Visibility 10 statute miles
- **FEW250**: Few clouds at 25,000 feet
- **24/16**: Temperature 24°C, dewpoint 16°C
- **A3012**: Altimeter setting 30.12 inches Hg

### Weather Conditions
- **CLR/SKC**: Clear skies
- **FEW/SCT/BKN/OVC**: Cloud coverage levels
- **RA/SN/FG**: Rain/snow/fog conditions
- **TEMPO/BECMG**: Temporary/becoming changes

## Use Cases

### Flight Operations
- **Weather Minimums**: Check if conditions meet flight rules
- **Fuel Planning**: Account for weather-related delays
- **Alternate Planning**: Weather at alternate airports
- **Go/No-Go Decisions**: Weather-based flight decisions

### Training Scenarios  
- **Weather Interpretation**: Learn METAR reading skills
- **Decision Making**: Weather-based pilot training
- **IFR/VFR Conditions**: Understanding flight rules
- **Cross-country Planning**: Real weather considerations

### Virtual Events
- **Realistic Operations**: Weather adds complexity
- **Event Planning**: Schedule around weather
- **Challenging Conditions**: Weather-based scenarios
- **Training Events**: Weather interpretation practice

This feature transforms the app into a complete flight planning and weather briefing tool, providing essential meteorological data that real pilots rely on for safe flight operations! ⛈️✈️