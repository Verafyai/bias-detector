"use client";

import Script from "next/script";
import {
  PRODUCT_HOMES,
  type ProductId,
  type VerafyHeaderLink,
} from "@/components/verafy-header/links";
import { productStage } from "@/lib/product-status";
import { CANONICAL_HEADER_SRC, CANONICAL_PRODUCT, linksAttribute } from "@/components/verafy-header/canonical";
import "./product-header.css";

/**
 * Every Verafy product header is the canonical <verafy-header> web component,
 * served from www.verafy.ai, so all Verafy sites share one header, one credits
 * badge and checkout, one sign-in and one analytics setup. This app supplies the
 * product, its home, its stage and its links.
 *
 * The outer .product-header element stays so layout code that measures the
 * header (the Forecast map tooltips) keeps working.
 */
export function ProductHeader({
  product,
  links,
  badge,
}: {
  product: ProductId;
  links: readonly VerafyHeaderLink[];
  /** @deprecated The pill comes from lib/product-status.ts; kept so old callers compile. */
  badge?: string;
}) {
  void badge;
  const home = PRODUCT_HOMES[product];
  const stage = productStage(product) ?? "none";
  // Shared Verafy credits product id for the canonical header badge.
  const credits = "shared";

  return (
    <header className="product-header" data-site-header data-product={product}>
      <Script src={CANONICAL_HEADER_SRC} strategy="afterInteractive" />
      <verafy-header
        product={CANONICAL_PRODUCT[product]}
        name={home.lockup ?? home.name}
        home={home.home}
        stage={stage}
        credits={credits}
        links={linksAttribute(links)}
      />
    </header>
  );
}


