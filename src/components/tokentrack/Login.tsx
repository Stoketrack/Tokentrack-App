import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/tokentrack/auth";

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) setError(signInError);
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-console px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2">
          <div className="grid size-7 place-items-center rounded-sm bg-foreground">
            <div className="size-3 rotate-45 bg-console" />
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground">
            TokenTrack <span className="font-medium text-muted-foreground">by MAD</span>
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-border bg-panel p-6"
        >
          <div className="space-y-1">
            <h1 className="text-sm font-semibold text-foreground">Sign in</h1>
            <p className="text-xs text-muted-foreground">
              This dashboard is private. Sign in with your TokenTrack account to continue.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="login-email" className="label-micro block">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-console px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="login-password" className="label-micro block">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-console px-3 py-2 pr-16 text-sm text-foreground outline-none focus:border-foreground/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-console hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
