import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'

export const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme doit être utilisé dans <ThemeProvider>.')
  return ctx
}
