"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/verafy-header/site-header";
import { BIAS_FOOTER_LINKS, BIAS_LINKS } from "@/components/verafy-header/links";
import { EXPLORER_URL, PRODUCT_LINE, REPO_URL } from "@/lib/bias/copy";

export function BiasShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-clip bg-background text-foreground">
      <SiteHeader product="bias-detector" links={BIAS_LINKS} />
      <div className="bias-shell-main mx-auto w-full min-w-0 max-w-6xl px-4 pb-16 max-[480px]:px-3">{children}</div>
      <footer className="border-t border-border bg-background text-zinc-600 dark:text-zinc-400">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Bias Detector</h2>
            <p className="text-base leading-6">{PRODUCT_LINE}</p>
          </div>
          <div>
            <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">In this product</h2>
            <ul className="space-y-2 text-base">
              {BIAS_FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-teal-600 dark:hover:text-teal-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Verafy</h2>
            <ul className="space-y-2 text-base">
              <li>
                <a href={EXPLORER_URL} className="hover:text-teal-600 dark:hover:text-teal-400">
                  Verafy Explorer
                </a>
              </li>
              <li>
                <a href={REPO_URL} className="hover:text-teal-600 dark:hover:text-teal-400">
                  Source on GitHub
                </a>
              </li>
              <li>
                <a href="https://www.verafy.ai/" className="hover:text-teal-600 dark:hover:text-teal-400">
                  About Verafy
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
