import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { Providers } from '@/components/Providers'

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
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
