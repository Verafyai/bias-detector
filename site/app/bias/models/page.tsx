import Link from "next/link";
import { ProviderLogo } from "@/components/bias/provider-logo";
import { rosterStatus } from "@/lib/bias/site";

export const metadata = { title: { absolute: "Models · Verafy Bias Detector" } };

export default function ModelsPage() {
  const rows = rosterStatus();
  return (
    <div className="space-y-6 pt-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Models</h1>
        <p className="mt-2 text-muted-foreground">
          The standing roster of {rows.length} models. {rows.filter((row) => row.card).length} have a measured report card;
          the rest are marked not yet measured and show no score.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ model, card }) => (
          <li key={model.id}>
            <Link href={`/bias/models/${model.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-teal-500">
              <ProviderLogo provider={model.provider} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{model.name}</span>
                <span className="text-xs text-muted-foreground">{model.id}</span>
              </span>
              {card ? (
                <span className="text-right">
                  <span className="block font-semibold">{card.card.magnitude.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">measured</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Not yet measured</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
