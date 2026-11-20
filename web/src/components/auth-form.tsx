import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { keys } from "@/lib/queries";
import type { AuthResponse } from "@/lib/types";

type Mode = "login" | "register";

const copy = {
  login: {
    title: "Sign in to TaskFlow",
    lead: "Plan work, track tasks, keep the trail.",
    submit: "Sign in",
    switchText: "New to TaskFlow?",
    switchLink: "Create an account",
  },
  register: {
    title: "Create your account",
    lead: "You can create a workspace right after.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
  },
} as const;

/** The prototype's signed-out card, used for both sign-in and sign-up. */
export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const text = copy[mode];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<AuthResponse>(`/auth/${mode}`, {
        method: "POST",
        anonymous: true,
        body: mode === "login" ? { email, password } : { name, email, password },
      });
      // A previous user's cached data must not leak into this session.
      qc.clear();
      qc.setQueryData(keys.me, result.user);
      setTokens(result.tokens);
      // Only same-app paths are followed, never an absolute URL.
      const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
      await navigate({ href: target, replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "NETWORK", "Could not reach TaskFlow. Try again."),
      );
    } finally {
      setPending(false);
    }
  };

  const fieldError = (path: string) => error?.fieldErrors[path];
  const formError = error && error.details.length === 0 ? error.message : undefined;

  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-6">
      <div className="flex w-full max-w-[380px] flex-col gap-3.5 rounded-xl border border-line bg-canvas p-7">
        <span className="flex size-10 items-center justify-center self-center rounded-lg bg-accent font-bold text-white">
          TF
        </span>
        <div className="flex flex-col gap-1 text-center">
          <h1 className="m-0 text-lg font-bold">{text.title}</h1>
          <p className="m-0 text-sm text-muted">{text.lead}</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
          {mode === "register" ? (
            <Field label="Full name" error={fieldError("name")}>
              <Input
                autoComplete="name"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Safwan Ayaan"
              />
            </Field>
          ) : null}
          <Field label="Email address" error={fieldError("email")}>
            <Input
              type="email"
              autoComplete="email"
              autoFocus={mode === "login"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </Field>
          <Field
            label="Password"
            hint={mode === "register" ? "At least 8 characters." : undefined}
            error={fieldError("password")}
          >
            <Input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {formError ? (
            <p role="alert" className="m-0 text-xs text-danger">
              {formError}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="xl" disabled={pending} className="justify-center">
            {pending ? "Please wait…" : text.submit}
          </Button>
        </form>
        <p className="m-0 text-center text-sm text-muted">
          {text.switchText}{" "}
          <Link
            to={mode === "login" ? "/register" : "/login"}
            search={next ? { next } : {}}
            className="font-medium"
          >
            {text.switchLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
