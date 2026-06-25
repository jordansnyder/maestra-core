'use client'

import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './Toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  )
}
