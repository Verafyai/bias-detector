import { providerName } from "@/lib/bias/roster";
import logos from "@/lib/bias/logos.json";

/** Monograms only for providers with no cached OpenRouter icon. */
const MONOGRAMS: Record<string, { letters: string; bg: string; fg: string }> = {
  xai: { letters: "x", bg: "#0a0a0a", fg: "#fafafa" },
  zai: { letters: "Z", bg: "#1d4ed8", fg: "#ffffff" },
  amazon: { letters: "Az", bg: "#232f3e", fg: "#ff9900" },
  nvidia: { letters: "Nv", bg: "#76b900", fg: "#0c1400" },
  minimax: { letters: "Mm", bg: "#6d28d9", fg: "#ffffff" },
  nous: { letters: "No", bg: "#3f3f46", fg: "#fafafa" },
  stepfun: { letters: "St", bg: "#0f766e", fg: "#ecfeff" },
};

function monogram(provider: string) {
  const known = MONOGRAMS[provider];
  if (known) return known;
  const name = providerName(provider);
  return { letters: name.slice(0, 2), bg: "#3f3f46", fg: "#fafafa" };
}

export function ProviderLogo({ provider, size = 28, className = "" }: { provider: string; size?: number; className?: string }) {
  const name = providerName(provider);
  const src = (logos as Record<string, string>)[provider];
  if (src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local cached icon */}
        <img src={src} alt={name} width={size - 6} height={size - 6} className="object-contain" />
      </span>
    );
  }
  const mark = monogram(provider);
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={name} className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="8" fill={mark.bg} />
      <text x="16" y="21" textAnchor="middle" fill={mark.fg} fontFamily="Inter, Arial, sans-serif" fontSize={mark.letters.length > 1 ? 11 : 14} fontWeight="700">
        {mark.letters}
      </text>
    </svg>
  );
}
