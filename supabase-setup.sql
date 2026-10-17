-- =====================================================================
--  LAGER-APP · Datenbank einrichten
--
--  So geht's:
--   1. Unten bei SCHRITT A deine E-Mail-Adresse und deinen Namen eintragen.
--   2. Alles markieren (Strg+A / Cmd+A), kopieren und in Supabase unter
--      "SQL Editor" → "New query" einfügen.
--   3. Auf "Run" klicken. Unten muss "Success" stehen.
--
--  Das Skript darf auch mehrmals ausgeführt werden – es geht nichts verloren.
-- =====================================================================


-- =====================================================================
--  SCHRITT A  ·  NUR HIER ETWAS ÄNDERN
--  Deine E-Mail (damit registrierst du dich danach in der App) und dein Name.
--  Du wirst automatisch Admin und kannst danach weitere Leute einladen.
-- =====================================================================

create temp table if not exists _lager_setup (admin_email text, admin_name text);
truncate _lager_setup;
insert into _lager_setup values (
  'DEINE-EMAIL@BEISPIEL.DE',     -- ← deine E-Mail-Adresse
  'Admin'                        -- ← dein Name
);

-- Sicherheitsstopp: läuft nicht weiter, solange oben noch das Beispiel steht.
do $$
begin
  if (select admin_email ilike '%beispiel.de' or admin_email not like '%_@_%._%' from _lager_setup) then
    raise exception 'STOPP: Bitte oben bei SCHRITT A deine echte E-Mail-Adresse eintragen und nochmal auf Run klicken.';
  end if;
end $$;


-- =====================================================================
--  1. Tabellen
-- =====================================================================

-- Personen, die die App benutzen dürfen (= Einladungsliste)
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email like '%_@_%'),
  name        text not null check (length(trim(name)) between 1 and 60),
  role        text not null default 'mitglied' check (role in ('admin', 'mitglied')),
  active      boolean not null default true,
  user_id     uuid unique references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists members_email_lower on public.members (lower(email));

-- Stammdaten
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

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 100),
  address      text check (length(address) <= 300),
  phone        text check (length(phone) <= 60),
  email        text check (length(email) <= 200),
  website      text check (length(website) <= 200),
  customer_no  text check (length(customer_no) <= 60),
  notes        text check (length(notes) <= 1000),
  archived     boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists suppliers_name on public.suppliers (lower(trim(name)));

create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 100),
  description  text check (length(description) <= 500),
  archived     boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists locations_name on public.locations (lower(trim(name)));

-- Artikel
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
  photo_path           text check (length(photo_path) <= 300),
  archived             boolean not null default false,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);
create unique index if not exists items_name_lower on public.items (lower(trim(name)));
create index if not exists items_ean on public.items (ean);

-- Buchungen: Zugang ("in") oder Abgang ("out") für eine Person
create table if not exists public.movements (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete restrict,
  owner_id     uuid not null references public.members (id) on delete restrict,
  kind         text not null check (kind in ('in', 'out')),
  qty          numeric not null check (qty > 0 and qty < 1000000000),
  happened_on  date not null default current_date,
  reason       text not null default 'sonstiges'
               check (reason in ('kauf', 'verbrauch', 'uebertrag', 'korrektur', 'verkauf', 'sonstiges')),
  location_id  uuid references public.locations (id) on delete restrict,
  batch        text check (length(batch) <= 60),
  price_total  numeric check (price_total is null or (price_total >= 0 and price_total < 100000000)),
  paid_by      uuid references public.members (id) on delete restrict,
  supplier_id  uuid references public.suppliers (id) on delete restrict,
  invoice_no   text check (length(invoice_no) <= 60),
  note         text check (length(note) <= 500),
  group_id     uuid,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists movements_lot     on public.movements (item_id, owner_id, location_id, batch);
create index if not exists movements_group   on public.movements (group_id);
create index if not exists movements_created on public.movements (created_at desc);

-- Ausgleichszahlungen zwischen Personen ("Ali gibt Mesut 12,50 €")
create table if not exists public.settlements (
  id           uuid primary key default gen_random_uuid(),
  from_member  uuid not null references public.members (id) on delete restrict,
  to_member    uuid not null references public.members (id) on delete restrict,
  amount       numeric not null check (amount > 0 and amount < 100000000),
  happened_on  date not null default current_date,
  note         text check (length(note) <= 300),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (from_member <> to_member)
);

-- Änderungsprotokoll (wird automatisch gefüllt)
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

-- Mitglied = eingeladen, aktiv UND mit Zwei-Faktor angemeldet (aal2)
create or replace function public.has_2fa()
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_2fa()
     and exists (select 1 from public.members where user_id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_2fa()
     and exists (select 1 from public.members where user_id = auth.uid() and active and role = 'admin');
$$;

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() and active and public.has_2fa();
$$;

-- claim_membership prüft bewusst KEINEN Zwei-Faktor-Code: so erkennt die App,
-- ob jemand gar nicht eingeladen ist oder nur noch den Code eingeben muss.

-- Nach dem Login: Konto mit der Einladung (gleiche E-Mail) verknüpfen
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

-- Registrieren nur mit Einladung (läuft, wenn jemand ein Konto erstellt)
create or replace function public.check_signup_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (
    select 1 from public.members where lower(email) = lower(new.email) and active
  ) then
    raise exception 'Diese E-Mail-Adresse ist nicht eingeladen.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Wer etwas anlegt und wann, setzt immer der Server
create or replace function public.set_created()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

-- Buchungen säubern (leere Charge = keine Charge)
create or replace function public.clean_movement()
returns trigger language plpgsql set search_path = public as $$
begin
  new.batch := nullif(trim(new.batch), '');
  new.invoice_no := nullif(trim(new.invoice_no), '');
  new.note := nullif(trim(new.note), '');
  return new;
end;
$$;

-- Personen: Mitglieder dürfen nur ihren eigenen Namen ändern (Prüfung VOR der Änderung) …
create or replace function public.guard_members_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active
       or new.email is distinct from old.email
       or (new.name is distinct from old.name and old.user_id is distinct from auth.uid()) then
      raise exception 'Nur Admins dürfen das ändern.' using errcode = '42501';
    end if;
  end if;
  if new.email is distinct from old.email and old.user_id is not null then
    raise exception 'Die E-Mail kann nach der Registrierung nicht mehr geändert werden.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- … und es muss immer mindestens einen aktiven Admin geben (Prüfung NACH der Änderung).
create or replace function public.guard_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where role = 'admin' and active) then
    raise exception 'Es muss mindestens einen aktiven Admin geben.' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- Der Bestand einer Person (je Artikel, Lagerort und Charge) darf nie unter 0 fallen
create or replace function public.check_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.movements;
  bal numeric;
  i_name text; i_unit text; o_name text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform pg_advisory_xact_lock(hashtext(r.item_id::text || r.owner_id::text));

  select coalesce(sum(case when kind = 'in' then qty else -qty end), 0) into bal
    from public.movements
   where item_id = r.item_id and owner_id = r.owner_id
     and location_id is not distinct from r.location_id
     and batch is not distinct from r.batch;

  if bal < 0 then
    select name, unit into i_name, i_unit from public.items where id = r.item_id;
    select name into o_name from public.members where id = r.owner_id;
    raise exception 'Nicht genug Bestand: % hätte bei "%" dann % % (an diesem Lagerort/Charge).',
      o_name, i_name, trim(to_char(bal, 'FM999999999990.###')), i_unit
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- Protokoll schreiben
create or replace function public.write_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text; rid uuid;
begin
  select name into uname from public.members where user_id = auth.uid();
  if uname is null then
    uname := case when auth.uid() is null then 'Admin (Supabase)' else 'Unbekannt' end;
  end if;
  if tg_op = 'DELETE' then rid := old.id; else rid := new.id; end if;
  insert into public.log (user_id, user_name, table_name, action, row_id, old_data, new_data)
  values (auth.uid(), uname, tg_table_name, lower(tg_op), rid,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end);
  return null;
end;
$$;

-- Einkauf buchen (auch aufgeteilt auf mehrere Personen, alles oder nichts).
-- p_splits: [{"owner": "<member-id>", "qty": 300}, ...]
-- Der Preis wird nach Menge aufgeteilt (auf Cent gerundet).
create or replace function public.book_purchase(
  p_item uuid, p_splits jsonb, p_date date default null,
  p_paid_by uuid default null, p_price_total numeric default null,
  p_location uuid default null, p_supplier uuid default null,
  p_batch text default null, p_invoice text default null, p_note text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  g uuid := gen_random_uuid();
  total_qty numeric;
  n int;
  i int := 0;
  rest numeric;
  part numeric;
  s jsonb;
begin
  if not public.is_member() then
    raise exception 'Kein Zugang.' using errcode = '42501';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'Bitte mindestens eine Person mit Menge angeben.' using errcode = 'P0001';
  end if;
  select sum((x->>'qty')::numeric), count(*) into total_qty, n from jsonb_array_elements(p_splits) x;
  if total_qty is null or total_qty <= 0 then
    raise exception 'Die Menge muss größer als 0 sein.' using errcode = 'P0001';
  end if;
  rest := round(p_price_total, 2);
  for s in select * from jsonb_array_elements(p_splits) loop
    i := i + 1;
    if p_price_total is null then
      part := null;
    elsif i = n then
      part := rest;
    else
      part := round(p_price_total * (s->>'qty')::numeric / total_qty, 2);
      rest := rest - part;
    end if;
    insert into public.movements (item_id, owner_id, kind, qty, happened_on, reason, location_id,
                                  batch, price_total, paid_by, supplier_id, invoice_no, note, group_id)
    values (p_item, (s->>'owner')::uuid, 'in', (s->>'qty')::numeric, coalesce(p_date, current_date), 'kauf',
            p_location, p_batch, part, case when p_price_total is null then null else p_paid_by end,
            p_supplier, p_invoice, p_note, g);
  end loop;
  return g;
end;
$$;

-- Übertragen von Person A an Person B (oder Umlagern an einen anderen Lagerort)
create or replace function public.book_transfer(
  p_item uuid, p_from uuid, p_to uuid, p_qty numeric,
  p_date date default null, p_note text default null,
  p_from_location uuid default null, p_batch text default null, p_to_location uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid := gen_random_uuid();
begin
  if not public.is_member() then
    raise exception 'Kein Zugang.' using errcode = '42501';
  end if;
  if p_from = p_to and p_from_location is not distinct from p_to_location then
    raise exception 'Bitte eine andere Person oder einen anderen Lagerort wählen.' using errcode = 'P0001';
  end if;
  insert into public.movements (item_id, owner_id, kind, qty, happened_on, reason, location_id, batch, note, group_id)
  values (p_item, p_from, 'out', p_qty, coalesce(p_date, current_date), 'uebertrag', p_from_location, p_batch, p_note, g),
         (p_item, p_to,   'in',  p_qty, coalesce(p_date, current_date), 'uebertrag', p_to_location,   p_batch, p_note, g);
  return g;
end;
$$;

-- Buchung löschen (zusammengehörige Teile werden mitgelöscht).
-- Erlaubt für: wer gebucht hat, wem es gehört, oder Admins.
create or replace function public.delete_movement(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare m public.movements; me uuid; ok boolean; n integer;
begin
  if not public.is_member() then
    raise exception 'Kein Zugang.' using errcode = '42501';
  end if;
  me := public.my_member_id();
  select * into m from public.movements where id = p_id;
  if not found then return 0; end if;

  if public.is_admin() then
    ok := true;
  elsif m.group_id is null then
    ok := m.created_by = auth.uid() or m.owner_id = me or m.paid_by = me;
  else
    select bool_or(created_by = auth.uid() or owner_id = me or paid_by = me) into ok
      from public.movements where group_id = m.group_id;
  end if;
  if not coalesce(ok, false) then
    raise exception 'Du darfst nur eigene Buchungen löschen.' using errcode = '42501';
  end if;

  if m.group_id is null then
    delete from public.movements where id = m.id;
  else
    delete from public.movements where group_id = m.group_id;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;


-- Zwei-Faktor einer Person zurücksetzen (nur Admins, nicht sich selbst)
create or replace function public.reset_2fa(p_member uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  n integer;
  me text;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen die Zwei-Faktor-Anmeldung zurücksetzen.' using errcode = '42501';
  end if;
  select * into m from public.members where id = p_member;
  if not found then
    raise exception 'Diese Person gibt es nicht.' using errcode = 'P0001';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Du kannst deine eigene Zwei-Faktor-Anmeldung nicht zurücksetzen. Bitte einen anderen Admin fragen.' using errcode = 'P0001';
  end if;
  if m.user_id is null then
    return 0;
  end if;

  delete from auth.mfa_factors where user_id = m.user_id;
  get diagnostics n = row_count;

  -- alle Anmeldungen dieser Person beenden (das verlorene Handy fliegt raus)
  begin
    delete from auth.sessions where user_id = m.user_id;
  exception when others then
    null; -- falls das in diesem Supabase-Projekt nicht erlaubt ist: egal
  end;

  select name into me from public.members where user_id = auth.uid();
  insert into public.log (user_id, user_name, table_name, action, row_id, old_data, new_data)
  values (auth.uid(), me, 'members', 'reset_2fa', m.id,
          jsonb_build_object('name', m.name, 'email', m.email, 'factors', n), null);
  return n;
end;
$$;


-- Höchstens 3 aktive Benutzer
-- (Zahl ändern? Nur hier die 3 ersetzen und das Skript nochmal ausführen.)
create or replace function public.max_members()
returns integer language sql immutable as $$
  select 3;
$$;

create or replace function public.enforce_member_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform pg_advisory_xact_lock(hashtext('lager_member_cap'));
    select count(*) into n from public.members where active and id <> new.id;
    if n >= public.max_members() then
      raise exception 'Maximal % Benutzer möglich. Bitte zuerst jemanden deaktivieren.', public.max_members()
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- =====================================================================
--  3. Trigger
-- =====================================================================

drop trigger if exists lager_signup_allowlist on auth.users;
create trigger lager_signup_allowlist before insert on auth.users
  for each row execute function public.check_signup_allowed();

do $$
declare t text;
begin
  foreach t in array array['categories', 'manufacturers', 'suppliers', 'locations', 'items', 'movements', 'settlements'] loop
    execute format('drop trigger if exists %1$s_set_created on public.%1$s', t);
    execute format('create trigger %1$s_set_created before insert on public.%1$s
                    for each row execute function public.set_created()', t);
  end loop;
  foreach t in array array['members', 'categories', 'manufacturers', 'suppliers', 'locations', 'items', 'movements', 'settlements'] loop
    execute format('drop trigger if exists %1$s_log on public.%1$s', t);
    execute format('create trigger %1$s_log after insert or update or delete on public.%1$s
                    for each row execute function public.write_log()', t);
  end loop;
end $$;

drop trigger if exists members_cap on public.members;
create trigger members_cap before insert or update on public.members
  for each row execute function public.enforce_member_cap();

drop trigger if exists movements_clean   on public.movements;
drop trigger if exists movements_balance on public.movements;
drop trigger if exists members_guard     on public.members;
drop trigger if exists members_guard_change on public.members;
create trigger movements_clean   before insert on public.movements
  for each row execute function public.clean_movement();
create trigger movements_balance after insert or delete on public.movements
  for each row execute function public.check_balance();
create trigger members_guard_change before update on public.members
  for each row execute function public.guard_members_change();
create trigger members_guard     after update or delete on public.members
  for each row execute function public.guard_members();


-- =====================================================================
--  4. Zugriffsrechte – nur eingeladene, aktive Mitglieder sehen etwas
-- =====================================================================

alter table public.members       enable row level security;
alter table public.categories    enable row level security;
alter table public.manufacturers enable row level security;
alter table public.suppliers     enable row level security;
alter table public.locations     enable row level security;
alter table public.items         enable row level security;
alter table public.movements     enable row level security;
alter table public.settlements   enable row level security;
alter table public.log           enable row level security;

revoke all on public.members, public.categories, public.manufacturers, public.suppliers,
              public.locations, public.items, public.movements, public.settlements, public.log
  from anon, authenticated;

grant select, delete                       on public.members to authenticated;
grant insert (email, name, role)           on public.members to authenticated;
grant update (email, name, role, active)   on public.members to authenticated;

grant select on public.categories to authenticated;
grant insert (name, color), update (name, color, archived) on public.categories to authenticated;
grant select on public.manufacturers to authenticated;
grant insert (name, country, website, notes), update (name, country, website, notes, archived)
  on public.manufacturers to authenticated;
grant select on public.suppliers to authenticated;
grant insert (name, address, phone, email, website, customer_no, notes),
      update (name, address, phone, email, website, customer_no, notes, archived)
  on public.suppliers to authenticated;
grant select on public.locations to authenticated;
grant insert (name, description), update (name, description, archived) on public.locations to authenticated;
grant select on public.items to authenticated;
grant insert (name, category_id, manufacturer_id, sku, ean, default_location_id, unit, min_qty, notes, photo_path),
      update (name, category_id, manufacturer_id, sku, ean, default_location_id, unit, min_qty, notes, photo_path, archived)
  on public.items to authenticated;

grant select on public.movements to authenticated;
grant insert (item_id, owner_id, kind, qty, happened_on, reason, location_id, batch, price_total,
              supplier_id, invoice_no, note)
  on public.movements to authenticated;

grant select, delete on public.settlements to authenticated;
grant insert (from_member, to_member, amount, happened_on, note) on public.settlements to authenticated;

grant select on public.log to authenticated;

-- Richtlinien (Policies)
do $$
declare t text; p record;
begin
  -- alte Policies dieser Tabellen entfernen, damit das Skript wiederholbar ist
  for p in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('members', 'categories', 'manufacturers', 'suppliers', 'locations',
                                'items', 'movements', 'settlements', 'log') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  foreach t in array array['categories', 'manufacturers', 'suppliers', 'locations', 'items'] loop
    execute format('create policy %1$s_read   on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_add    on public.%1$s for insert to authenticated with check (public.is_member())', t);
    execute format('create policy %1$s_change on public.%1$s for update to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

create policy members_read    on public.members for select to authenticated using (public.is_member());
create policy members_invite  on public.members for insert to authenticated with check (public.is_admin());
create policy members_change  on public.members for update to authenticated
  using (public.is_admin() or (public.is_member() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_member() and user_id = auth.uid()));
create policy members_remove  on public.members for delete to authenticated using (public.is_admin() and user_id is distinct from auth.uid());

create policy movements_read  on public.movements for select to authenticated using (public.is_member());
create policy movements_add   on public.movements for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());

create policy settlements_read   on public.settlements for select to authenticated using (public.is_member());
create policy settlements_add    on public.settlements for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());
create policy settlements_remove on public.settlements for delete to authenticated
  using (public.is_member() and (created_by = auth.uid() or public.is_admin()
         or from_member = public.my_member_id() or to_member = public.my_member_id()));

create policy log_read on public.log for select to authenticated using (public.is_member());

-- Funktionen: nur für eingeloggte Nutzer
revoke all on function public.is_member(), public.is_admin(), public.my_member_id(), public.claim_membership(),
  public.book_purchase(uuid, jsonb, date, uuid, numeric, uuid, uuid, text, text, text),
  public.book_transfer(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid),
  public.delete_movement(uuid)
  from public, anon;
revoke all on function public.has_2fa(), public.reset_2fa(uuid), public.max_members() from public, anon;
revoke all on function public.enforce_member_cap() from public, anon, authenticated;
grant execute on function public.has_2fa(), public.reset_2fa(uuid), public.max_members() to authenticated;
revoke all on function public.check_signup_allowed(), public.set_created(), public.clean_movement(),
  public.guard_members(), public.guard_members_change(), public.check_balance(), public.write_log()
  from public, anon, authenticated;
grant execute on function public.is_member(), public.is_admin(), public.my_member_id(), public.claim_membership(),
  public.book_purchase(uuid, jsonb, date, uuid, numeric, uuid, uuid, text, text, text),
  public.book_transfer(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid),
  public.delete_movement(uuid)
  to authenticated;


-- =====================================================================
--  5. Fotos (privater Speicher, nur für Mitglieder)
-- =====================================================================

insert into storage.buckets (id, name, public) values ('lager-fotos', 'lager-fotos', false)
  on conflict (id) do update set public = false;
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'lager-fotos';

drop policy if exists lager_fotos_read   on storage.objects;
drop policy if exists lager_fotos_add    on storage.objects;
drop policy if exists lager_fotos_change on storage.objects;
drop policy if exists lager_fotos_remove on storage.objects;
create policy lager_fotos_read   on storage.objects for select to authenticated
  using (bucket_id = 'lager-fotos' and public.is_member());
create policy lager_fotos_add    on storage.objects for insert to authenticated
  with check (bucket_id = 'lager-fotos' and public.is_member());
create policy lager_fotos_change on storage.objects for update to authenticated
  using (bucket_id = 'lager-fotos' and public.is_member()) with check (bucket_id = 'lager-fotos' and public.is_member());
create policy lager_fotos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'lager-fotos' and public.is_member());


-- =====================================================================
--  6. Dich als Admin eintragen (Daten aus SCHRITT A)
-- =====================================================================

insert into public.members (email, name, role, active)
select trim(admin_email), trim(admin_name), 'admin', true from _lager_setup
on conflict ((lower(email))) do update set role = 'admin', active = true;

-- Fertig! Unten sollte "Success" stehen.
-- Jetzt die App öffnen und mit genau dieser E-Mail auf "Konto erstellen" tippen.
