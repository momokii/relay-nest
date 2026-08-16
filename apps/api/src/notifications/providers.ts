import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { connect as connectTcp, type Socket } from "node:net"
import { connect as connectTls, type TLSSocket } from "node:tls"
import { z } from "zod"

export type SmtpSettings = {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly username: string
  readonly password: string
  readonly from: string
}

export type TelegramSettings = {
  readonly botToken: string
  readonly chatIds: readonly string[]
}

export type ProviderErrorKind = "timeout" | "transient" | "provider" | "unknown"

export class NotificationProviderError extends Error {
  readonly name = "NotificationProviderError"
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message)
  }
}

type SmtpSocket = Socket | TLSSocket

export async function sendSmtp(
  settings: SmtpSettings,
  subject: string,
  body: string,
): Promise<void> {
  return createSmtpSender()(settings, subject, body)
}

export function createSmtpSender(
  options: { readonly allowInsecureForTests?: boolean } = {},
): (settings: SmtpSettings, subject: string, body: string) => Promise<void> {
  return async (settings, subject, body) => {
    if (!settings.secure && !options.allowInsecureForTests)
      throw new NotificationProviderError("provider", "smtp TLS is required")
    await sendSmtpInternal(settings, subject, body)
  }
}

async function sendSmtpInternal(
  settings: SmtpSettings,
  subject: string,
  body: string,
): Promise<void> {
  const socket = await openSmtpSocket(settings)
  try {
    await expectSmtp(socket, "220")
    await command(socket, "EHLO waha-command-center", "250")
    await command(
      socket,
      `AUTH PLAIN ${Buffer.from(`\0${settings.username}\0${settings.password}`).toString("base64")}`,
      "235",
    )
    await command(socket, `MAIL FROM:<${settings.from}>`, "250")
    await command(socket, `RCPT TO:<${settings.from}>`, "250")
    await command(socket, "DATA", "354")
    await writeAndRead(
      socket,
      `From: ${settings.from}\r\nTo: ${settings.from}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body.replace(/^\./gm, "..")}\r\n.\r\n`,
    )
    await command(socket, "QUIT", "221")
  } finally {
    socket.destroy()
  }
}

export async function sendTelegram(settings: TelegramSettings, text: string): Promise<void> {
  return createTelegramSender()(settings, text)
}

export function createTelegramSender(
  baseUrl = "https://api.telegram.org",
): (settings: TelegramSettings, text: string) => Promise<void> {
  return async (settings, text) => {
    for (const chatId of settings.chatIds) {
      const result = await telegramRequest(baseUrl, settings.botToken, chatId, text)
      if (!result.ok) {
        throw new NotificationProviderError("provider", "telegram rejected request")
      }
    }
  }
}

async function openSmtpSocket(settings: SmtpSettings): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    const socket = settings.secure
      ? connectTls({ host: settings.host, port: settings.port, servername: settings.host })
      : connectTcp({ host: settings.host, port: settings.port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new NotificationProviderError("timeout", "smtp connection timed out"))
    }, 10_000)
    socket.once(settings.secure ? "secureConnect" : "connect", () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once("error", (error: Error) => {
      clearTimeout(timer)
      void error
      reject(new NotificationProviderError("unknown", "smtp connection failed"))
    })
  })
}

async function command(socket: SmtpSocket, value: string, expected: string): Promise<void> {
  const response = await writeAndRead(socket, `${value}\r\n`)
  if (!response.startsWith(expected)) {
    throw new NotificationProviderError(
      response.startsWith("4") ? "transient" : "provider",
      "smtp rejected request",
    )
  }
}

async function expectSmtp(socket: SmtpSocket, expected: string): Promise<void> {
  const response = await readResponse(socket)
  if (!response.startsWith(expected)) {
    throw new NotificationProviderError(
      response.startsWith("4") ? "transient" : "provider",
      "smtp greeting rejected",
    )
  }
}

async function writeAndRead(socket: SmtpSocket, value: string): Promise<string> {
  socket.write(value)
  return readResponse(socket)
}

async function readResponse(socket: SmtpSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ""
    const timer = setTimeout(() => {
      cleanup()
      reject(new NotificationProviderError("timeout", "smtp response timed out"))
    }, 10_000)
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      const lines = buffer.split("\r\n")
      const last = lines.at(-2)
      if (last && /^\d{3} /.test(last)) {
        cleanup()
        resolve(last)
      }
    }
    const onError = () => {
      cleanup()
      reject(new NotificationProviderError("unknown", "smtp response failed"))
    }
    const cleanup = () => {
      clearTimeout(timer)
      socket.off("data", onData)
      socket.off("error", onError)
    }
    socket.on("data", onData)
    socket.on("error", onError)
  })
}

const telegramResponseSchema = z.object({ ok: z.boolean(), error_code: z.number().optional() })

function telegramRequest(
  baseUrl: string,
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ readonly ok: boolean }> {
  return new Promise((resolve, reject) => {
    const request = (baseUrl.startsWith("http://") ? httpRequest : httpsRequest)(
      `${baseUrl}/bot${encodeURIComponent(botToken)}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        timeout: 10_000,
      },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk: string) => {
          body += chunk
          if (body.length > 64_000) response.destroy()
        })
        response.on("end", () => {
          let parsedBody: unknown
          try {
            parsedBody = JSON.parse(body)
          } catch {
            reject(new NotificationProviderError("unknown", "telegram response was invalid"))
            return
          }
          const parsed = telegramResponseSchema.safeParse(parsedBody)
          if (!parsed.success) {
            reject(new NotificationProviderError("unknown", "telegram response was invalid"))
            return
          }
          if (!parsed.data.ok) {
            const kind =
              response.statusCode === 429 || (response.statusCode ?? 0) >= 500
                ? "transient"
                : "provider"
            reject(new NotificationProviderError(kind, "telegram rejected request"))
            return
          }
          resolve(parsed.data)
        })
      },
    )
    request.on("timeout", () => {
      request.destroy(new NotificationProviderError("timeout", "telegram request timed out"))
    })
    request.on("error", (error: unknown) => {
      if (error instanceof NotificationProviderError) reject(error)
      else reject(new NotificationProviderError("unknown", "telegram request failed"))
    })
    request.end(JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }))
  })
}
