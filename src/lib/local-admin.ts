// The local administrator `admin`: created on the first start and kept for good.
//
// Owner, 2026-11-15: "admin account should still be there even after SSO is enabled".
// It is the way in when single sign-on is down or misconfigured, so the app refuses
// anything that would take it away: disabling it, lowering its role, tying it to a
// person (an SSO sign-in could then land in it and rename it), or letting single
// sign-on sign anyone into it. Its password can be changed (Reset password, or its own
// profile), and that is how it is secured once SSO works.

export const LOCAL_ADMIN_USERNAME = "admin";

export function isLocalAdmin(user: { username?: string | null } | null | undefined): boolean {
  return (user?.username ?? "").toLowerCase() === LOCAL_ADMIN_USERNAME;
}

/** Why a change to the local administrator is refused, or null when it is allowed. */
export function localAdminRefusal(change: { disable?: boolean; role?: string; employeeId?: string | null }): string | null {
  const why = "The local admin account stays, also once single sign-on is on: it is the way in when SSO is down.";
  if (change.disable) return `${why} Change its password instead of disabling it.`;
  if (change.role !== undefined && change.role !== "admin") return `${why} It keeps the Administrator role.`;
  if (change.employeeId && change.employeeId !== "none") return `${why} It is not tied to a person; give that person their own account.`;
  return null;
}
