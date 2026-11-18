import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";

/** True below 768px, where the prototype's mobile layout takes over. */
export const useIsMobile = () =>
  useSyncExternalStore(
    (notify) => {
      const media = matchMedia(QUERY);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => matchMedia(QUERY).matches,
    () => false,
  );
