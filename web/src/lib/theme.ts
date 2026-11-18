import { useEffect } from "react";
import type { Me } from "./types";

const KEY = "tf_theme";

/**
 * Applies the account's appearance (light, dark or follow the system) to
 * <html data-theme>. The choice is cached locally so index.html can apply it
 * before the first paint on the next load.
 */
export const useThemeSync = (theme: Me["theme"] | undefined) => {
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Only affects the first paint of the next visit.
    }
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      if (dark) document.documentElement.dataset.theme = "dark";
      else delete document.documentElement.dataset.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
};
