import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { SiteFooter } from "@/components/site-footer";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <p className="auth-eyebrow">
          <Link href="/">Power Fund</Link>
        </p>
        <h1>Operator sign in</h1>
        <p className="muted">
          Research OS for the live book. The public site does not need an
          account.
        </p>
        <LoginForm />
      </div>
      <SiteFooter />
    </div>
  );
}
