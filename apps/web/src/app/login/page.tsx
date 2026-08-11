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
          Research OS access. Sign in with your Power Fund account, or create
          one on first use.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
