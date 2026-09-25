/* Toegangsbeveiliging: PBKDF2 (250.000 iteraties) + AES-GCM.
   In de code staat geen wachtwoord en geen simpele hash, enkel een versleutelde
   "marker"-waarde (salt/iv/ciphertext). Een login is pas geldig als het ingevoerde
   wachtwoord die marker correct kan ontsleutelen (AES-GCM verwerpt elke foute sleutel).
   Genereer je eigen configuratie via setup.html — dit bestand bevat bewust geen
   standaardwachtwoord. */

// Vul in via setup.html (nooit het wachtwoord zelf, enkel deze 3 velden):
const AUTH_CONFIG = {
  salt: "",
  iv: "",
  ciphertext: "",
};

const AUTH_MARKER = "klium-unlocked";
const AUTH_SESSION_KEY = "klium_auth_ok";
const PBKDF2_ITERATIONS = 250000;

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function deriveAesKey(password, saltBytes, usages) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

/** Encrypt the marker with a password-derived key — used only by setup.html. */
async function generateAuthConfig(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(AUTH_MARKER));
  return { salt: bufToBase64(salt), iv: bufToBase64(iv), ciphertext: bufToBase64(ciphertext) };
}

/** Attempt to unlock with a password — used only by login.html. Returns true/false. */
async function tryUnlock(password) {
  if (!AUTH_CONFIG.salt || !AUTH_CONFIG.iv || !AUTH_CONFIG.ciphertext) return false;
  try {
    const key = await deriveAesKey(password, base64ToBuf(AUTH_CONFIG.salt), ["decrypt"]);
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(AUTH_CONFIG.iv) }, key, base64ToBuf(AUTH_CONFIG.ciphertext)
    );
    return new TextDecoder().decode(plainBuf) === AUTH_MARKER;
  } catch {
    return false; // AES-GCM authentication failure = wrong password
  }
}

function isLoggedIn() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
}

function logout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  location.href = "login.html";
}

/** Call at the very top of protected pages (before rendering) to bounce unauthenticated visitors. */
function guardPage() {
  if (!isLoggedIn()) {
    const here = location.pathname.split("/").pop() || "index.html";
    location.replace("login.html?redirect=" + encodeURIComponent(here));
  }
}

