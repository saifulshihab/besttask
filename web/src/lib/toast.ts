import { toast as sonner } from "sonner";
import { api } from "./api";
import type { Recovery } from "./types";

/**
 * The app's only entry point to the toast library. Import from here, never
 * from "sonner" directly, so swapping libraries touches this file alone.
 * `<Toaster />` (components/ui/toaster.tsx) renders them.
 */
export const toast = sonner;

/** Shows an API or unexpected error as an error toast. */
export const toastError = (error: unknown, prefix?: string) => {
  const message = error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
  return sonner.error(prefix ? `${prefix}: ${message}` : message);
};

/**
 * A toast with an Undo button for the server's recovery window (six seconds).
 * `onUndone` restores whatever the caller hid.
 */
export const undoToast = (message: string, recovery: Recovery, onUndone: () => Promise<unknown> | void) => {
  const remaining = Math.max(1000, Date.parse(recovery.expiresAt) - Date.now());
  sonner(message, {
    duration: remaining,
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await api(`/recovery/${recovery.recoveryId}/undo`, { method: "POST" });
          await onUndone();
          sonner("Restored");
        } catch (error) {
          // Most often the window has passed; nothing changed.
          toastError(error);
        }
      },
    },
  });
};
