import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The column every workspace-level page (Activity, Members, Settings, Profile,
 * Account) sits in. One width for all, so the title doesn't shift between
 * pages. `tinted` puts white cards on the grey page used by settings screens.
 */
export function Page({ children, tinted = false }: { children: ReactNode; tinted?: boolean }) {
  return (
    <div className={cn("flex flex-1 justify-center", tinted && "bg-row-hover")}>
      <div className="box-border flex w-full max-w-[760px] flex-col gap-[18px] px-7 pt-6 pb-10 max-sm:px-4">
        {children}
      </div>
    </div>
  );
}

/** Title, one line of context, and optional actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.01em]">{title}</h1>
        <p className="m-0 text-sm text-muted">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
