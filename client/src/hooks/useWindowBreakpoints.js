import { useState, useEffect, useMemo } from 'react'

// Брейкпоинты как в Ant Design (px). Хук пересчитывается при resize.
const BREAKPOINTS = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 }

export function useWindowBreakpoints() {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return useMemo(() => ({
    xs: width < BREAKPOINTS.sm,
    sm: width >= BREAKPOINTS.sm,
    md: width >= BREAKPOINTS.md,
    lg: width >= BREAKPOINTS.lg,
    xl: width >= BREAKPOINTS.xl,
    xxl: width >= BREAKPOINTS.xxl,
  }), [width])
}
