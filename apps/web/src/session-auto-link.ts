export const AUTO_LINK_POLL_MS = 2000
export const AUTO_LINK_MAX_POLLS = 15
const QR_SCAN_STATE = "scan_qr_code"
const WORKING_STATE = "working"

export type AutoLinkHooks = {
  readonly start: () => Promise<unknown>
  readonly fetchStatus: () => Promise<string>
  readonly onStatus: (status: string) => void
  readonly loadQr: () => void
  readonly delay: (ms: number) => Promise<void>
  readonly isCancelled?: () => boolean
}

export async function runAutoLink(hooks: AutoLinkHooks): Promise<void> {
  try {
    await hooks.start()
  } catch (error) {
    if (error instanceof Error) {
      hooks.onStatus("start_failed")
      return
    }
    throw error
  }
  for (let attempt = 0; attempt < AUTO_LINK_MAX_POLLS; attempt += 1) {
    if (hooks.isCancelled?.() === true) return
    const status = await readStatus(hooks)
    hooks.onStatus(status)
    if (status === QR_SCAN_STATE) {
      hooks.loadQr()
      return
    }
    if (status === WORKING_STATE) return
    await hooks.delay(AUTO_LINK_POLL_MS)
  }
  if (hooks.isCancelled?.() === true) return
  hooks.onStatus("linking_timeout")
}

async function readStatus(hooks: AutoLinkHooks): Promise<string> {
  try {
    return normalize(hooks.fetchStatus ? await hooks.fetchStatus() : "") || "starting"
  } catch (error) {
    if (error instanceof Error) return "starting"
    throw error
  }
}

function normalize(status: string): string {
  return status.trim().toLowerCase()
}
