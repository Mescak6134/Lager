-- =====================================================================
--  LAGER-APP v2 · Datenbank einrichten
--
--  So geht's:
--   1. Unten bei SCHRITT A deinen Benutzernamen und deinen Namen eintragen.
--   2. Alles markieren (Strg+A / Cmd+A), kopieren und in Supabase unter
--      "SQL Editor" → "New query" einfügen.
--   3. Auf "Run" klicken. Unten muss "Success" stehen.
--
--  Das Skript darf mehrmals ausgeführt werden. Daten der v2 bleiben erhalten.
--  ACHTUNG: Findet es noch die alte Version (v1), wird ALLES gelöscht –
--  alle Tabellen der App und alle Konten (siehe Abschnitt 0).
-- =====================================================================


-- =====================================================================
--  SCHRITT A  ·  NUR HIER ETWAS ÄNDERN
--  Dein Benutzername zum Anmelden (3–20 Zeichen: a–z, 0–9, Punkt, Minus,
--  Unterstrich) und dein Name, wie er in der App angezeigt wird.
--  Du wirst automatisch Admin.
-- =====================================================================

drop table if exists _lager_v2;
create temp table _lager_v2 (admin_username text, admin_name text, login_domain text);
insert into _lager_v2 values (
  'BENUTZERNAME',     -- ← dein Benutzername, z. B. 'mesut'
  'Anzeigename',      -- ← dein Name, z. B. 'Mesut'
  'pyrolagern.de'     -- (nicht ändern – muss zu LOGIN_DOMAIN in js/accounts.js passen)
);

-- Sicherheitsstopp: läuft nicht weiter, solange oben noch das Beispiel steht.
do $$
declare u text;
begin
  select lower(trim(admin_username)) into u from _lager_v2;
  -- (Vergleich absichtlich zusammengesetzt, damit Suchen/Ersetzen der Platzhalter ihn nicht verändert)
  if u = lower('BENUTZER' || 'NAME') or (select trim(admin_name) from _lager_v2) = 'Anzeige' || 'name' then
    raise exception 'STOPP: Bitte oben bei SCHRITT A deinen Benutzernamen und Namen eintragen und nochmal auf Run klicken.';
  end if;
  if u !~ '^[a-z0-9._-]{3,20}$' then
    raise exception 'STOPP: Der Benutzername "%" passt nicht. Erlaubt sind 3–20 Zeichen: a–z, 0–9, Punkt, Minus, Unterstrich (keine Umlaute, keine Leerzeichen).', u;
  end if;
end $$;


-- =====================================================================
--  0. Aufräumen: alte Version (v1) entfernen
--     Läuft NUR, wenn noch Tabellen der v1 da sind (z. B. "settlements"
--     oder "members" ohne Spalte "username"). Dann wird gelöscht:
--     alle Tabellen, Funktionen, Regeln der App, die Foto-Regeln
--     und ALLE Konten in auth.users (samt Zwei-Faktor und Anmeldungen).
-- =====================================================================

do $$
declare
  is_v1 boolean;
  f record;
begin
  is_v1 := to_regclass('public.settlements') is not null
        or to_regclass('public.suppliers') is not null
        or (to_regclass('public.members') is not null and not exists (
              select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'members' and column_name = 'username'));
  if not is_v1 then
    return;
  end if;
  raise notice 'Alte Version (v1) gefunden – wird entfernt.';

  drop trigger if exists lager_signup_allowlist on auth.users;

  drop table if exists public.log, public.settlements, public.movements, public.items, public.suppliers,
    public.manufacturers, public.categories, public.locations, public.members cascade;

  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'is_member', 'is_admin', 'my_member_id', 'claim_membership', 'check_signup_allowed', 'set_created',
       'clean_movement', 'guard_members', 'guard_members_change', 'check_balance', 'write_log', 'book_purchase',
       'book_transfer', 'delete_movement', 'has_2fa', 'reset_2fa', 'max_members', 'enforce_member_cap',
       'admin_set_temp_password'])
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;

  -- Foto-Speicher der v1 (Regeln entfernen; Dateien/Bucket wenn möglich)
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists lager_fotos_read on storage.objects';
    execute 'drop policy if exists lager_fotos_add on storage.objects';
    execute 'drop policy if exists lager_fotos_change on storage.objects';
    execute 'drop policy if exists lager_fotos_remove on storage.objects';
    begin
      execute 'delete from storage.objects where bucket_id = ''lager-fotos''';
      execute 'delete from storage.buckets where id = ''lager-fotos''';
    exception when others then
      raise notice 'Foto-Speicher "lager-fotos" bitte bei Bedarf unter Storage von Hand löschen.';
    end;
  end if;

  -- Alle Konten löschen (Identitäten, Zwei-Faktor, Sitzungen hängen daran)
  begin
    execute 'delete from auth.refresh_tokens';
  exception when others then null;
  end;
  delete from auth.mfa_factors;
  delete from auth.sessions;
  delete from auth.users;
end $$;


-- =====================================================================
--  1. Tabellen
-- =====================================================================

-- Personen (höchstens 3 aktive). Angemeldet wird mit dem Benutzernamen;
-- Supabase braucht intern eine Adresse: <benutzername>@pyrolagern.de
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,20}$'),
  email       text not null unique check (email = lower(email) and email like '%_@_%'),
  name        text not null check (length(trim(name)) between 1 and 60),
  role        text not null default 'mitglied' check (role in ('admin', 'mitglied')),
  active      boolean not null default true,
  user_id     uuid unique references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  color       text not null default '#d97706' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived    boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists categories_name on public.categories (lower(trim(name)));

create table if not exists public.manufacturers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  country     text check (length(country) <= 60),
  website     text check (length(website) <= 200),
  notes       text check (length(notes) <= 1000),
  archived    boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists manufacturers_name on public.manufacturers (lower(trim(name)));

create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 100),
  description  text check (length(description) <= 500),
  archived     boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists locations_name on public.locations (lower(trim(name)));

create table if not exists public.items (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(trim(name)) between 1 and 100),
  category_id          uuid references public.categories (id) on delete set null,
  manufacturer_id      uuid references public.manufacturers (id) on delete set null,
  sku                  text check (length(sku) <= 60),
  ean                  text check (length(ean) <= 32),
  default_location_id  uuid references public.locations (id) on delete set null,
  unit                 text not null default 'Stück' check (length(trim(unit)) between 1 and 20),
  min_qty              numeric check (min_qty is null or min_qty >= 0),
  notes                text check (length(notes) <= 1000),
  archived             boolean not null default false,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);
create unique index if not exists items_name_lower on public.items (lower(trim(name)));
create index if not exists items_ean on public.items (ean);

-- Buchungen: Zugang ("in") oder Entnahme ("out") für eine Person.
-- unit_value = Einzelwert in € je Einheit (nur bei Zugängen, optional)
create table if not exists public.movements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete restrict,
  owner_id     uuid not null references public.members (id) on delete restrict,
  kind         text not null check (kind in ('in', 'out')),
  qty          numeric not null check (qty > 0 and qty < 1000000000),
  happened_on  date not null default current_date,
  reason       text not null default 'sonstiges'
               check (reason in ('zugang', 'verbrauch', 'uebertrag', 'korrektur', 'sonstiges')),
  unit_value   numeric check (unit_value is null or (unit_value >= 0 and unit_value < 100000000)),
  location_id  uuid references public.locations (id) on delete restrict,
  batch        text check (length(batch) <= 60),
  note         text check (length(note) <= 500),
  group_id     uuid,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists movements_lot     on public.movements (item_id, owner_id, location_id, batch);
create index if not exists movements_group   on public.movements (group_id);
create index if not exists movements_created on public.movements (created_at desc);

-- Änderungsprotokoll (wird automatisch gefüllt, niemand kann es ändern)
create table if not exists public.log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  user_name   text,
  table_name  text not null,
  action      text not null,
  row_id      uuid,
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists log_at on public.log (at desc);


-- =====================================================================
--  2. Hilfsfunktionen
-- =====================================================================

-- Höchstens 3 aktive Benutzer (Zahl ändern? Nur hier und das Skript nochmal ausführen.)
create or replace function public.max_members()
returns integer language sql immutable as $$ select 3; $$;

-- Zwei-Faktor ist Pflicht: nur Anmeldungen mit Code (aal2) sehen Daten
create or replace function public.has_2fa()
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_2fa() and exists (select 1 from public.members where user_id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_2fa() and exists (select 1 from public.members where user_id = auth.uid() and active and role = 'admin');
$$;

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and active and public.has_2fa();
$$;

-- Eigener Eintrag (geht schon vor dem Zwei-Faktor-Code, damit die App
-- "kein Zugang" von "Code fehlt noch" unterscheiden kann)
create or replace function public.claim_membership()
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  if auth.uid() is null then return null; end if;
  update public.members set user_id = auth.uid()
   where lower(email) = lower(auth.email()) and user_id is null;
  select * into m from public.members where user_id = auth.uid();
  if not found then return null; end if;
  return to_jsonb(m);
end;
$$;

-- Ersteinrichtung nötig? (Admin angelegt, aber noch ohne Konto) – auch ohne Anmeldung abfragbar
create or replace function public.setup_pending()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where role = 'admin' and active and user_id is null);
$$;

-- Neue Konten nur für Benutzer, die ein Admin angelegt hat und die noch kein Konto haben
create or replace function public.check_signup_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (
    select 1 from public.members where lower(email) = lower(new.email) and active and user_id is null
  ) then
    raise exception 'Diesen Benutzer gibt es nicht oder er hat schon ein Konto.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- … und sofort mit dem Benutzer verknüpfen
create or replace function public.link_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.members set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  return null;
end;
$$;

create or replace function public.set_created()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.clean_movement()
returns trigger language plpgsql set search_path = public as $$
begin
  new.batch := nullif(trim(new.batch), '');
  new.note := nullif(trim(new.note), '');
  if new.kind = 'out' then new.unit_value := null; end if;
  return new;
end;
$$;

-- Personen: Mitglieder ändern nur ihren eigenen Namen
create or replace function public.guard_members_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.username is distinct from old.username or new.email is distinct from old.email
       or (new.name is distinct from old.name and old.user_id is distinct from auth.uid()) then
      raise exception 'Nur Admins dürfen das ändern.' using errcode = '42501';
    end if;
  end if;
  if (new.username is distinct from old.username or new.email is distinct from old.email) and old.user_id is not null then
    raise exception 'Der Benutzername kann nicht mehr geändert werden.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- … und es bleibt immer mindestens ein aktiver Admin
create or replace function public.guard_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where role = 'admin' and active) then
    raise exception 'Es muss mindestens einen aktiven Admin geben.' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create or replace function public.enforce_member_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform pg_advisory_xact_lock(hashtext('lager_member_cap'));
    select count(*) into n from public.members where active and id <> new.id;
    if n >= public.max_members() then
      raise exception 'Maximal % Benutzer möglich. Bitte zuerst jemanden deaktivieren.', public.max_members() using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Der Bestand einer Person (je Artikel, Lagerort, Charge) darf nie unter 0 fallen
create or replace function public.check_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.movements; bal numeric; i_name text; i_unit text; o_name text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform pg_advisory_xact_lock(hashtext(r.item_id::text || r.owner_id::text));
  select coalesce(sum(case when kind = 'in' then qty else -qty end), 0) into bal
    from public.movements
   where item_id = r.item_id and owner_id = r.owner_id
     and location_id is not distinct from r.location_id and batch is not distinct from r.batch;
  if bal < 0 then
    select name, unit into i_name, i_unit from public.items where id = r.item_id;
    select name into o_name from public.members where id = r.owner_id;
    raise exception 'Nicht genug Bestand: % hätte bei "%" dann % % (an diesem Lagerort/Charge).',
      o_name, i_name, trim(to_char(bal, 'FM999999999990.###')), i_unit using errcode = 'P0001';
  end if;
  return null;
end;
$$;

create or replace function public.write_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text; rid uuid;
begin
  select name into uname from public.members where user_id = auth.uid();
  if uname is null then uname := case when auth.uid() is null then 'System' else 'Unbekannt' end; end if;
  if tg_op = 'DELETE' then rid := old.id; else rid := new.id; end if;
  insert into public.log (user_id, user_name, table_name, action, row_id, old_data, new_data)
  values (auth.uid(), uname, tg_table_name, lower(tg_op), rid,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end);
  return null;
end;
$$;

-- Zugang buchen, auch aufgeteilt auf mehrere Personen (alles oder nichts)
-- p_splits: [{"owner": "<member-id>", "qty": 300}, ...]
create or replace function public.book_in(
  p_item uuid, p_splits jsonb, p_unit_value numeric default null, p_date date default null,
  p_location uuid default null, p_batch text default null, p_note text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid(); s jsonb;
begin
  if not public.is_member() then raise exception 'Kein Zugang.' using errcode = '42501'; end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'Bitte mindestens eine Person mit Menge angeben.' using errcode = 'P0001';
  end if;
  for s in select * from jsonb_array_elements(p_splits) loop
    insert into public.movements (item_id, owner_id, kind, qty, happened_on, reason, unit_value, location_id, batch, note, group_id)
    values (p_item, (s->>'owner')::uuid, 'in', (s->>'qty')::numeric, coalesce(p_date, current_date), 'zugang',
            p_unit_value, p_location, p_batch, p_note, case when jsonb_array_length(p_splits) > 1 then g end);
  end loop;
  return g;
end;
$$;

-- Übertragen an eine andere Person oder an einen anderen Lagerort
create or replace function public.book_transfer(
  p_item uuid, p_from uuid, p_to uuid, p_qty numeric, p_date date default null, p_note text default null,
  p_from_location uuid default null, p_batch text default null, p_to_location uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid();
begin
  if not public.is_member() then raise exception 'Kein Zugang.' using errcode = '42501'; end if;
  if p_from = p_to and p_from_location is not distinct from p_to_location then
    raise exception 'Bitte eine andere Person oder einen anderen Lagerort wählen.' using errcode = 'P0001';
  end if;
  insert into public.movements (item_id, owner_id, kind, qty, happened_on, reason, location_id, batch, note, group_id)
  values (p_item, p_from, 'out', p_qty, coalesce(p_date, current_date), 'uebertrag', p_from_location, p_batch, p_note, g),
         (p_item, p_to,   'in',  p_qty, coalesce(p_date, current_date), 'uebertrag', p_to_location,   p_batch, p_note, g);
  return g;
end;
$$;

-- Buchung löschen (Zusammengehöriges wird mitgelöscht): wer gebucht hat, wem es gehört, oder Admins
create or replace function public.delete_movement(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.movements; me uuid; ok boolean; n integer;
begin
  if not public.is_member() then raise exception 'Kein Zugang.' using errcode = '42501'; end if;
  me := public.my_member_id();
  select * into m from public.movements where id = p_id;
  if not found then return 0; end if;
  if public.is_admin() then ok := true;
  elsif m.group_id is null then ok := m.created_by = auth.uid() or m.owner_id = me;
  else select bool_or(created_by = auth.uid() or owner_id = me) into ok from public.movements where group_id = m.group_id;
  end if;
  if not coalesce(ok, false) then raise exception 'Du darfst nur eigene Buchungen löschen.' using errcode = '42501'; end if;
  if m.group_id is null then delete from public.movements where id = m.id;
  else delete from public.movements where group_id = m.group_id;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Admin: Zwei-Faktor einer Person zurücksetzen (Handy verloren) – nicht bei sich selbst
create or replace function public.reset_2fa(p_member uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.members; n integer; me text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen die Zwei-Faktor-Anmeldung zurücksetzen.' using errcode = '42501';
  end if;
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Diese Person gibt es nicht.' using errcode = 'P0001'; end if;
  if m.user_id = auth.uid() then
    raise exception 'Deine eigene Zwei-Faktor-Anmeldung kann nur ein anderer Admin zurücksetzen.' using errcode = 'P0001';
  end if;
  if m.user_id is null then return 0; end if;
  delete from auth.mfa_factors where user_id = m.user_id;
  get diagnostics n = row_count;
  begin delete from auth.sessions where user_id = m.user_id; exception when others then null; end;
  select name into me from public.members where user_id = auth.uid();
  insert into public.log (user_id, user_name, table_name, action, row_id, old_data)
  values (auth.uid(), me, 'members', 'reset_2fa', m.id, jsonb_build_object('name', m.name, 'username', m.username, 'factors', n));
  return n;
end;
$$;

-- Admin: neues Startpasswort vergeben (Passwort vergessen) – nicht bei sich selbst
create or replace function public.admin_set_temp_password(p_member uuid, p_password text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare m public.members; target uuid; me text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen Startpasswörter vergeben.' using errcode = '42501';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Das Startpasswort muss mindestens 8 Zeichen haben.' using errcode = 'P0001';
  end if;
  select * into m from public.members where id = p_member;
  if not found then raise exception 'Diese Person gibt es nicht.' using errcode = 'P0001'; end if;
  target := coalesce(m.user_id, (select u.id from auth.users u where lower(u.email) = lower(m.email) limit 1));
  if target is null then raise exception 'Für diese Person gibt es noch kein Konto.' using errcode = 'P0001'; end if;
  if target = auth.uid() then
    raise exception 'Dein eigenes Passwort änderst du unter Mehr → Mein Konto.' using errcode = 'P0001';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = target;
  begin delete from auth.refresh_tokens where user_id = target::text; exception when others then null; end;
  begin delete from auth.sessions where user_id = target; exception when others then null; end;
  select name into me from public.members where user_id = auth.uid();
  insert into public.log (user_id, user_name, table_name, action, row_id, old_data)
  values (auth.uid(), me, 'members', 'temp_password', m.id, jsonb_build_object('name', m.name, 'username', m.username));
  return true;
end;
$$;


-- =====================================================================
--  3. Trigger
-- =====================================================================

drop trigger if exists lager_signup_allowlist on auth.users;
drop trigger if exists lager_signup_check on auth.users;
drop trigger if exists lager_signup_link on auth.users;
create trigger lager_signup_check before insert on auth.users
  for each row execute function public.check_signup_allowed();
create trigger lager_signup_link after insert on auth.users
  for each row execute function public.link_new_user();

do $$
declare t text;
begin
  foreach t in array array['categories', 'manufacturers', 'locations', 'items', 'movements'] loop
    execute format('drop trigger if exists %1$s_set_created on public.%1$s', t);
    execute format('create trigger %1$s_set_created before insert on public.%1$s for each row execute function public.set_created()', t);
  end loop;
  foreach t in array array['members', 'categories', 'manufacturers', 'locations', 'items', 'movements'] loop
    execute format('drop trigger if exists %1$s_log on public.%1$s', t);
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$s for each row execute function public.write_log()', t);
  end loop;
end $$;

drop trigger if exists movements_clean on public.movements;
drop trigger if exists movements_balance on public.movements;
drop trigger if exists members_guard_change on public.members;
drop trigger if exists members_guard on public.members;
drop trigger if exists members_cap on public.members;
create trigger movements_clean before insert on public.movements for each row execute function public.clean_movement();
create trigger movements_balance after insert or delete on public.movements for each row execute function public.check_balance();
create trigger members_guard_change before update on public.members for each row execute function public.guard_members_change();
create trigger members_guard after update or delete on public.members for each row execute function public.guard_members();
create trigger members_cap before insert or update on public.members for each row execute function public.enforce_member_cap();


-- =====================================================================
--  4. Zugriffsrechte – nur aktive Mitglieder mit Zwei-Faktor sehen etwas
-- =====================================================================

alter table public.members       enable row level security;
alter table public.categories    enable row level security;
alter table public.manufacturers enable row level security;
alter table public.locations     enable row level security;
alter table public.items         enable row level security;
alter table public.movements     enable row level security;
alter table public.log           enable row level security;

revoke all on public.members, public.categories, public.manufacturers, public.locations,
              public.items, public.movements, public.log from anon, authenticated;

grant select, delete on public.members to authenticated;
grant insert (username, email, name, role) on public.members to authenticated;
grant update (name, role, active) on public.members to authenticated;
grant select on public.categories to authenticated;
grant insert (name, color), update (name, color, archived) on public.categories to authenticated;
grant select on public.manufacturers to authenticated;
grant insert (name, country, website, notes), update (name, country, website, notes, archived) on public.manufacturers to authenticated;
grant select on public.locations to authenticated;
grant insert (name, description), update (name, description, archived) on public.locations to authenticated;
grant select on public.items to authenticated;
grant insert (name, category_id, manufacturer_id, sku, ean, default_location_id, unit, min_qty, notes),
      update (name, category_id, manufacturer_id, sku, ean, default_location_id, unit, min_qty, notes, archived)
  on public.items to authenticated;
grant select on public.movements to authenticated;
grant insert (item_id, owner_id, kind, qty, happened_on, reason, unit_value, location_id, batch, note) on public.movements to authenticated;
grant select on public.log to authenticated;

do $$
declare t text; p record;
begin
  for p in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('members', 'categories', 'manufacturers', 'locations', 'items', 'movements', 'log') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  foreach t in array array['categories', 'manufacturers', 'locations', 'items'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_add on public.%1$s for insert to authenticated with check (public.is_member())', t);
    execute format('create policy %1$s_change on public.%1$s for update to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

create policy members_read   on public.members for select to authenticated using (public.is_member());
create policy members_add    on public.members for insert to authenticated with check (public.is_admin());
create policy members_change on public.members for update to authenticated
  using (public.is_admin() or (public.is_member() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_member() and user_id = auth.uid()));
create policy members_remove on public.members for delete to authenticated using (public.is_admin() and user_id is distinct from auth.uid());
create policy movements_read on public.movements for select to authenticated using (public.is_member());
create policy movements_add  on public.movements for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy log_read       on public.log for select to authenticated using (public.is_member());

revoke all on function public.max_members(), public.has_2fa(), public.is_member(), public.is_admin(), public.my_member_id(),
  public.claim_membership(), public.setup_pending(),
  public.book_in(uuid, jsonb, numeric, date, uuid, text, text),
  public.book_transfer(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid),
  public.delete_movement(uuid), public.reset_2fa(uuid), public.admin_set_temp_password(uuid, text)
  from public, anon;
revoke all on function public.check_signup_allowed(), public.link_new_user(), public.set_created(), public.clean_movement(),
  public.guard_members_change(), public.guard_members(), public.enforce_member_cap(), public.check_balance(), public.write_log()
  from public, anon, authenticated;
grant execute on function public.max_members(), public.has_2fa(), public.is_member(), public.is_admin(), public.my_member_id(),
  public.claim_membership(), public.setup_pending(),
  public.book_in(uuid, jsonb, numeric, date, uuid, text, text),
  public.book_transfer(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid),
  public.delete_movement(uuid), public.reset_2fa(uuid), public.admin_set_temp_password(uuid, text)
  to authenticated;
grant execute on function public.setup_pending() to anon;


-- =====================================================================
--  5. Dich als Admin eintragen (aus SCHRITT A)
-- =====================================================================

insert into public.members (username, email, name, role, active)
select lower(trim(admin_username)), lower(trim(admin_username)) || '@' || login_domain, trim(admin_name), 'admin', true
  from _lager_v2
on conflict (username) do update set role = 'admin', active = true;

drop table if exists _lager_v2;

-- Fertig! Unten sollte "Success" stehen.
-- Jetzt die App öffnen, unten auf "Ersteinrichtung" tippen und ein Passwort festlegen.
