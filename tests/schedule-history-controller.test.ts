import { describe, expect, it } from "vitest"

import { scheduleRowActions } from "../apps/web/src/schedule-history-controller"

describe("schedule history controller", () => {
  it("maps schedule state to row actions", () => {
    // Given the canonical schedule states
    // When each state is mapped to row actions
    // Then mutable states allow cancel, terminal states allow delete, and
    // in-flight attempting allows neither
    expect(scheduleRowActions("scheduled")).toEqual({ canCancel: true, canDelete: false })
    expect(scheduleRowActions("queued")).toEqual({ canCancel: true, canDelete: false })
    expect(scheduleRowActions("attempting")).toEqual({ canCancel: false, canDelete: false })
    expect(scheduleRowActions("submitted")).toEqual({ canCancel: false, canDelete: true })
    expect(scheduleRowActions("acknowledged")).toEqual({ canCancel: false, canDelete: true })
    expect(scheduleRowActions("failed")).toEqual({ canCancel: false, canDelete: true })
    expect(scheduleRowActions("unknown")).toEqual({ canCancel: false, canDelete: true })
    expect(scheduleRowActions("cancelled")).toEqual({ canCancel: false, canDelete: true })
  })
})
