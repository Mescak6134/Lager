-- =====================================================================
--  LAGER-APP · Update vom 17.10.2026
--  Pflicht-Zwei-Faktor-Anmeldung (2FA) + höchstens 3 Benutzer
--
--  Was dieses Update macht:
--   • Daten sieht nur noch, wer sich mit Passwort UND 6-stelligem Code
--     (Zwei-Faktor) angemeldet hat. Das prüft die Datenbank selbst.
--   • Admins können die Zwei-Faktor-Anmeldung einer Person zurücksetzen
--     (z. B. wenn ein Handy verloren ging).
--   • Es können höchstens 3 Personen gleichzeitig aktiv sein.
--
--  So geht's:
--   In Supabase links "SQL Editor" → "New query" → diese Datei einfach
--   komplett einfügen und auf "Run" klicken. Es muss "Success" erscheinen.
--   Hier muss NICHTS angepasst werden. Eure Daten bleiben unverändert.
--   Das Update darf auch mehrmals ausgeführt werden.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. Mitglied = eingeladen, aktiv UND mit Zwei-Faktor angemeldet (aal2)
-- ---------------------------------------------------------------------

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

-- (claim_membership bleibt ohne Zwei-Faktor-Prüfung, damit die App
--  "nicht eingeladen" von "Code fehlt noch" unterscheiden kann.)


-- ---------------------------------------------------------------------
--  2. Zwei-Faktor einer Person zurücksetzen (nur Admins, nicht sich selbst)
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
--  3. Höchstens 3 aktive Benutzer
--     (Zahl ändern? Nur hier die 3 ersetzen und das Skript nochmal ausführen.)
-- ---------------------------------------------------------------------

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

drop trigger if exists members_cap on public.members;
create trigger members_cap before insert or update on public.members
  for each row execute function public.enforce_member_cap();


-- ---------------------------------------------------------------------
--  4. Rechte
-- ---------------------------------------------------------------------

revoke all on function public.has_2fa(), public.reset_2fa(uuid), public.max_members() from public, anon;
revoke all on function public.enforce_member_cap() from public, anon, authenticated;
grant execute on function public.has_2fa(), public.reset_2fa(uuid), public.max_members() to authenticated;

-- Fertig! Unten sollte "Success" stehen.
