# Endurance Intelligence

Current app version: **3.0.1**

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

Once a week has been created, it remains a stable active plan. Users can replace or move selected units, or document a cancellation with a reason, without recalculating the remaining week.

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
- `OPEN_FOOD_FACTS_USER_AGENT` (recommended format: `EnduranceIntelligence/2.19.0 (contact@example.com)`)
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


## Fuel Lab reliability and re-order helper (v2.17)

- Permanently deleted review-derived products are stored as catalog exclusions so cloud reloads and old reviews do not recreate them.
- Fuel saves close the editor and show a short success message. Open Food Facts contributions show a separate sent confirmation.
- The contribution consent control is larger and easier to use on desktop and mobile.
- Low-stock products include a re-order helper. It reads community price observations from Open Prices by barcode and provides direct searches at common German shopping and price-comparison sites. Observed prices may be older and are not guaranteed live inventory.

## Stable weekly workflow and planning gate (v2.18)

- Reorders the main navigation to Briefing, Wochenplan, Coach, Mission and Training before the supporting areas.
- Replaces the large planner information blocks with one compact weekly status strip.
- Keeps recurring commitments collapsed and moves planning logic and Intervals/Garmin details into the action menu.
- Treats an existing week as an active plan: units can be replaced, moved or marked as cancelled, but the remaining week is not recalculated.
- Cancelled appointments remain visible with their reason so the Coach can distinguish external cancellations from fatigue, pain, illness or weather.
- Limits forward navigation to the next week. That week can only be generated after all review-relevant activities from the current week have reviews and every required planned unit is completed, matched, moved or explicitly marked as cancelled.
- Provides a weekly-closure checklist with direct links to missing reviews and unresolved units.
- No Supabase migration is required. The new cancellation and planner state remain inside the existing athlete data document.


## Planner dialog, collapsible months and next-day preview (v2.18.1)

- Gives the cancellation workflow more horizontal room and switches to a single-column layout earlier on laptops and tablets.
- Keeps cancellation reason, note and Coach explanation readable without clipped action buttons.
- Makes activity history collapsible by month as well as by ISO calendar week. The current month and current week remain open by default.
- Adds a compact tomorrow preview below today's Briefing so the next planned session is visible without opening the full week.
- No Supabase migration is required.

## Nutrition-label OCR, sodium and compact Fuel reviews (v2.19)

- Adds sodium per serving and per 100 g/ml to Fuel Lab products, review totals and Coach fuel summaries.
- Drink powders can store product quantity per mixture, scoop count and the volume of finished drink. A review can therefore record the amount actually consumed in millilitres; EYM converts it to mixtures, carbohydrates, sodium, caffeine and stock usage.
- Nutrition-table photos are processed locally in the browser with Tesseract.js. Recognized values are copied into editable fields and must be checked against the packaging before saving.
- Stores the complete nutrition table (energy, carbohydrates, sugar, fat, protein, salt, sodium, magnesium, calcium, vitamin B1 and caffeine) while keeping only training-relevant values prominent.
- Review fueling uses two explicit modes: select a product from Fuel Lab or enter a one-off item manually. Brand, product name and nutrients are hidden when a catalog product is selected.
- Historical-stock guidance is shown once for the whole fueling section instead of being repeated for every item.
- Carbohydrate feedback now explains the result in relation to activity duration and stomach tolerance. Sodium is reported neutrally because an individual target depends on sweat rate, conditions and salt loss.
- The Open Food Facts function submits the expanded nutrition values and remains responsible for optional photo uploads. Redeploy `open-food-facts` after applying this version.
- No database migration is required; the new fields remain within the existing athlete data document.


## Planer-Prinzipien ab v3.1

- Das Hauptevent und priorisierte Zwischenziele bestimmen die Trainingsmethodik.
- Belastung wird relativ zur individuellen Historie, Laufhäufigkeit, Erholung und Zielart bewertet.
- Eine bereits geplante Woche bleibt stabil und wird nie automatisch neu berechnet.
- Profilentwicklung und zusätzliche Einheiten werden nur vorgeschlagen und müssen bestätigt werden.
- Subjektives Review und datenbasierte Coach-Analyse bleiben getrennte Perspektiven.
- Höhenmeter, Wetter, Herzfrequenz, Dauer und Zielrelevanz fließen in die Aktivitätsanalyse ein.

## Briefing v3.1.1

- The briefing header now evaluates the weather for a fixed training time instead of only showing current conditions.
- Flexible outdoor sessions receive a suggested two-hour weather window based on rain, temperature, humidity, wind and gusts.
- Mission, readiness and latest activity are condensed into three compact cards so today's plan remains visible without scrolling.
- Full weather details and the complete week stay available on demand.
- Hydration recommendations require a sufficiently long activity and a plausible sweat-rate range. Short or implausible measurements show a validation hint instead of extreme litre-per-hour advice.
- EYM still never changes a planned session automatically; weather and load information remain optional guidance.
