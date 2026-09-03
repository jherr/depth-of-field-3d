import { useEffect, useRef, useState } from 'react'

export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * Observed size of an element, used to letterbox the sensor viewport.
 *
 * The HUD and the render target must agree on this rectangle, so both read it
 * from here rather than measuring independently.
 */
export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  Size,
] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) setSize({ width: box.width, height: box.height })
    })
    observer.observe(el)
    setSize({ width: el.clientWidth, height: el.clientHeight })
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
