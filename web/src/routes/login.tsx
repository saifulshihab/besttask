import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { AuthForm } from "@/components/auth-form";
import { hasSession } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ next: z.string().optional() }),
  beforeLoad: () => {
    if (hasSession()) throw redirect({ to: "/" });
  },
  component: function Login() {
    const { next } = Route.useSearch();
    return <AuthForm mode="login" next={next} />;
  },
});
