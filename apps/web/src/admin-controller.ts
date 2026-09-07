import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type AdminCreateUserInput,
  type AdminGrantInput,
  type AdminUser,
  type AdminUserRecord,
  createDashboardAdminApi,
} from "./dashboard-admin-api"
import type { ActionState, ResourceState } from "./dashboard-state"
import { actionFromResult, resourceFromResult } from "./dashboard-state"

export type DashboardAdminController = Readonly<{
  createUserAction: ActionState<AdminUser>
  grantAction: ActionState<null>
  disableAction: ActionState<null>
  enableAction: ActionState<null>
  resetPasswordAction: ActionState<null>
  users: ResourceState<readonly AdminUserRecord[]>
  createUser: (input: AdminCreateUserInput) => Promise<void>
  createGrant: (input: AdminGrantInput) => Promise<void>
  disableUser: (userId: string) => Promise<void>
  enableUser: (userId: string) => Promise<void>
  resetPassword: (userId: string, password: string) => Promise<void>
}>

export function useDashboardAdminController(usersEnabled = false): DashboardAdminController {
  const api = useMemo(() => createDashboardAdminApi(import.meta.env.VITE_API_BASE_URL), [])
  const [createUserAction, setCreateUserAction] = useState<ActionState<AdminUser>>({ kind: "idle" })
  const [grantAction, setGrantAction] = useState<ActionState<null>>({ kind: "idle" })
  const [disableAction, setDisableAction] = useState<ActionState<null>>({ kind: "idle" })
  const [enableAction, setEnableAction] = useState<ActionState<null>>({ kind: "idle" })
  const [resetPasswordAction, setResetPasswordAction] = useState<ActionState<null>>({
    kind: "idle",
  })
  const [users, setUsers] = useState<ResourceState<readonly AdminUserRecord[]>>({ kind: "loading" })

  const refreshUsers = useCallback(() => {
    if (!usersEnabled) return
    void api.listUsers().then((result) => setUsers(resourceFromResult(result)))
  }, [api, usersEnabled])

  useEffect(() => {
    refreshUsers()
  }, [refreshUsers])

  const createUser = async (input: AdminCreateUserInput): Promise<void> => {
    setCreateUserAction({ kind: "submitting" })
    const result = await api.createUser(input)
    setCreateUserAction(actionFromResult(result))
    if (result.kind === "ready") refreshUsers()
  }
  const createGrant = async (input: AdminGrantInput): Promise<void> => {
    setGrantAction({ kind: "submitting" })
    setGrantAction(actionFromResult(await api.createGrant(input)))
  }
  const disableUser = async (userId: string): Promise<void> => {
    setDisableAction({ kind: "submitting" })
    const result = await api.disableUser(userId)
    setDisableAction(actionFromResult(result))
    if (result.kind === "ready") refreshUsers()
  }
  const enableUser = async (userId: string): Promise<void> => {
    setEnableAction({ kind: "submitting" })
    const result = await api.enableUser(userId)
    setEnableAction(actionFromResult(result))
    if (result.kind === "ready") refreshUsers()
  }
  const resetPassword = async (userId: string, password: string): Promise<void> => {
    setResetPasswordAction({ kind: "submitting" })
    const result = await api.resetPassword(userId, password)
    setResetPasswordAction(actionFromResult(result))
    if (result.kind === "ready") refreshUsers()
  }

  return {
    createUserAction,
    grantAction,
    disableAction,
    enableAction,
    resetPasswordAction,
    users,
    createUser,
    createGrant,
    disableUser,
    enableUser,
    resetPassword,
  }
}
