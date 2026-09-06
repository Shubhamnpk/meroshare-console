import { cn } from "@/lib/utils";

const FLAG_CDN = "https://flagcdn.com";

/**
 * Renders a real flag icon from flagcdn.com using the ISO-3166 alpha-2 code.
 * Falls back to the emoji flag if the image fails to load.
 */
export function CountryFlag({
  code,
  emoji,
  className,
  size = 16,
}: {
  code?: string | null | undefined;
  emoji?: string | null | undefined;
  className?: string;
  size?: number;
}) {
  const cc = (code ?? "").trim().toUpperCase();
  const valid = /^[A-Z]{2}$/.test(cc);

  if (!valid && !emoji) return null;

  if (!valid) {
    return (
      <span className={cn("inline-block leading-none", className)} style={{ fontSize: size }}>
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={`${FLAG_CDN}/w40/${cc.toLowerCase()}.png`}
      alt=""
      width={size}
      height={Math.round(size * 0.75)}
      className={cn("inline-block rounded-sm object-cover", className)}
      loading="lazy"
      onError={(e) => {
        // Swap to emoji fallback on load failure
        const img = e.currentTarget;
        if (emoji) {
          img.style.display = "none";
          const span = document.createElement("span");
          span.textContent = emoji;
          span.className = img.className;
          span.style.fontSize = `${size}px`;
          img.parentElement?.appendChild(span);
        }
      }}
    />
  );
}
