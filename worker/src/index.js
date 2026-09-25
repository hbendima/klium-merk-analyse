// Cloudflare Worker: proxieert LLM-beoordelingen naar GitHub Models.
// De GitHub-token staat NOOIT in deze broncode — enkel als Worker-secret (env.GITHUB_MODELS_TOKEN),
// ingesteld via `wrangler secret put GITHUB_MODELS_TOKEN`. Zie ../README.md voor setup-instructies.
//
// Endpoint/model-naam: geverifieerd tegen de GitHub Models documentatie op het moment van schrijven
// (https://docs.github.com/en/github-models). Controleer dit bij setup, want dit kan wijzigen.
const GITHUB_MODELS_URL = "https://models.github.ai/inference/chat/completions";
const MODEL = "openai/gpt-4o-mini";

// Enkel toestaan vanaf je eigen (Pages-)origin(s) — pas aan naar jouw echte domein(en).
const ALLOWED_ORIGINS = [
  "https://hbendima.github.io",
  "http://localhost:8080",
  "null",
];

const MAX_TEXT_LENGTH = 3000;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function buildPrompt(kind, text, context) {
  if (kind === "description") {
    return [
      { role: "system", content: "Je bent een e-commerce contentbeoordelaar voor Klium (Belgische B2B/B2C webshop, bouw/beveiliging/gereedschap). Antwoord ALTIJD met strikt JSON: {\"verdict\":\"goed|twijfel|zwak\",\"reason\":\"<max 2 zinnen, Nederlands>\"}. Geen andere tekst." },
      { role: "user", content: `Beoordeel deze productomschrijving op kwaliteit, volledigheid en of ze productspecifiek genoeg is (niet generiek/hergebruikt voor een ander product).\n\nProduct: ${context?.name || "(onbekend)"} (${context?.family || "onbekende categorie"})\n\nOmschrijving:\n${text}` },
    ];
  }
  if (kind === "scope") {
    return [
      { role: "system", content: "Je bent een productdata-analist voor Klium. Antwoord ALTIJD met strikt JSON: {\"verdict\":\"ja|nee|twijfel\",\"reason\":\"<max 2 zinnen, Nederlands>\"}. Geen andere tekst." },
      { role: "user", content: `Heeft dit product een 'leveringsomvang' (wat zit er in de doos) nodig, bijvoorbeeld omdat het een set/kit/koffer is of een machine met accessoires? Of is het een enkelvoudig standaardproduct waarvoor dit niet nodig is?\n\nProductnaam: ${context?.name || text}\nCategorie/familie: ${context?.family || "(onbekend)"}` },
    ];
  }
  throw new Error("Onbekend beoordelingstype: " + kind);
}

async function handleJudge(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Ongeldige JSON-body" }), { status: 400, headers: corsHeaders(origin) });
  }

  const { kind, text, context } = body || {};
  if (!kind || !text) {
    return new Response(JSON.stringify({ error: "kind en text zijn verplicht" }), { status: 400, headers: corsHeaders(origin) });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return new Response(JSON.stringify({ error: `text mag max ${MAX_TEXT_LENGTH} tekens zijn` }), { status: 400, headers: corsHeaders(origin) });
  }

  let messages;
  try {
    messages = buildPrompt(kind, text, context);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders(origin) });
  }

  const upstream = await fetch(GITHUB_MODELS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GITHUB_MODELS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 200 }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: "GitHub Models-fout", detail: errText }), {
      status: 502, headers: corsHeaders(origin),
    });
  }

  const data = await upstream.json();
  const raw = data?.choices?.[0]?.message?.content || "";

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    parsed = { verdict: "onbekend", reason: raw.slice(0, 300) };
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/judge") {
      return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
    }
    return handleJudge(request, env, origin);
  },
};
