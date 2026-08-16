export class ScheduleValidationError extends Error {
  readonly name = "ScheduleValidationError"
}

export type OneTimeSchedule = {
  readonly scheduledFor: Date
  readonly timezone: string
}

export function validateOneTimeSchedule(input: OneTimeSchedule): OneTimeSchedule {
  if (Number.isNaN(input.scheduledFor.getTime())) {
    throw new ScheduleValidationError("scheduled time is invalid")
  }
  if (!hasTimeZone(input.timezone)) {
    throw new ScheduleValidationError("timezone must be a valid IANA timezone")
  }
  return { scheduledFor: new Date(input.scheduledFor), timezone: input.timezone }
}

function hasTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format()
    return true
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}
