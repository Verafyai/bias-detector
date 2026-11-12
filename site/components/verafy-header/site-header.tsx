"use client";

import { ProductHeader } from "@/components/verafy-header/product-header";
import type {
  ProductId,
  VerafyHeaderLink,
} from "@/components/verafy-header/links";

/** Shared header entry for the Bias Detector. */
export function SiteHeader({
  product,
  links,
}: {
  product: ProductId;
  /** @deprecated Stage comes from lib/product-status.ts. */
  beta?: boolean;
  links: readonly VerafyHeaderLink[];
  showBack?: boolean;
}) {
  return (
    <ProductHeader
      product={product}
      links={links}
    />
  );
}


