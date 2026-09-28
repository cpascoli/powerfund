"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { safeNextPath } from "@/lib/api/paths";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  // Set by pages that send a signed-out operator here and need them back,
  // such as the OAuth consent page.
  const next = safeNextPath(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    router.replace(next ?? "/briefing");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          disabled={pending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? (
          <>
            <span className="auth-spinner" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
