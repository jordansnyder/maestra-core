import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Maestra Dashboard',
  description: 'Control panel for Maestra immersive experience infrastructure',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
