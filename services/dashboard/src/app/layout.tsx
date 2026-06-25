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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before paint to avoid a flash.
            Kept in sync with resolveInitialTheme() in ThemeProvider.tsx. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('maestra-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`,
          }}
        />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
