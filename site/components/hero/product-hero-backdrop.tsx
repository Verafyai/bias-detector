import "./product-hero-backdrop.css";
import "./product-hero.css";

type ProductHeroBackdropProps = {
  /** Single optimized raster, used by Verafy Forecast. */
  src?: string;
  /** Swarm and Bias home art: AVIF with a WebP fallback. */
  avifSrc?: string;
  webpSrc?: string;
  width?: number;
  height?: number;
  /** True for the Swarm/Bias home hero, which is the LCP image. */
  priority?: boolean;
};

/**
 * Decorative hero art. The bottom edge fades into the page background.
 * Pass either `src` or `avifSrc` + `webpSrc`. Do not point either at a
 * multi-megabyte SVG.
 */
export function ProductHeroBackdrop({
  src,
  avifSrc,
  webpSrc,
  width = 1168,
  height = 784,
  priority = false,
}: ProductHeroBackdropProps) {
  const image = avifSrc && webpSrc ? webpSrc : src;
  if (!image) return null;

  return (
    <div className="product-hero-backdrop" aria-hidden="true">
      <div className="product-hero-backdrop__art">
        {avifSrc && webpSrc ? (
          <picture>
            <source srcSet={avifSrc} type="image/avif" />
            <img
              src={webpSrc}
              alt=""
              width={width}
              height={height}
              decoding="async"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "low"}
            />
          </picture>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- already a sized WebP; low priority so the heading stays the LCP */
          <img
            src={image}
            alt=""
            width={width}
            height={height}
            decoding="async"
            fetchPriority="low"
          />
        )}
      </div>
    </div>
  );
}


