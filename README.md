# VATSIM Flight Plan Lookup

A web application to lookup current VATSIM flight plans by callsign.

## Features

- Search for flights by callsign
- Display pilot information including name
- Show aircraft type (short code)
- Display departure and arrival airports with full names (e.g., "KJFK - John F Kennedy International Airport")
- Show transponder code (with assigned squawk if different)
- **Live position updates** - Real-time altitude, speed, and heading updates every second
- Toggle auto-refresh on/off for live tracking
- View complete flight plan details including route and remarks
- Real-time data from VATSIM network (updates every 15 seconds)

## Development

### Prerequisites

- Node.js 18 or later
- npm

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`.

### Testing Production Build Locally

1. Build the application:
```bash
npm run build
```

2. Serve the built files:
```bash
npm run start:prod
```

### Building for Production

```bash
npm run build
```

## Deployment

### Cloudflare Pages

This application is configured for deployment to Cloudflare Pages:

1. Connect your repository to Cloudflare Pages
2. Set the build command to: `npm run build`
3. Set the build output directory to: `out`
4. Deploy

The application will automatically handle CORS and API requests through Cloudflare's edge network.

## API

The application fetches data directly from the official VATSIM APIs:
- **Flight Data:** `https://data.vatsim.net/v3/vatsim-data.json` (updates every 15 seconds)
- **Airport Information:** `https://my.vatsim.net/api/v2/aip/airports/:icao` (for airport names)
- No authentication required
- CORS enabled for browser requests

## Usage

1. Enter a callsign in the search field (e.g., "AAL123", "UAL456")
2. Click "Search" or press Enter
3. View the flight information including:
   - Pilot name
   - Aircraft type
   - Departure airport (code + full name)
   - Arrival airport (code + full name)
   - Transponder code (shows assigned squawk if different)
   - **Live position data** (altitude, speed, heading)
   - Flight plan details

4. **Enable Live Updates** (optional):
   - Click "Auto-Refresh ON" to get real-time position updates every second
   - Watch altitude, speed, and heading change in real-time
   - "Live Updates" indicator shows when auto-refresh is active

## Technical Details

- Built with Next.js 14 and TypeScript
- Styled with Tailwind CSS
- Static export for Cloudflare Pages compatibility
- Client-side data fetching for real-time updates