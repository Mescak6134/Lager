# Lager – Bestand, Einkäufe & Abrechnung

Eine App für Handy und PC, mit der mehrere Leute gemeinsam festhalten:

- **was gekauft wurde** (wann, wo, wie viel, zu welchem Preis, Charge, Rechnung),
- **wem was gehört** (auch wenn ein Einkauf aufgeteilt wird),
- **wo es liegt** (Lagerorte),
- **wer wem noch Geld schuldet** – und wie man das mit möglichst wenigen Zahlungen ausgleicht.

Die App läuft kostenlos auf **GitHub Pages**, die Daten liegen geschützt in einer kostenlosen **Supabase**-Datenbank.
Der Code ist öffentlich, **eure Daten nicht** – die sieht nur, wer eingeladen ist und sich einloggt.

---

## Erst mal ausprobieren (ohne Einrichtung)

App öffnen → **„Demo ansehen“**. Die Demo hat Beispieldaten (3 Personen, 10 Artikel, ~30 Buchungen).
Alles bleibt nur auf dem Gerät, nichts wird verschickt.

---

## Einrichten – einmalig, ca. 15 Minuten

Du brauchst nur einen Browser. Programmieren musst du nichts.

### Schritt 1 · Supabase-Projekt anlegen

1. Auf **https://supabase.com** gehen → **„Start your project“** → mit deinem GitHub-Konto anmelden.
2. **„New project“** anklicken.
3. Name: `lager` · Datenbank-Passwort: irgendein langes Passwort (aufschreiben, braucht man aber normalerweise nie wieder) · Region: **Central EU (Frankfurt)**.
4. **„Create new project“** – ca. 2 Minuten warten.

### Schritt 2 · Datenbank einrichten

1. In Supabase links auf **„SQL Editor“** → **„New query“**.
2. Die Datei **`supabase-setup.sql`** aus diesem Repository öffnen, alles kopieren und dort einfügen.
3. Ganz oben bei **SCHRITT A** deine **E-Mail-Adresse** und deinen **Namen** eintragen
   (statt `DEINE-EMAIL@BEISPIEL.DE` und `Admin`). Mit dieser E-Mail wirst du **Admin**.
4. Unten rechts auf **„Run“** klicken. Es muss **„Success“** erscheinen.
   - Steht da **„STOPP: Bitte oben bei SCHRITT A …“** → du hast die E-Mail noch nicht eingetragen.

### Schritt 3 · Anmelde-Einstellungen

In Supabase links **„Authentication“**:

1. **Sign In / Providers → Email**
   - **„Allow new users to sign up“: AN lassen.** Keine Sorge: Registrieren können sich trotzdem nur Leute,
     die vorher in der App eingeladen wurden – das prüft die Datenbank selbst.
   - **„Confirm email“: Empfehlung AUS** (einfacher, man kann sofort loslegen).
     Wenn du es AN lässt, bekommt jeder nach dem Registrieren eine E-Mail mit Bestätigungs-Link – auch ok.
2. **URL Configuration**
   - **Site URL:** die Adresse deiner App, z. B. `https://mescak6134.github.io/Lager/`
   - **Redirect URLs:** dieselbe Adresse nochmal hinzufügen.
   - (Wird für „Passwort vergessen“ und Bestätigungs-Links gebraucht.)

### Schritt 4 · Verbindung in `config.js` eintragen

1. In Supabase: **Project Settings** (Zahnrad) →
   - **Data API**: dort steht die **Project URL** (`https://xxxx.supabase.co`).
   - **API Keys**: den **Publishable key** kopieren (beginnt mit `sb_publishable_…`).
     Gibt es den nicht, den **„anon public“** Key nehmen.
2. Auf GitHub in diesem Repository die Datei **`config.js`** öffnen → Stift-Symbol (Bearbeiten).
3. Die zwei Werte einsetzen:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_KEY = 'sb_publishable_…';
   ```
4. **„Commit changes“** klicken.

> ⚠️ **Niemals** den **secret** / **service_role** Schlüssel eintragen! Der öffentliche Schlüssel ist dafür gemacht,
> sichtbar zu sein – die Daten sind trotzdem durch die Regeln in der Datenbank geschützt.

### Schritt 5 · GitHub Pages einschalten

1. Im Repository auf **Settings → Pages**.
2. **Source:** „Deploy from a branch“ · **Branch:** `main` und `/ (root)` → **Save**.
3. Nach 1–2 Minuten steht oben die Adresse der App (z. B. `https://mescak6134.github.io/Lager/`).
   Genau diese Adresse bei Schritt 3 als Site URL eintragen.

### Schritt 6 · Als Admin registrieren

App öffnen → **„Konto erstellen“** → genau die E-Mail aus Schritt 2 → Passwort (mind. 8 Zeichen) → fertig.

### Schritt 7 · Freunde einladen

In der App: **Mehr → Benutzer verwalten → Person einladen** → Name und E-Mail eintragen.
Danach **„Einladung teilen“** antippen und z. B. per WhatsApp schicken.
Die Person öffnet die App, tippt auf **„Konto erstellen“** und registriert sich mit genau dieser E-Mail.

### Schritt 8 · Auf dem Handy installieren

- **iPhone (Safari):** Teilen-Symbol → **„Zum Home-Bildschirm“** → „Hinzufügen“.
- **Android (Chrome):** Menü ⋮ → **„App installieren“**.

Danach startet die App wie eine normale App vom Startbildschirm.

---

## Was die App alles kann

| Bereich | Was geht |
|---|---|
| **Übersicht** | Kennzahlen (Artikel, Bestandswert, Ausgaben im Monat, offene Beträge), Ausgaben-Diagramm, Bestandswert je Person, Warnungen bei wenig Bestand, letzte Buchungen |
| **Bestand** | Alle Artikel mit Menge je Person, Filter nach Person / Lagerort / Kategorie, Suche, Barcode-Scan |
| **Artikel-Seite** | Foto, Bestand je Person, je Lagerort und je Charge, Durchschnittspreis, Wert, alle Buchungen |
| **Buchen** | **Einkauf** (aufteilen auf mehrere Personen, „bezahlt von“, Preis wird nach Menge aufgeteilt), **Abgang** (Verbrauch, Verkauf, Korrektur), **Übertragen** an andere Person oder **Umlagern** an anderen Ort |
| **Verlauf** | Alle Buchungen mit Filtern, Details, Löschen (eigene Buchungen; Admins alle) |
| **Abrechnung** | Kontostand je Person, **wenigste Zahlungen zum Ausgleichen**, „Ausgleich buchen“, Verlauf der Zahlungen |
| **Inventur** | Artikel der Reihe nach zählen, Unterschiede werden automatisch als Korrektur gebucht |
| **Stammdaten** | Artikel, Hersteller, Händler, Lagerorte, Kategorien – anlegen, bearbeiten, archivieren |
| **Suche** | Über Artikel, Hersteller, Händler, Lagerorte, Chargen und Rechnungsnummern |
| **Berichte** | Bestandsliste, Verlauf, Abrechnung zum **Drucken / als PDF**, CSV für Excel, komplette **Datensicherung** (JSON) |
| **Benutzer** | Admin lädt ein, vergibt Rollen (Admin / Mitglied), kann Zugang deaktivieren |
| **Protokoll** | Jede Änderung wird automatisch festgehalten: wer, wann, was – kann niemand bearbeiten oder löschen |
| **Offline** | Ohne Internet siehst du den zuletzt geladenen Stand (nur ansehen) |

Der **Barcode-Scanner** funktioniert in Browsern, die das unterstützen (z. B. Chrome auf Android).
Auf dem iPhone wird der Knopf einfach ausgeblendet – Artikel findet man dort über die Suche.

---

## Sicherheit – kurz erklärt

- **Nur Eingeladene** können sich registrieren. Wer nicht in der Liste steht, bekommt „nicht eingeladen“.
- Jede Tabelle ist mit **Row Level Security** geschützt: Ohne gültigen Login eines aktiven Mitglieds liefert die Datenbank **nichts**.
- **Bestand kann nicht unter 0** fallen – das prüft die Datenbank bei jeder Buchung (je Person, Lagerort und Charge).
- Buchungen kann man nicht nachträglich verändern, nur löschen – und auch das steht im Protokoll.
- **Fotos** liegen in einem privaten Speicher, nur Mitglieder bekommen kurzzeitig gültige Links.
- Nur **Admins** können Personen einladen, Rollen ändern oder den Zugang sperren. Es bleibt immer mindestens ein Admin.

---

## Häufige Fragen

**„Diese E-Mail-Adresse ist nicht eingeladen“**
→ Ein Admin muss die Person zuerst unter *Mehr → Benutzer verwalten* mit **genau dieser** E-Mail einladen.

**„Kein Zugang“ nach dem Login**
→ Die Person wurde deaktiviert oder mit einer anderen E-Mail eingeladen. Admin fragen.

**Die App zeigt „Die Datenbank ist noch nicht eingerichtet“**
→ Schritt 2 (SQL) wurde noch nicht ausgeführt oder ist fehlgeschlagen. Einfach nochmal ausführen – das schadet nicht.

**Passwort vergessen?**
→ Auf dem Login-Bildschirm „Passwort vergessen?“ – es kommt eine E-Mail mit Link. (Dafür muss Schritt 3 „URL Configuration“ stimmen.)

**Supabase hat das Projekt „pausiert“**
→ Kostenlose Supabase-Projekte schlafen nach ca. einer Woche ohne Benutzung ein. Im Supabase-Dashboard auf **„Restore project“** klicken – die Daten bleiben erhalten.

**Wie bekomme ich eine neue Version der App aufs Handy?**
→ Automatisch: Sobald das Handy online ist, lädt die App die neueste Version.

---

## Technik (für Neugierige)

- Reines HTML/CSS/JavaScript, kein Build-Schritt. Läuft direkt auf GitHub Pages.
- `index.html`, `style.css` – Oberfläche · `js/` – App-Logik · `js/views/` – die einzelnen Seiten
- `js/db.js` – Datenzugriff (Supabase oder lokale Demo) · `js/calc.js` – Bestand, Werte, Schulden, Ausgleich
- `supabase-setup.sql` – komplette Datenbank: Tabellen, Regeln (RLS), Prüfungen, Protokoll, Foto-Speicher
- `sw.js` + `manifest.webmanifest` – damit es eine installierbare App (PWA) ist und offline startet
- `vendor/supabase-2.117.3.js` – die offizielle Supabase-Bibliothek (MIT-Lizenz), fest eingebunden
