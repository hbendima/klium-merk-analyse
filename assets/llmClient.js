/* Client voor de LLM-beoordelingsproxy (Cloudflare Worker -> GitHub Models).
   Vul WORKER_URL in na het deployen van de Worker (zie webtool/worker/README of hoofd-README).
   Zonder ingevulde URL blijft de AI-check-knop gewoon een duidelijke foutmelding tonen —
   de rest van de tool werkt normaal verder. */
const LLM_WORKER_URL = ""; // bv. "https://klium-merk-analyse-llm.jouw-account.workers.dev/judge"

async function judgeWithLLM(kind, text, context) {
  if (!LLM_WORKER_URL) {
    throw new Error("LLM_WORKER_URL is niet ingesteld in assets/llmClient.js — zie README.");
  }
  const res = await fetch(LLM_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, text, context }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM-check mislukt (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json(); // { verdict, reason }
}
