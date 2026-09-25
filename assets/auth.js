/* Lichte client-side toegangsdrempel — GEEN echte beveiliging.
   De site staat op een publieke repo; HTML/JS/data blijven rechtstreeks opvraagbaar.
   Enkel bedoeld om toevallige bezoekers tegen te houden. Stel je eigen code in via
   PASSPHRASE_HASH (zie README.md voor hoe je zelf een hash genereert) — zet nooit de
   platte-tekst code in dit bestand of in commit-historiek. */
(function () {
  const PASSPHRASE_HASH = ""; // vul hier je eigen SHA-256 hash in (zie README.md)
  const SESSION_KEY = "klium_auth_ok";

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function unlock() {
    document.documentElement.classList.remove("auth-lock");
    const overlay = document.getElementById("authOverlay");
    if (overlay) overlay.remove();
  }

  function showOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "authOverlay";
    overlay.className = "auth-overlay";
    overlay.innerHTML = `
      <div class="auth-box">
        <h2>Klium &mdash; intern gebruik</h2>
        <p class="note">Voer de toegangscode in om verder te gaan.</p>
        <input type="password" id="authInput" placeholder="Toegangscode" autocomplete="off">
        <button id="authSubmit">Doorgaan</button>
        <div id="authError" class="status-msg error hidden">Onjuiste code.</div>
        <p class="note" style="margin-top:14px;">Let op: dit is enkel een drempel, geen echte beveiliging &mdash; deze site staat op een publieke repo.</p>
      </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById("authInput");
    const err = document.getElementById("authError");

    async function attempt() {
      const hash = await sha256Hex(input.value);
      if (hash === PASSPHRASE_HASH) {
        sessionStorage.setItem(SESSION_KEY, "1");
        unlock();
      } else {
        err.classList.remove("hidden");
        input.value = "";
        input.focus();
      }
    }

    document.getElementById("authSubmit").addEventListener("click", attempt);
    input.addEventListener("keydown", e => { if (e.key === "Enter") attempt(); });
    input.focus();
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    unlock();
  } else {
    showOverlay();
  }
})();
