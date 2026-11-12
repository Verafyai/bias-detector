import type { ProductId, VerafyHeaderLink } from "./links";

/** This app's product id, mapped to the id in the canonical header's registry. */
export const CANONICAL_PRODUCT: Record<ProductId, string> = {
  "bias-detector": "bias-detector",
};

export const CANONICAL_HEADER_SRC = "https://www.verafy.ai/header/v1/verafy-header.js";

/** The links attribute the canonical header reads: "Label:/href, Label:/href". */
export function linksAttribute(links: readonly VerafyHeaderLink[]): string {
  return links.map((link) => `${link.label}:${link.href}`).join(", ");
}
