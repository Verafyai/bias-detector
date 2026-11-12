// Caches provider icons from OpenRouter into public/logos at build time, so the
// site never hotlinks. A provider with no OpenRouter icon falls back to a monogram.
// Run: node scripts/cache-logos.mjs   (the build runs it; a failed fetch keeps the cached file)
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";

const ICONS = {
  openai: "OpenAI.svg",
  anthropic: "Anthropic.svg",
  google: "GoogleGemini.svg",
  deepseek: "DeepSeek.png",
  mistral: "Mistral.png",
  meta: "Meta.png",
  qwen: "Qwen.png",
  moonshot: "MoonshotAI.png",
  cohere: "Cohere.png",
  microsoft: "Microsoft.svg",
  perplexity: "Perplexity.svg",
};

const dir = path.join(process.cwd(), "public/logos");
await mkdir(dir, { recursive: true });
const manifest = {};
for (const [provider, file] of Object.entries(ICONS)) {
  const ext = path.extname(file);
  const out = path.join(dir, `${provider}${ext}`);
  try {
    const res = await fetch(`https://openrouter.ai/images/icons/${file}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(String(res.status));
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    manifest[provider] = `/logos/${provider}${ext}`;
  } catch (error) {
    try {
      await access(out);
      manifest[provider] = `/logos/${provider}${ext}`;
    } catch {
      console.warn(`logo ${provider}: ${error.message}; monogram fallback`);
    }
  }
}
await writeFile(path.join(process.cwd(), "lib/bias/logos.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`cached ${Object.keys(manifest).length} provider logos`);
