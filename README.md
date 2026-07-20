# Endurance Intelligence

**Eat your miles.**

Endurance Intelligence is a personal endurance dashboard with adaptive weekly planning, Intervals.icu and optional Strava sync, Garmin ZIP import, workout reviews, equipment tracking, Fuel Lab and a Supabase-backed calendar subscription.

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

Required Supabase secrets:

```text
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
INTERVALS_ATHLETE_ID
INTERVALS_API_KEY
```

The standard Supabase secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are supplied by Supabase to Edge Functions.

## Strava application

Set the Strava authorization callback domain to:

```text
endurance-intelligence.github.io
```

The callback URL used by the application is generated from the deployed Vite base path.

## Open Food Facts

Fuel Lab reads public product data from Open Food Facts. Missing products are kept locally with photo, barcode and manually entered nutrition data. The UI then offers a direct contribution link so the barcode can be completed in Open Food Facts and checked again later.
