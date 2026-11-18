import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { z } from "zod";
import { hasSession } from "@/lib/auth";

export const Route = createFileRoute("/register")({
  validateSearch: z.object({ next: z.string().optional() }),
  beforeLoad: () => {
    if (hasSession()) throw redirect({ to: "/" });
  },
  component: function Register() {
    const { next } = Route.useSearch();
    return <AuthForm mode="register" next={next} />;
  },
});
