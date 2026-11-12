import { CopyButton } from "@/components/bias/copy-button";
import { MCP_CONFIG, MCP_TOOLS, METHOD, REPO_URL } from "@/lib/bias/copy";

export const metadata = { title: { absolute: "Method · Verafy Bias Detector" } };

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 pt-8">
      <h1 className="text-3xl font-semibold tracking-tight">Method</h1>
      {METHOD.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-xl font-semibold">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className="leading-7 text-muted-foreground">{paragraph}</p>
          ))}
        </section>
      ))}

      <section className="space-y-4" id="mcp">
        <h2 className="text-xl font-semibold">Use it from your own agent</h2>
        <p className="text-muted-foreground">
          Add this to your MCP config to use the Bias Detector from Claude Code, Cursor, or any other MCP client. The
          server is the verafy-bias-mcp bin on the @verafy/bias package. These are the tools it exposes.
        </p>
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2 text-sm text-muted-foreground">
            <span>MCP config</span>
            <CopyButton text={MCP_CONFIG} />
          </div>
          <pre className="overflow-x-auto p-4 text-sm"><code>{MCP_CONFIG}</code></pre>
        </div>
        <ul className="space-y-1 text-sm">
          {MCP_TOOLS.map(([name, line]) => (
            <li key={name}>
              <code className="font-semibold">{name}</code> <span className="text-muted-foreground">{line}</span>
            </li>
          ))}
        </ul>
        <p>
          <a href={REPO_URL} className="text-teal-600 underline dark:text-teal-300">Source on GitHub</a>
        </p>
      </section>
    </div>
  );
}
