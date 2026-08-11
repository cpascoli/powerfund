import { LoginForm } from "@/components/login-form";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <p className="auth-eyebrow">Power Fund</p>
        <h1>Sign in</h1>
        <p className="muted">
          Research OS access. Create a local account on first use (email
          confirmation is off in local Supabase).
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
