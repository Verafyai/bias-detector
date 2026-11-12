import type { DetailedHTMLProps, HTMLAttributes } from "react";

type VerafyHeaderProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  product?: string;
  name?: string;
  home?: string;
  stage?: string;
  credits?: string;
  links?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "verafy-header": VerafyHeaderProps;
    }
  }
}
