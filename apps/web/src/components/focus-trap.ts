import * as React from "react"

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

export function useFocusTrap(
  params: Readonly<{
    containerRef: React.RefObject<HTMLElement | null>
    onClose: () => void
    active?: boolean
  }>,
): void {
  const { containerRef, onClose, active = true } = params
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null)
  const previousAriaHiddenRef = React.useRef<string | null>(null)
  const previousInertRef = React.useRef<boolean>(false)

  React.useEffect(() => {
    if (!active) return
    if (typeof document === "undefined") return
    const container = containerRef.current
    if (!container) return

    previousActiveElementRef.current = document.activeElement as HTMLElement | null

    const appFrame = document.querySelector<HTMLElement>(".app-frame")
    if (appFrame) {
      previousAriaHiddenRef.current = appFrame.getAttribute("aria-hidden")
      previousInertRef.current = appFrame.hasAttribute("inert")
      appFrame.setAttribute("aria-hidden", "true")
      appFrame.setAttribute("inert", "")
      const inertTarget = appFrame as HTMLElement & { inert?: boolean }
      try {
        inertTarget.inert = true
      } catch {
        // ignore if browser/jsdom does not support
      }
    }

    const focusFirst = (): void => {
      const focusables = getFocusable(container)
      if (focusables.length > 0) {
        focusables[0]?.focus()
      } else {
        // Ensure container can receive focus if no focusable children
        if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1")
        container.focus()
      }
    }

    focusFirst()

    const raf = requestAnimationFrame(() => focusFirst())

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const focusables = getFocusable(container)
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      const activeElement = document.activeElement
      if (event.shiftKey) {
        if (activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      } else if (activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("keydown", onKeyDown)
      const previous = previousActiveElementRef.current
      if (previous && typeof previous.focus === "function") {
        queueMicrotask(() => {
          try {
            previous.focus()
          } catch {
            // ignore
          }
        })
      }
      if (appFrame) {
        const inertTarget = appFrame as HTMLElement & { inert?: boolean }
        try {
          inertTarget.inert = false
        } catch {
          // ignore
        }
        appFrame.removeAttribute("inert")
        if (previousInertRef.current) appFrame.setAttribute("inert", "")
        if (previousAriaHiddenRef.current === null) appFrame.removeAttribute("aria-hidden")
        else appFrame.setAttribute("aria-hidden", previousAriaHiddenRef.current)
      }
    }
  }, [active, containerRef, onClose])
}
