import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useSettings();
  const light =
    theme === "light" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  const toggle = () => setTheme(light ? "dark" : "light");

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      {...(className ? { className } : {})}
    >
      {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
