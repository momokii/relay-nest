import { useMemo, useState } from "react"

import {
  type AdminCreateUserInput,
  type AdminGrantInput,
  type AdminUser,
  createDashboardAdminApi,
} from "./dashboard-admin-api"
import type { ActionState } from "./dashboard-state"
import { actionFromResult } from "./dashboard-state"

export type DashboardAdminController = Readonly<{
  createUserAction: ActionState<AdminUser>
  grantAction: ActionState<null>
  disableAction: ActionState<null>
  createUser: (input: AdminCreateUserInput) => Promise<void>
  createGrant: (input: AdminGrantInput) => Promise<void>
  disableUser: (userId: string) => Promise<void>
}>

export function useDashboardAdminController(): DashboardAdminController {
  const api = useMemo(() => createDashboardAdminApi(import.meta.env.VITE_API_BASE_URL), [])
  const [createUserAction, setCreateUserAction] = useState<ActionState<AdminUser>>({ kind: "idle" })
  const [grantAction, setGrantAction] = useState<ActionState<null>>({ kind: "idle" })
  const [disableAction, setDisableAction] = useState<ActionState<null>>({ kind: "idle" })

  const createUser = async (input: AdminCreateUserInput): Promise<void> => {
    setCreateUserAction({ kind: "submitting" })
    setCreateUserAction(actionFromResult(await api.createUser(input)))
  }
  const createGrant = async (input: AdminGrantInput): Promise<void> => {
    setGrantAction({ kind: "submitting" })
    setGrantAction(actionFromResult(await api.createGrant(input)))
  }
  const disableUser = async (userId: string): Promise<void> => {
    setDisableAction({ kind: "submitting" })
    setDisableAction(actionFromResult(await api.disableUser(userId)))
  }

  return {
    createUserAction,
    grantAction,
    disableAction,
    createUser,
    createGrant,
    disableUser,
  }
}
