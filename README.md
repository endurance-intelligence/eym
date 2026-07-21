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

## Briefing and recurring commitments (v2.9.2)

- Recurring commitments are displayed in weekday order, then by time.
- Coach guidance is shown only in the Coach area instead of being duplicated in the briefing.
- The hydration learning point from the latest reviewed run is now included with the Coach recommendation.

## Information architecture, reviews and mobility coach (v2.10)

- Settings are split into overview, profile, training/planning, connections and data/calendar.
- The briefing focuses on today; readiness and the latest run are compact, and the full week is expandable.
- Weekly recurring commitments are collapsed into a short summary until they are needed.
- Targeted week adjustments show a preview before a unit is replaced, moved or deleted.
- Coach content is grouped into Today, Development, Stabi & Mobility and Knowledge.
- Reviews explicitly refer to the feeling immediately after the workout. Every scale shows both endpoints and translates the selected number into plain language.
- Leg and stomach symptoms can be marked separately from the numeric rating.
- The Stabi & Mobility coach builds 10–30 minute workouts around saved physio exercises and available equipment, including resistance bands, dumbbells/weights and kettlebells.

## Configurable exercise focus and guidance (v2.11)

- Every user can choose up to three personal Stabi & Mobility focus areas, or keep the balanced standard mode.
- Available focus areas include core, ankle/foot, hips/glutes, adductors, back/posture, knee axis, balance, mobility and whole-body strength.
- Focus areas are user configuration, not hard-coded athlete assumptions. New users start with the balanced standard mode and without personal physio exercises.
- Depending on workout duration, EYM prioritizes one or two additional exercises for the selected focus areas and rotates the selection after completed workouts.
- Physio exercises remain a separate optional priority list and are only enabled by the user.
- The exercise library can be searched and filtered by focus area. Each exercise has a schematic movement visual, step-by-step instructions, technique cues, common mistakes and easier/harder variants.
- `.gitattributes` normalizes text files to LF to make future patches consistent on Windows and Unix systems.

## Guided workout timing and familiar exercises (v2.12)

- Every Stabi & Mobility exercise can have a preparation countdown before the active interval.
- Separate transition pauses are inserted between exercises, with an optional longer pause when equipment changes.
- New exercises can receive a longer preparation window than familiar exercises. Physio priorities count as familiar, and users can mark any library exercise as known.
- Opening an exercise guide during a workout pauses the timer; it never continues unseen behind the modal.
- Preparation and transition time count toward the selected workout duration, so a 25-minute workout stays close to 25 minutes.
- All timing preferences and familiar-exercise selections are user-specific and stored in the existing athlete data.

## Audio cues, clearer exercise guidance and plan completion (v2.13)

- The guided Stabi & Mobility workflow uses distinct sounds for countdown, exercise start, exercise end, side changes and workout completion.
- Optional German voice cues announce side changes for bilateral exercises such as side plank, Pallof press, ankle work and adductor exercises.
- Users can store which side currently feels weaker; EYM starts bilateral exercises on that side but keeps both sides at equal duration.
- Frequently misunderstood exercises have clearer German aliases, a 10-second quick-start explanation and dedicated schematic start/movement illustrations.
- Knee-to-wall guidance includes a side-comparison note without treating asymmetry as a diagnosis.
- Completing the full Coach workflow automatically stores the workout and marks today's matching Stabi/Mobility plan item as completed.
- Audio, voice and weak-side settings are user-specific. No database migration is required.

## Expanded ankle library and compact training history (v2.14)

- Adds ankle pumps, single-leg calf raises, clock reaches, band inversion and band dorsiflexion to the configurable exercise library.
- Keeps ankle work user-selectable through the existing focus system; users without an ankle focus continue to receive balanced standard workouts.
- Improves German exercise names, quick-start instructions and schematic movement guides for ankle exercises.
- Keeps the current ISO calendar week open in Training and collapses older weeks into compact summaries that can be opened per KW.

## Fuel Lab enrichment and Open Food Facts contributions (v2.15)

Fuel product cards keep long names to a consistent three-line header. Missing or incomplete catalog entries can be completed inside EYM with barcode, serving data, ingredients, and separate front, nutrition, and ingredients photos. Local values are stored immediately. An authenticated Supabase Edge Function can optionally submit the product data and user-owned photos to Open Food Facts.

Deploy the new function and configure these Supabase secrets before enabling automatic contributions:

- `OPEN_FOOD_FACTS_USER_ID`
- `OPEN_FOOD_FACTS_PASSWORD`
- `OPEN_FOOD_FACTS_USER_AGENT` (recommended format: `EnduranceIntelligence/2.16.0 (contact@example.com)`)
- `OPEN_FOOD_FACTS_APP_SALT` (a random secret used to derive a stable pseudonymous app UUID per EYM user)

## Personal ambient themes (v2.16)

- Adds a user-specific appearance area under **Settings → Darstellung**.
- Includes EYM Green, Miami, Ice Blue, Sunset, Violet and Amber presets.
- Custom mode supports separate primary and secondary colors.
- Ambient glow can be enabled, disabled and adjusted from 0–100 percent.
- Theme changes are previewed immediately and stored inside the existing user-specific `athlete_data.app_data` document.
- The theme engine uses CSS design tokens for backgrounds, surfaces, borders, typography, navigation, cards, buttons, charts and decorative highlights.
- Semantic warning, error and success states remain readable independently of the selected decorative theme.
- No Supabase migration is required.
