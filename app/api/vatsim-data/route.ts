import { NextResponse } from 'next/server';

const VATSIM_DATA_URL = 'https://data.vatsim.net/v3/vatsim-data.json';

export async function GET() {
  try {
    const response = await fetch(VATSIM_DATA_URL, {
      headers: {
        'User-Agent': 'VATSIM-FPN-Lookup-App/1.0'
      },
      // Cache for 15 seconds to match VATSIM's update frequency
      next: { revalidate: 15 }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch VATSIM data');
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching VATSIM data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch VATSIM data' },
      { status: 500 }
    );
  }
}