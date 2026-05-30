import React, { createContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'auto' | 'ham'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('yahaml-theme')
    return (saved as Theme) || 'auto'
  })

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const isDark = theme === 'auto' ? systemPrefersDark : theme === 'dark' || theme === 'ham'

  // Apply theme and track system preference
  useEffect(() => {
    localStorage.setItem('yahaml-theme', theme)
    const root = document.documentElement
    root.classList.remove('theme-light', 'theme-dark', 'theme-ham')

    if (theme === 'auto') {
      root.classList.add(systemPrefersDark ? 'theme-dark' : 'theme-light')
    } else {
      root.classList.add(`theme-${theme}`)
    }
  }, [theme, systemPrefersDark])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'auto') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}
