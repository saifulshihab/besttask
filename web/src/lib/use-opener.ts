import { useState } from "react";

/**
 * Remembers which element had focus when a dialog opened, for dialogs opened
 * from state rather than a Base UI trigger (which Base UI would remember
 * itself). Pass the result as the popup's `finalFocus`, so closing returns
 * the keyboard user to where they were.
 */
export function useOpener(open: boolean) {
  const [state, setState] = useState<{ open: boolean; el: HTMLElement | null }>({ open: false, el: null });
  // Captured in render, before the dialog mounts and moves focus inside it.
  if (open !== state.open)
    setState({ open, el: open ? (document.activeElement as HTMLElement | null) : state.el });
  return () => (state.el?.isConnected ? state.el : true);
}
