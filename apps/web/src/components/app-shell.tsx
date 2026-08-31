import type * as React from "react"
import { useEffect, useRef, useState } from "react"
import type { Principal } from "../dashboard-api"
import {
  ACCOUNT_SCOPES,
  type AccountScope,
  type DashboardViewId,
  effectiveRole,
  VIEW_DEFINITIONS,
} from "../dashboard-model"

type AppShellProps = Readonly<{
  activeView: DashboardViewId
  scope: AccountScope
  principal: Principal
  isDemo: boolean
  isNavOpen: boolean
  onViewChange: (view: DashboardViewId) => void
  onScopeChange: (scope: AccountScope) => void
  onNavToggle: () => void
  onLogout: () => Promise<void>
  children: React.ReactNode
}>

export function AppShell({
  activeView,
  scope,
  principal,
  isDemo,
  isNavOpen,
  onViewChange,
  onScopeChange,
  onNavToggle,
  onLogout,
  children,
}: AppShellProps): React.JSX.Element {
  const role = effectiveRole(principal.user.rolesByScope[scope] ?? [])
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const wasNavOpen = useRef(isNavOpen)
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches,
  )
  const isMobileNavClosed = isMobileViewport && !isNavOpen

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 48rem)")
    const updateViewport = (): void => setIsMobileViewport(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener("change", updateViewport)
    return () => mediaQuery.removeEventListener("change", updateViewport)
  }, [])

  useEffect(() => {
    if (isMobileViewport && !isNavOpen && wasNavOpen.current) menuButtonRef.current?.focus()
    wasNavOpen.current = isNavOpen
  }, [isMobileViewport, isNavOpen])

  useEffect(() => {
    if (!isMobileViewport || !isNavOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      onNavToggle()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [isMobileViewport, isNavOpen, onNavToggle])

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            RN
          </span>
          <div>
            <strong>RelayNest</strong>
            <span>WAHA command center</span>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="scope-control">
            <span>Account scope</span>
            <select
              aria-label="Account scope"
              value={scope}
              onChange={(event) => {
                const selectedScope = ACCOUNT_SCOPES.find((value) => value === event.target.value)
                if (selectedScope) onScopeChange(selectedScope)
              }}
            >
              {ACCOUNT_SCOPES.map((value) => (
                <option key={value} value={value}>
                  {value[0]?.toUpperCase()}
                  {value.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button
            ref={menuButtonRef}
            className="mobile-menu-button"
            type="button"
            onClick={onNavToggle}
            aria-expanded={isNavOpen}
            aria-controls="primary-navigation"
          >
            {isNavOpen ? "Close menu" : "Menu"}
          </button>
          <section className="identity-block" aria-label="Authenticated user">
            <strong>{principal.user.displayName}</strong>
            <span>{role} · authenticated</span>
          </section>
          <button className="button button-secondary" type="button" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav
          id="primary-navigation"
          className={`primary-navigation ${isNavOpen ? "is-open" : ""}`}
          aria-label="Primary navigation"
          aria-hidden={isMobileNavClosed}
          inert={isMobileNavClosed}
        >
          <div className="nav-context">
            <span className="overline">Current boundary</span>
            <strong>
              {scope[0]?.toUpperCase()}
              {scope.slice(1)}
            </strong>
            <span className="nav-context-copy">
              All requests and evidence stay inside this scope.
            </span>
          </div>
          <div className="nav-list">
            {VIEW_DEFINITIONS.map((view) => (
              <button
                className={`nav-item ${activeView === view.id ? "is-active" : ""}`}
                key={view.id}
                type="button"
                aria-current={activeView === view.id ? "page" : undefined}
                onClick={() => {
                  onViewChange(view.id)
                  onNavToggle()
                }}
              >
                <span>{view.label}</span>
                <small>{view.eyebrow}</small>
              </button>
            ))}
          </div>
          <div className="nav-footnote">
            <StatusDot />
            <span>{isDemo ? "Demo data boundary" : "Live data boundary"}</span>
          </div>
        </nav>
        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}

function StatusDot(): React.JSX.Element {
  return <span className="status-dot" aria-hidden="true" />
}
