
![Logo](https://imgur.com/VE1nWC7.png)


# FQQD's MCServer Website Template 1.0

A template for a modern looking website to promote your Minecraft server.

Written with HTML and a lot of CSS and the minimal usage of JavaScript.

Test it out: https://fqqd.github.io/MCServer-Web-Template/index.html


## Features

- Server adress copy button
- Modern design
- Discord server embed
- Team member cards
- Bedrock and Java IP cards
- Navbar
- Mobile support
- Simple Configuration
- Hover animations

## Arena War registration (Supabase)

The Season 3 registration form uses the existing `public.arena_teams` and
`public.arena_registrations` tables. Keep `SUPABASE_URL` and
`SUPABASE_ANON_KEY` in a local `.env` file (start from `.env.example`); the
deployment workflow reads the same values from GitHub Actions repository
secrets and generates `media/arenawar-runtime-config.js` during the build.
`.env` and the generated runtime config are ignored by Git.

Set the GitHub Actions secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the
repository settings before deploying. `media/arenawar-config.js` contains no
key; it reads the runtime config generated from `.env` locally or from Actions
secrets in the deployment artifact. `SUPABASE_ANON_KEY` is the public
anon/publishable key, not a secret credential: it will still be visible in
browser requests after deployment. Never use a `service_role` key in the
frontend or GitHub Pages build. Protect data with Row Level Security and
column grants; environment variables prevent committing the key but do not
hide it from website visitors.

Before opening registration publicly, run these grants after creating the
tables and RLS policies. They remove any table-wide grants (including grants
inherited from `PUBLIC`), allow the site to read team names and approved
Minecraft usernames, and allow visitors to insert registration fields only.
RLS must still enforce that inserted registrations have `status = 'PENDING'`.

```sql
revoke select on public.arena_teams from public, anon, authenticated;
grant select (id, team_code, team_name)
on public.arena_teams to anon, authenticated;

revoke select, insert on public.arena_registrations
from public, anon, authenticated;

grant select (minecraft_username, team_id, status, created_at)
on public.arena_registrations to anon, authenticated;

grant insert (minecraft_username, discord_username, phone_number, team_id, status)
on public.arena_registrations to anon, authenticated;
```

To check registrations in every status and show the already-registered team
name, create this RPC in Supabase. It returns only the matching team name (not
the registrant's phone number, Discord name, or status). Because it accepts a
public username lookup, visitors can check whether a guessed Minecraft name is
registered and which team it chose.

```sql
create or replace function public.lookup_arena_registration_team(
  p_minecraft_username text
)
returns table (team_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.team_name::text
  from public.arena_registrations as r
  join public.arena_teams as t on t.id = r.team_id
  where p_minecraft_username is not null
    and length(btrim(p_minecraft_username)) between 1 and 100
    and lower(btrim(r.minecraft_username)) = lower(btrim(p_minecraft_username))
  order by r.created_at asc
  limit 1;
$$;

revoke all on function public.lookup_arena_registration_team(text) from public;
grant execute on function public.lookup_arena_registration_team(text)
to anon, authenticated;
```

Keep the database unique constraint as the final protection against concurrent
submissions. To reject usernames that differ only by case or surrounding
spaces, also run:

```sql
create unique index if not exists idx_arena_registrations_username_ci
on public.arena_registrations (lower(btrim(minecraft_username)));
```

If this index cannot be created, first resolve any existing usernames that
become duplicates after trimming and ignoring case.

When a username already has a registration, the form displays the team name
resolved from its `team_id` and does not insert another row.

The Season 3 team cards open a registration dialog for the selected team. The
form requires a Minecraft username, Discord username, and contact phone number;
the user must also select a team by opening the form from a team card. The
phone field accepts a 10-digit Vietnamese number starting with `0` or an
international number in `+` country-code format. Valid numbers are normalized
to international format before storage. The website submits new rows as `PENDING` and
only requests Minecraft usernames and team IDs for approved rows. An admin can
approve or reject a registration by changing its `status` to `APPROVED` or
`REJECTED` in the Supabase Table Editor. The public team list refreshes every
minute. This integration does not add an admin login/dashboard; approval is
done in Supabase.


## FAQ

#### How do I personalize this website?

To edit this website, simply fork the repository and edit the "index.html" and the "style.css" in the "media" folder. 
Reading through the code should be enough to understand what you are able to edit.

#### How do I make the Discord Embed work?

-  Go to Discord Server Settings
- "Widget"
- Enable Server Widget
- Select an Invite Channel (e.g. the main chat)
- Manually copy ONLY THE LINK ("https://discord.com/widget?id=[SERVER-ID]&theme=dark")
- Replace the imgur link in the Discord Section with the Discord Widget link

#### Where can I host this website?

I recommend hosting the website on your own Linux VServer with Caddyserver, but if you need to have a free hosting service, I recommend Neocities or GitHub Pages.

#### Why would I need such a website?

This website can help to provide additional information about your Minecraft Server and get people to join it.

#### Can I use this freely without copyright?

You can use and edit the website as much as you want, as long as the "Made by FQQD 2023" stays on the bottom of the site unchanged.

## Screenshots

![App Screenshot](https://imgur.com/zOqKk56.png)


![App Screenshot](https://imgur.com/Th7NzCh.png)


![App Screenshot](https://imgur.com/dhUnvAK.png)


![App Screenshot](https://imgur.com/hgX2Ztd.png)


![App Screenshot](https://imgur.com/aSpvshJ.png)


![App Screenshot](https://imgur.com/v01GJAw.png)


## Usage/Examples

![App Screenshot](https://imgur.com/8ic4MS7.png)

## Authors

- [@FQQD](https://fqqd.de)
- Originally made for [@HerrFisch](https://www.github.com/HerrFisch)


## Lastly...
If you have any further question or want to help and contribute, the best ways to do this are
- Creating an [issue report](https://github.com/FQQD/MCServer-Web-Template/issues)
- Joining [my discord](https://dc.fqqd.de) and asking for help

Here's a cookie for reading this far: 🍪
