"use client";

import { useAuth } from "./AuthProvider";

/** Signed in, but the API could not tell us the role.
 *
 * Almost always SUPABASE_JWT_SECRET missing from the repo-root .env: sign-in
 * happens browser-to-Supabase and works without it, but the API cannot then
 * verify the session, so every decision is refused. Failing at the moment
 * someone presses Approve would be a confusing second failure, so it is
 * surfaced up front.
 */
export function RoleWarning() {
  const { session, me, error } = useAuth();
  if (!session || me) return null;
  return (
    <div className="setup" role="status">
      <h3>Signed in, but your role is unknown</h3>
      <div className="note">
        Sign-in worked, but the API could not verify the session, so Approve
        and Mark done will be refused. Add the JWT secret to <code>.env</code>
        {" "}in the repo root and restart the API:
      </div>
      <pre>{`SUPABASE_JWT_SECRET=<Project Settings → API → JWT Secret>`}</pre>
      {error && <div className="note">API said: {error}</div>}
    </div>
  );
}
