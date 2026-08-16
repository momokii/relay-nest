import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { createServer, type Server } from "node:net"
import { afterEach, describe, expect, it } from "vitest"

import {
  createSmtpSender,
  createTelegramSender,
  NotificationProviderError,
} from "../apps/api/src/notifications/providers"

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
  servers.length = 0
})

describe("Todo 11 provider boundaries", () => {
  it("speaks the typed SMTP boundary to a mocked server", async () => {
    // Given a local SMTP server with deterministic protocol responses
    const commands: string[] = []
    const server = createServer((socket) => {
      socket.write("220 mock.smtp.test\r\n")
      let buffer = ""
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8")
        if (buffer.includes("\r\n.\r\n")) {
          commands.push(buffer)
          socket.write("250 accepted\r\n")
          buffer = ""
          return
        }
        const lines = buffer.split("\r\n")
        const command = lines[0]
        if (!command) return
        commands.push(command)
        buffer = lines.slice(1).join("\r\n")
        if (command.startsWith("EHLO")) socket.write("250 hello\r\n")
        else if (command.startsWith("AUTH")) socket.write("235 authenticated\r\n")
        else if (command.startsWith("MAIL") || command.startsWith("RCPT"))
          socket.write("250 accepted\r\n")
        else if (command === "DATA") socket.write("354 continue\r\n")
        else if (command === "QUIT") socket.write("221 bye\r\n")
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("mock SMTP address unavailable")

    // When the notification adapter sends a test message
    await createSmtpSender({ allowInsecureForTests: true })(
      {
        host: "127.0.0.1",
        port: address.port,
        secure: false,
        username: "admin@example.invalid",
        password: "opaque-password-fixture",
        from: "admin@example.invalid",
      },
      "Test",
      "Body",
    )

    // Then the wire contains protocol commands but no adapter error leaks credentials
    expect(commands.some((command) => command.startsWith("AUTH PLAIN"))).toBe(true)
    expect(commands.join("\n")).not.toContain("opaque-password-fixture")
  })

  it("uses Telegram Bot API sendMessage JSON against a mocked HTTPS-shaped server", async () => {
    // Given a local HTTP server implementing the Telegram response shape
    const requests: Array<{ readonly path: string; readonly body: string }> = []
    const server = createHttpServer((request: IncomingMessage, response: ServerResponse) => {
      let body = ""
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf8")
      })
      request.on("end", () => {
        requests.push({ path: request.url ?? "", body })
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify({ ok: true, result: { message_id: 1 } }))
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("mock Telegram address unavailable")

    // When the notification adapter sends to a configured chat
    await createTelegramSender(`http://127.0.0.1:${address.port}`)(
      { botToken: "opaque-token-fixture", chatIds: ["12345"] },
      "safe test",
    )

    // Then the official method and JSON fields are used without putting the token in the body
    expect(requests[0]?.path).toBe("/botopaque-token-fixture/sendMessage")
    expect(requests[0]?.body).toContain('"chat_id":"12345"')
    expect(requests[0]?.body).not.toContain("opaque-token-fixture")
  })

  it.each([
    { status: 450, kind: "transient" as const },
    { status: 550, kind: "provider" as const },
  ])(
    "classifies SMTP $status replies without leaking provider details",
    async ({ status, kind }) => {
      // Given an SMTP server returning a specific 4xx or 5xx transaction reply
      const server = createServer((socket) => {
        socket.write("220 mock.smtp.test\r\n")
        socket.on("data", (chunk) => {
          const command = chunk.toString("utf8")
          if (command.startsWith("EHLO")) socket.write("250 hello\r\n")
          else if (command.startsWith("AUTH")) socket.write("235 authenticated\r\n")
          else if (command.startsWith("MAIL")) socket.write(`${status} opaque provider detail\r\n`)
        })
      })
      servers.push(server)
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("mock SMTP address unavailable")

      // When the provider adapter submits a message
      const failure = await createSmtpSender({ allowInsecureForTests: true })(
        {
          host: "127.0.0.1",
          port: address.port,
          secure: false,
          username: "admin@example.invalid",
          password: "opaque-password-fixture",
          from: "admin@example.invalid",
        },
        "Test",
        "Body",
      ).catch((error: unknown) => error)

      // Then only the typed classification crosses the provider boundary
      expect(failure).toBeInstanceOf(NotificationProviderError)
      if (!(failure instanceof NotificationProviderError))
        throw new Error("provider failure was untyped")
      expect(failure.kind).toBe(kind)
      expect(failure.message).not.toContain("opaque provider detail")
    },
  )

  it.each([
    { status: 429, errorCode: 429, kind: "transient" as const },
    { status: 500, errorCode: 500, kind: "transient" as const },
    { status: 400, errorCode: 400, kind: "provider" as const },
  ])("classifies Telegram $status responses", async ({ status, errorCode, kind }) => {
    // Given a Telegram-shaped HTTP response with a rate-limit, server, or permanent status
    const server = createHttpServer((_request: IncomingMessage, response: ServerResponse) => {
      response.statusCode = status
      response.setHeader("content-type", "application/json")
      response.end(
        JSON.stringify({ ok: false, error_code: errorCode, description: "opaque provider detail" }),
      )
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("mock Telegram address unavailable")

    // When the provider adapter submits a message
    const failure = await createTelegramSender(`http://127.0.0.1:${address.port}`)(
      { botToken: "opaque-token-fixture", chatIds: ["12345"] },
      "safe test",
    ).catch((error: unknown) => error)

    // Then retryability is classified from stable HTTP semantics without response leakage
    expect(failure).toBeInstanceOf(NotificationProviderError)
    if (!(failure instanceof NotificationProviderError))
      throw new Error("provider failure was untyped")
    expect(failure.kind).toBe(kind)
    expect(failure.message).not.toContain("opaque provider detail")
  })
})
