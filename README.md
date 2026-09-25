# Klium Merk Onboarding-analyse (webtool)

Statische, client-side webtool om een volledige Akeneo CSV-productexport te analyseren
en te bepalen of een merk klaar is voor Klium. Draait volledig in de browser (geen
backend, geen data verlaat je toestel tenzij je zelf een snapshot deelt) en is
rechtstreeks bruikbaar via **GitHub Pages**.

## Toegangscode

`index.html` en `history.html` sturen niet-ingelogde bezoekers meteen door naar `login.html`
(niets van de inhoud wordt getoond voordat je bent ingelogd). De code zelf wordt **niet** als
platte tekst of eenvoudige hash bewaard: `assets/auth.js` bevat enkel een versleutelde
"marker"-waarde (salt/iv/ciphertext, AES-GCM met een PBKDF2-afgeleide sleutel uit je
wachtwoord, 250.000 iteraties). Een login klopt pas als het ingevoerde wachtwoord die marker
correct kan ontsleutelen.

**Instellen (eenmalig, lokaal, niemand anders ziet je wachtwoord):**
1. Open `setup.html` in je browser.
2. Kies een toegangscode, klik **Genereer**.
3. Kopieer het weergegeven `AUTH_CONFIG`-blok naar `assets/auth.js` (vervang de lege waarden).
4. Commit en push.

Uitloggen kan via de "Uitloggen"-link in de navigatie (wist de sessie in deze browser).

Belangrijk om te weten: dit is sterker dan een simpele hash-vergelijking, maar blijft
client-side beveiliging op een publieke repo &mdash; de versleutelde configuratie is zelf ook
publiek zichtbaar en dus in theorie offline te bruteforcen (al maakt PBKDF2 dat traag/duur per
poging). Voor data die écht nooit publiek mag zijn, is een priv&eacute; repo + Pages-toegangsbeperking
(GitHub Pro/Team/Enterprise) of een host met server-side auth (Cloudflare Access, Netlify
password protection) de enige echte oplossing.

## Gebruik

1. Open `index.html` (lokaal, of via de GitHub Pages-URL van dit project).
2. Sleep de Akeneo-export (`.csv`, puntkomma-gescheiden) in de dropzone, geef het merk een naam.
3. Klik **Analyseer** → het volledige rapport (KPI's, assortiment, prijs, content,
   logistiek, werklijst, conclusie, productlijst) verschijnt.
4. Bewaar het resultaat:
   - **Opslaan in geschiedenis (dit toestel)** → direct beschikbaar op `history.html`,
     enkel in deze browser (localStorage).
   - **Download JSON-snapshot** → voor permanente/gedeelde opslag, zie hieronder.

## Permanente/gedeelde geschiedenis via GitHub

`history.html` toont zowel lokale (per toestel) als **gedeelde** analyses. Gedeelde
analyses staan als JSON-bestand in `data/history/` en worden vermeld in
`data/history/manifest.json`. Om een analyse blijvend te delen met het team:

1. Klik **Download JSON-snapshot** in de tool.
2. Plaats het gedownloade bestand in `webtool/data/history/`.
3. Voeg de bestandsnaam toe aan de array in `webtool/data/history/manifest.json`, bv.:
   ```json
   ["abus_2026-09-25.json", "ander_merk_2026-10-02.json"]
   ```
4. Commit en push. Na publicatie via GitHub Pages ziet iedereen de analyse terug in
   `history.html` onder "gedeeld", inclusief vergelijking met andere merken.

## Publiceren via GitHub Pages

- Zet deze `webtool/` map in een repo (of gebruik een subfolder van een bestaande repo).
- Reposettings → Pages → bron: branch + map `webtool` (of root, als je de inhoud
  verplaatst naar de repo-root).
- De site werkt met relatieve paden (`assets/...`, `data/history/...`), dus geen
  verdere configuratie nodig.

## Beoordelingscriteria (herbruikbaar, aanpasbaar in `assets/analysis.js`)

- **Foto's**: minstens 1 verplicht; meerdere is bonus (apart gerapporteerd).
- **NL lange omschrijving**: altijd verplicht; kwaliteitscheck op hergebruikte/generieke
  tekst (gedeeld met &ge;2 producten).
- **Desc_scope (leveringsomvang)**: enkel verplicht wanneer titel/categorie wijst op een
  set/kit/koffer/machine (keyword-heuristiek in `CRITERIA.scopeKeywords`).
- **Desc_optional / Title_B2C**: genegeerd.
- **Klium productnaam / title suffix**: informatief, telt niet mee als blokkerend punt
  (wordt pas ingevuld bij live-zetten).
- **Afmetingen/gewicht**: moeten aanwezig én &gt; 0 zijn (0x0x0 of 0 kg wordt als fout
  beschouwd, niet als "aanwezig").
- **Prijs**: gemiddelde/mediaan/range + verdeling in prijsbuckets, gebruikt voor
  positioneringsadvies.

Kolomnamen kunnen per export verschillen (bv. andere locale-code). Gebruik het
"Geavanceerd"-paneel op de analysepagina om veldnamen te overschrijven zonder code aan
te passen.
