export type DashboardHttpFailure = "denied" | "unavailable" | "error"

export function classifyDashboardHttpStatus(status: number): DashboardHttpFailure {
  if (status === 401 || status === 403) return "denied"
  if (status === 404 || status === 501 || status === 502 || status === 503) return "unavailable"
  return "error"
}
