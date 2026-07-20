# Endurance Intelligence

**Eat your miles.**

Endurance Intelligence is a personal endurance dashboard with adaptive weekly planning, Intervals.icu activity sync, Garmin ZIP import, workout reviews, equipment tracking, Fuel Lab and a Supabase-backed calendar subscription.

## Local development

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

## Repository and deployment

Target repository:

```text
endurance-intelligence/eym
```

GitHub Pages deploys automatically from `main` using `.github/workflows/deploy.yml`. Vite is configured with:

```text
/eym/
```

Expected production URL:

```text
https://endurance-intelligence.github.io/eym/
```

## Supabase settings

In Supabase Authentication → URL Configuration set:

```text
Site URL:     https://endurance-intelligence.github.io/eym/
Redirect URL: https://endurance-intelligence.github.io/eym/**
```

Deploy the Edge Functions from `supabase/functions` and apply the migrations from `supabase/migrations`.

Required Supabase secrets for the current private Intervals.icu test connection:

```text
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

The standard Supabase secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are supplied by Supabase to Edge Functions.

## Intervals.icu

Intervals.icu is the central activity hub. Users connect Garmin, Strava, Polar or another supported platform under Intervals.icu → Settings → Connections. EYM then imports the consolidated activities from Intervals.icu instead of maintaining separate provider integrations.

For Garmin planned workouts, enable **Upload planned workouts** in the Garmin connection inside Intervals.icu.

The current API-key integration is for the private test account only. Before EYM is opened to multiple users, it must be replaced by a user-specific Intervals.icu OAuth flow.

## Retired direct Strava connection

The direct EYM-to-Strava OAuth integration has been removed. Existing imported activities remain in the user data. The migration `20260720150000_remove_direct_strava.sql` removes the obsolete `strava_connections` token table.

## Open Food Facts

Fuel Lab reads public product data from Open Food Facts. Missing products are kept locally with photo, barcode and manually entered nutrition data. The UI then offers a direct contribution link so the barcode can be completed in Open Food Facts and checked again later.

## Configuration model (v2.9)

Athlete-specific planning data is stored inside the existing `athlete_data.app_data` JSON document. No additional Supabase migration is required for v2.9.

The first load migrates the previous personal settings automatically:

- display name and all existing athlete data stay unchanged
- the former Monday football switch becomes a recurring commitment
- the former Wednesday ORC Run switch becomes a recurring commitment
- an explicitly confirmed Saturday ORC Track becomes a recurring commitment
- plans, reviews, activities, missions, equipment, fuel and calendar tokens are preserved

Users can then maintain profile data, recurring commitments and permitted replacement sports under **Settings**. Deleting all recurring commitments is respected after the one-time migration and does not recreate the legacy entries.

The planner now supports two different adjustment scopes:

1. replace, move or delete selected units without changing the remaining week
2. recalculate selected days or the complete remaining week using the current check-in and configuration

## Fixed-term behavior (v2.9.1)

Recurring commitments now use one explicit planning behavior instead of multiple overlapping checkboxes:

- **Replace**: replaces one open automatically planned endurance session on the same day while retaining mobility/strength and manual entries.
- **Combine**: adds the commitment alongside existing sessions.
- **Exclusive**: reserves the day and removes other open automatically planned sessions.

Saving a recurring commitment changes the planning configuration only. An already generated week is intentionally left untouched and can be changed through **Woche anpassen**.
