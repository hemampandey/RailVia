"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { Icon, PATH } from "./icons";

/** Everything behind a sign-in.
 *
 * Two roles exist: a divisional head, who grants closures, and a section
 * engineer, who reports work done. Which one you are is read from Postgres,
 * not chosen here.
 */
export function LoginGate({ children }: { children: React.ReactNode }) {
  const { session, loading, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { signIn } = useAuth();

  if (loading) {
    return <div className="status"><div className="spin" />Checking your session…</div>;
  }
  if (session) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await signIn(email.trim(), password); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="brand" style={{ padding: 0, marginBottom: 20 }}>
          <span className="mark" aria-hidden="true"><Icon d={PATH.rail} size={14} /></span>
          <b>Block Planner<span>Divisional maintenance · SIH26027</span></b>
        </div>

        {!configured ? (
          <div className="setup">
            <h3>Supabase is not configured</h3>
            <div className="note">Sign-in needs a Supabase project. Create
              <code> web/.env.local</code> with:</div>
            <pre>{`NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>`}</pre>
            <div className="note">
              Then run <code>src/store/schema.sql</code> in the SQL editor and
              add the two users, as described at the bottom of that file.
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 style={{ margin: "0 0 4px", fontSize: 17 }}>Sign in</h2>
            <p className="note" style={{ marginBottom: 18 }}>
              A <b>divisional head</b> grants closures. A <b>section engineer</b>
              {" "}reports work as done.
            </p>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" required
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password"
              required value={password}
              onChange={(e) => setPassword(e.target.value)} />
            {err && <div className="login-err">{err}</div>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
