import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'VATSIM Flight Plan Lookup',
  description: 'Look up VATSIM flight plans by callsign - view pilot information, aircraft type, departure/arrival airports, and complete flight plan details',
  keywords: 'VATSIM, flight plan, aviation, simulator, pilot, callsign lookup',
  authors: [{ name: 'VATSIM FPN' }],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  )
}