export type VerafyHeaderLink = { label: string; href: string };

/** This app serves one product. The canonical header draws the rest of the Verafy family. */
export type ProductId = "bias-detector";

export const PRODUCT_HOMES: Record<ProductId, { name: string; home: string; ariaLabel: string; lockup?: string }> = {
  "bias-detector": { name: "Bias Detector", home: "/bias", ariaLabel: "Bias Detector home" },
};

/** Header cap is three. The lockup is the home, so Overview is not a link. */
export const BIAS_LINKS: readonly VerafyHeaderLink[] = [
  { label: "Leaderboard", href: "/bias/leaderboard" },
  { label: "Method", href: "/bias/method" },
  { label: "Benchmark", href: "/bias/benchmark" },
];

/** Pages that left the header stay reachable from the footer. */
export const BIAS_FOOTER_LINKS: readonly VerafyHeaderLink[] = [
  { label: "Questions", href: "/bias/questions" },
  { label: "Models", href: "/bias/models" },
  { label: "Runs", href: "/bias/runs" },
  ...BIAS_LINKS,
];

export function linkIsCurrent(pathname: string, href: string): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/$/, "") || "/";
  const target = (href.split("?")[0] || "/").replace(/\/$/, "") || "/";
  if (target === "/bias") return path === "/bias";
  return path === target || path.startsWith(`${target}/`);
}
