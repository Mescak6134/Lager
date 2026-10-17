# Lager – was gehört wem?

Eine einfache App fürs iPhone (und jeden Browser): Jeder sieht, **was ihm gehört** –
mit **Menge**, **Einzelwert** und **Gesamtwert**. Dazu eine **Inventurliste** zum Drucken oder als PDF.

- Anmelden mit **Benutzername + Passwort** und einem **6-stelligen Code** (Zwei-Faktor, auf dem iPhone per Face ID).
- Höchstens **3 Benutzer**.
- Die App läuft auf **https://pyrolagern.de** (GitHub Pages), die Daten liegen geschützt bei **Supabase**.

Ausprobieren ohne Einrichtung: App öffnen → **„Andere Datenbank / Demo“** → **„Demo ansehen“** (nur Beispieldaten, nur auf dem Gerät).

---

## Einrichten (einmalig, ca. 10 Minuten)

### 1 · Datenbank-Skript ausführen
1. In **Supabase** links **SQL Editor** → **New query**.
2. Die Datei **`supabase-setup.sql`** öffnen und ganz oben bei **SCHRITT A** eintragen:
   - deinen **Benutzernamen** (statt `BENUTZERNAME`, z. B. `mesut` – nur a–z, 0–9, Punkt, Minus),
   - deinen **Namen** (statt `Anzeigename`, z. B. `Mesut`).
3. Alles kopieren, in Supabase einfügen, **Run**. Unten muss **Success** stehen.

> ⚠️ Findet das Skript noch die alte Version der App, löscht es **alles** (Tabellen und alle Konten) und baut neu auf.
> Später darf es jederzeit nochmal laufen – dann bleiben eure Daten erhalten.

### 2 · Einstellungen in Supabase (Authentication)
- **Sign In / Providers → Email**
  - **Allow new users to sign up: AN** (wird zum Anlegen von Benutzern gebraucht)
  - **Confirm email: AUS** (an die Benutzernamen geht keine E-Mail)
- **Multi-Factor**: **TOTP** muss an sein (ist normalerweise schon so).
- **URL Configuration → Site URL:** `https://pyrolagern.de`

### 3 · Ersteinrichtung in der App
App öffnen → unten **„Ersteinrichtung (Admin)“** → deinen Benutzernamen und ein **neues Passwort** eintragen →
**Zwei-Faktor einrichten** (siehe unten) → fertig.

### 4 · Freunde anlegen
**Mehr → Benutzer verwalten → Benutzer anlegen**: Name, Benutzername, Startpasswort (wird vorgeschlagen).
Danach erscheint ein Text mit Adresse, Benutzername und Startpasswort → **Teilen** oder **Kopieren** und z. B. per WhatsApp schicken.
Beim ersten Anmelden legt jeder ein **eigenes Passwort** fest und richtet die **Zwei-Faktor-Anmeldung** ein.

### 5 · Optional: Registrierung abschalten
Wenn alle angelegt sind: in Supabase **Allow new users to sign up** wieder **AUS**.
Für einen neuen Benutzer später kurz **AN**, anlegen, wieder **AUS**. (Die App sagt Bescheid, wenn es aus ist.)

### 6 · Aufs iPhone holen
In **Safari** pyrolagern.de öffnen → **Teilen-Symbol** → **„Zum Home-Bildschirm“** → **Hinzufügen**.
Die App bleibt angemeldet – auch nach dem Schließen. Nur auf einem neuen Gerät fragt sie wieder nach Passwort und Code.

---

## Zwei-Faktor einrichten (iPhone)
1. Auf **„Zur iPhone-Passwörter-App hinzufügen“** tippen.
2. Die Passwörter-App fragt, wo der Code hin soll → Eintrag für **pyrolagern.de** wählen (oder neu anlegen).
3. Zurück in die App und den **6-stelligen Code** eingeben.

Ab dann schlägt das iPhone den Code bei der Anmeldung über der Tastatur vor – antippen, Face ID, fertig.

---

## Passwort vergessen?
Ein **Admin** öffnet **Mehr → Benutzer verwalten** und tippt bei der Person auf **„Neues Startpasswort“**.
Die Person meldet sich damit an und legt gleich ein eigenes Passwort fest. Die Zwei-Faktor-Anmeldung bleibt.

## Handy verloren?
Ein **Admin** tippt bei der Person auf **„2FA zurücksetzen“** – die Person wird überall abgemeldet und richtet den
Code auf dem neuen Handy neu ein. War das Passwort im Handy gespeichert: zusätzlich **„Neues Startpasswort“**.

**Der Admin selbst hat sein Handy verloren** (und es gibt keinen zweiten Admin): in Supabase **SQL Editor** diese Zeile
ausführen (Benutzernamen anpassen), dann in der App anmelden und den Code neu einrichten:

```sql
delete from auth.mfa_factors where user_id = (select user_id from public.members where username = 'BENUTZERNAME');
```

Tipp: Zwei Admins machen das einfacher (*Benutzer verwalten → Bearbeiten → Rolle*).

---

## So funktioniert's im Alltag
- **Bestand** (Start): Gesamtwert, Wert je Person, Liste mit Menge, Einzelwert (Durchschnitt) und Gesamtwert. Antippen → Details.
- **＋ Hinzufügen**: **Zugang** (auch neuen Artikel direkt anlegen, auf mehrere Personen aufteilen), **Entnahme**, **Übertragen**.
- **Verlauf**: alle Buchungen, eigene löschen, Export für Excel.
- **Mehr**: Inventur, **Inventurliste** (Drucken/PDF/Excel, je Person oder alle, mit Unterschriftszeilen), Stammdaten,
  Benutzer, Mein Konto, Änderungsprotokoll, Datensicherung.

## Sicherheit kurz
- Ohne Passwort **und** Code zeigt die **Datenbank** nichts an – das prüft Supabase selbst, nicht nur die App.
- Konten gibt es nur für Benutzer, die der Admin angelegt hat. Höchstens 3 aktive Benutzer.
- Bestand kann nie unter 0 fallen. Jede Änderung steht im Änderungsprotokoll.

## Technik
Reines HTML/CSS/JavaScript ohne Build-Schritt. `supabase-setup.sql` ist die komplette Datenbank.
Benutzernamen werden intern zu `<benutzername>@pyrolagern.de` (nur für Supabase, nie sichtbar) – festgelegt in `js/accounts.js` (`LOGIN_DOMAIN`).
Die Supabase-Bibliothek liegt in `vendor/` (MIT-Lizenz).
