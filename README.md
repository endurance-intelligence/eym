# Endurance Intelligence

Current app version: **3.7.8**

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

Create a clean source archive without Git history, installed dependencies or build output:

```bash
git archive --format=zip --output eym-source.zip HEAD
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
INTERVALS_OWNER_USER_ID
```

The standard Supabase secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are supplied by Supabase to Edge Functions.

## Intervals.icu

Intervals.icu is the central activity hub. Users connect Garmin, Strava, Polar or another supported platform under Intervals.icu → Settings → Connections. EYM then imports the consolidated activities from Intervals.icu instead of maintaining separate provider integrations.

For Garmin planned workouts, enable **Upload planned workouts** in the Garmin connection inside Intervals.icu.

The current API-key integration is for the private test account only. Before EYM is opened to multiple users, it must be replaced by a user-specific Intervals.icu OAuth flow.

`INTERVALS_OWNER_USER_ID` must contain the UUID of the Supabase Auth user who owns the private Intervals.icu credentials. Other authenticated EYM accounts receive no access to this connection.

For a controlled onboarding test, keep public registration disabled and create the tester under **Supabase → Authentication → Users → Add user**. On first confirmed login, EYM creates a separate `athlete_data` row for that UUID. Existing rows are not updated, and RLS limits every account to its own athlete document and image folder.

## Retired direct Strava connection

The direct EYM-to-Strava OAuth integration has been removed. Existing imported activities remain in the user data. Fresh deployments no longer create the obsolete `strava_connections` token table; existing environments can remove that legacy table separately after its old tokens are no longer needed.

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
- `OPEN_FOOD_FACTS_USER_AGENT` (recommended format: `EnduranceIntelligence/3.2.5 (contact@example.com)`)
- `OPEN_FOOD_FACTS_APP_SALT` (a random secret used to derive a stable pseudonymous app UUID per EYM user)

## Personal ambient themes (v2.16)

- Adds a user-specific appearance area under **Settings → Darstellung**.
- Includes Original Green, Miami, Ice Blue, Sunset, Violet and Amber presets.
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
- Drink powders keep product portions and fluid separate. Reviews record the number of portions, the mixed volume per portion and the amount actually consumed. Carbohydrates and stock usage follow the product portions, while hydration follows the consumed millilitres.
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

## Stability and private image storage v3.2

- Personal recurring commitments remain user configuration. Fresh configurations do not create ORC, football or other athlete-specific appointments automatically.
- Cloud writes use the last known `updated_at` value. A newer state from another device is reported as a conflict instead of being overwritten silently.
- Fuel and equipment photos are stored in the private `athlete-images` bucket. Deterministic object paths mean replacements overwrite the existing file and deletion removes the associated objects.
- Existing embedded Base64 photos migrate automatically after login. The app only replaces an image in the current state when it still matches the migrated source, so concurrent local edits are preserved.
- Settings can export and restore a versioned JSON backup. Route-loading failures now show a safe reload screen.
- Automated tests cover generic recurring commitments, activity deduplication, fuel inventory calculations and backup validation.

## Controlled Stabi & Mobility shuffle v3.2.1

- **Neu mischen** creates another valid exercise selection and order without changing duration, condition, equipment or selected focus areas.
- EYM prefers a variant with a different opening exercise and keeps every available personal physio priority in the workout.
- The quiet finisher remains at the end when it fits the selected duration. Starting the workout freezes the current order.
- Shuffling is local session state and does not create unnecessary cloud writes.

## Active Stabi & Mobility duration v3.2.2

- The selected duration now represents active movement time. Preparation and equipment changes no longer reduce the requested training volume.
- EYM displays the expected total session duration separately, including preparation and transitions.
- Completed workouts continue to store their actual total duration so the training history remains honest.

## Navigation and training clarity v3.2.3

- Briefing summary cards link directly to Mission, Coach development and Training; the daily and weekly summaries link to the planner.
- Coach development marks exactly one current mission phase with a stronger visual treatment.
- The planner uses stored activity groups, so an ORC warm-up, main set and cool-down combined in Training appear as one matched workout.
- Planner surfaces now follow the selected user theme. Completed items remain readable with a check mark instead of strikethrough text.
- Training rows switch to a single-column touch layout on phones with clear Review and Name-change controls.

## Adaptive Stabi & Mobility v3.2.4

- Every Stabi & Mobility guide offers a direct Google search for the exercise name, description and correct execution videos.
- The first search opens a dedicated tab; later searches reuse it instead of creating tab clutter. EYM's own instructions remain available.
- Physio exercises explicitly remind the athlete that their personally demonstrated execution takes priority over external variants.
- Completed exercises are counted across the latest 30 stored workouts. Frequently repeated non-physio exercises are deprioritized when a suitable alternative exists, while personal physio priorities remain fixed.
- The personal focus selector collapses to a compact active summary after configuration.
- Rule-based coach suggestions can temporarily prioritize active recovery after back-to-back running or repeated low recovery reviews. They only affect the current workout or the current week after explicit acceptance.
- Planned training, preparation and total duration use the same second-accurate display so their values remain consistent.

## Mobility audio cues v3.2.5

- A clearly audible three-tone countdown marks the final three seconds before an exercise starts and before it ends.
- Distinct ascending and descending signals separate exercise start from exercise completion.
- Existing spoken side-change cues remain active for bilateral exercises.
- Transition and preparation phases no longer produce duplicate countdowns.
- The timer settings include a combined countdown, start and end-signal preview.

## Training insights and one Coach state v3.3.0

- Analytics now evaluates rolling weekly volume, consistency, planned-versus-completed running, training mix, long runs, back-to-back blocks, review coverage, Fuel practice and data confidence.
- Goal specificity is derived from the configured target instead of presenting one opaque readiness number as absolute truth.
- Briefing, Coach and Planner consume one shared Coach state. Recovery warnings take precedence over neutral planning signals, so the three areas no longer issue contradictory headlines.
- Every recommendation exposes its evidence and keeps the existing plan protected. Helpful/not-helpful feedback is stored with the recommendation and linked to the next available run review.

## Reliability, mobile workout and generic defaults v3.4.0

- Fresh accounts no longer receive Heartbeat Ultra, Backyard, ORC or football data. Existing personal missions, appointments, history and reviews remain untouched during local, cloud and backup migrations.
- Legacy ORC/football controls are visible only while a legacy personal configuration or matching weekly entry still exists. Generic recurring commitments remain the standard workflow.
- Guided Stabi & Mobility uses the Screen Wake Lock API where supported and becomes a full-screen, touch-friendly workout view on phones.
- A relative-scope web app manifest and service worker prepare EYM for installation and provide a cached application shell on GitHub Pages.
- Regression tests cover stable generated content, supplied reference dates, generic defaults, backups, wake lock behavior and the PWA shell.

## Fact-grounded Coach questions v3.5.0

- Coach questions answer four narrow topics: current recommendation, training trend, goal relevance and data confidence.
- Answers are assembled only from the shared Coach state and expose the supporting EYM facts directly below the text.
- The grounded context explicitly forbids invented measurements, medical diagnosis and automatic plan changes.
- No activity or health data is sent to an external AI provider. The fact packet is a safe integration boundary for a later optional language model.

## Planner commitment hotfix v3.5.1

- Stored recurring appointments remain actionable even when the active week was created before the appointment was added.
- A missing appointment can replace only a compatible automatically planned unit on the same day; mobility, strength work and the rest of the week remain unchanged.
- “Diese Woche aussetzen” records a week-only cancellation while preserving the recurring appointment in Settings.

## Stable planner reviews and structured track workouts v3.5.2

- Coach suggestions use at most two roomy columns on desktop and one column on narrower screens. Week navigation keeps its own space instead of overlapping the Coach card.
- The weekly planning gate only waits for activities that can actually receive a review. Football and unsupported activity types can no longer create an impossible review requirement.
- Reviews on stored ORC groups and equivalent Garmin/Intervals.icu imports count as the same completed feedback. Sunday preview and Monday planning evaluate the same completed week.
- ORC Track sessions can be configured as intervals or sprints with distance- or time-based work and recovery, repetitions, warm-up and cool-down.
- The Intervals.icu edge function converts the stored track definition into native repeat steps for Garmin. After deploying this version, redeploy the `intervals` Supabase function.

## Mixed track blocks and LAP control v3.5.3

- A track round can contain up to 16 freely ordered work and recovery steps. This supports mixed blocks such as 1200 m work, 400 m recovery, 800 m work and 400 m recovery.
- The complete sequence can be repeated for a configurable number of rounds. Individual steps can use distance in meters or duration in seconds.
- Warm-up and cool-down are advanced with the Garmin LAP button instead of ending after a fixed duration. Intervals.icu still receives internal estimates solely for load calculation.
- Existing v3.5.2 interval settings are migrated automatically into the new two-step sequence when the workout is opened or saved.

## Track workout template archive v3.5.4

- Interval and sprint definitions can be saved under a personal name and reused from the planner.
- Loading a template copies its current content into the selected appointment. Small appointment-specific changes do not silently overwrite the archived template.
- Existing templates can be updated explicitly, saved as a separate copy or removed without changing the workout currently being edited.
- Templates are stored in the existing cloud configuration and included in normal EYM backups.
- The track editor uses a wider desktop modal and keeps the archive and step controls in a single-column touch layout on phones.

## Spontaneous sessions and weather slots v3.5.5

- Automatically planned runs, rides, strength and mobility sessions no longer receive invented clock times. Only configured fixed appointments keep their time by default.
- The workout editor offers a clear `Spontan` switch. Turning it off reveals a time field for the rare session that should receive an explicit start time.
- Existing active weeks are not rewritten. Legacy non-fixed sessions are interpreted as spontaneous in Planner, Briefing and the Intervals.icu publication fingerprint.
- The Briefing places a prominent two-hour recommendation below the greeting for today's spontaneous run or road ride. Cycling windows apply a stronger rain and wind penalty.
- Weather remains advisory: EYM never moves or changes the active week automatically.
- Intervals.icu receives spontaneous sessions as date-based midnight calendar events, while fixed appointments keep their real start time. Redeploy the `intervals` Supabase function after installing this version.

## Provisional track workouts and easy rowing baseline v3.5.6

- Track numbers remain editable while a field is empty and are validated only on blur or save, preventing fallback values from being appended while typing.
- New track definitions start as `Vorläufig`. They are stored in the selected EYM appointment but excluded from Garmin publication until explicitly changed to `Final`.
- Existing structured track workouts remain final for backward compatibility. Appointment edits do not alter the named template archive unless `Vorlage aktualisieren` is selected.
- The weekly planner shows provisional track badges and clearly lists skipped provisional workouts before an Intervals.icu/Garmin update.
- Easy rowing defaults to a configurable 5,000 m in 35 minutes with a 24–26 SPM guidance range. It remains a steady aerobic calendar session rather than an automatically generated rowing interval workout.
- Rowing distance is no longer counted toward the weekly running-kilometre target.
- No database migration is required. Redeploy the `intervals` Supabase function so the server also rejects provisional track workouts from older or cached clients.

## Planner quick edit and track totals v3.5.7

- Clicking the content of a planned workout opens it directly; the completion, cancellation and archive controls keep their separate actions.
- Track planning totals work and distance-based recovery kilometres separately, then shows an estimated overall range with 2–3 km each for the LAP-controlled warm-up and cool-down.
- Time-based steps remain clearly marked because their distance can only be known after the workout.
- No database migration or Supabase function deployment is required for this update.

## Guided first-run onboarding v3.6.0

- New accounts start with a five-step onboarding for personal details, current training baseline, mission, weekly availability and optional recurring commitments.
- Only the information required for a safe initial planning frame is mandatory. Birth date, height, weight and a concrete event remain optional.
- Current runs per week, recent weekly kilometres and the recent longest run form the initial athlete baseline until imported activity history becomes available.
- The first generated week uses that declared baseline instead of falling back to a generic 25 km minimum. A new runner starting at zero with two selected run days therefore receives an 8 km entry frame rather than an unsafe endurance default.
- Fresh accounts no longer inherit personal running, rowing, mobility or double-session weekdays. These are chosen during onboarding.
- Completing onboarding stores configuration only. It does not generate a week, publish a workout or change a calendar.
- Existing cloud data, local state and pre-onboarding backups are recognized as established accounts and bypass the flow automatically. Plans, activities, reviews, goals, equipment, fuel, recurring commitments and tokens remain untouched.
- No database migration or Supabase function deployment is required. Onboarding state and the additional profile baseline fields remain inside the existing `athlete_data.app_data` document.

## Account isolation and Garmin pace targets v3.6.1

- Browser state and the cached weather position are stored under the authenticated Supabase user ID. Signing out and using another account in the same browser can no longer copy the previous athlete's local state or location into a fresh account.
- Existing `athlete_data` rows, plans, activities, reviews, calendar tokens and private images remain unchanged. No database migration is required.
- The private Intervals.icu API-key connection is accepted only for the Supabase UUID configured in `INTERVALS_OWNER_USER_ID`. Other accounts remain disconnected until a user-specific OAuth flow is added.
- Every structured track step can carry an absolute target pace and a tolerance. A target of `4:40/km` with `±5 s` is exported as `4:35-4:45/km Pace`, allowing Garmin to guide and alert during that step.
- Existing track workouts without a target pace continue to use the previous Z5 work target. Saved templates retain new pace targets; recovery targets are intentionally omitted from the Garmin export since v3.7.4.
- Set a Running Threshold Pace in Intervals.icu and enable **Upload planned workouts** in its Garmin connection. Redeploy the `intervals` function after applying this version.

## Daily Fuel Partner v3.7.0

- Fuel Lab now starts with a Fuel Partner for every upcoming planned run. The nearest run opens automatically, while other future runs remain selectable.
- Recommendations use planned duration, running context, stored weather, existing Fuel Lab products, successful Fuel reviews and reliable measured sweat rates.
- Normal, Fuel-Training and Wettkampf modes keep a short easy run, a deliberate gut-training session and a performance-oriented race strategy separate.
- Drink carbohydrates count toward the total before gels or bars are added. Caffeine is never selected automatically.
- Consumption and packing are separate. The packing list can add one reserve for long sessions or races without pretending that the reserve was consumed.
- Product quantities, sodium and current inventory are evaluated together. Missing product data and insufficient stock are shown before the run.
- Every open planned run receives a compact Fuel hint in the weekly planner with a direct link to its strategy.
- When the completed activity is reviewed, planned products and fluid volume are prefilled. The athlete confirms or corrects actual consumption; inventory is reduced only when the review is saved.
- Recommendations start from duration-based sports-nutrition ranges and progress only through well-tolerated personal reviews. Reliable pre/post body-mass measurements can personalize fluid guidance.
- Existing plans, reviews, Fuel Lab products and inventory remain unchanged. The additional mode and review references stay inside `athlete_data.app_data`; no database migration or Supabase function deployment is required.

## Direct briefing workout navigation v3.7.1

- Every actionable row in today's briefing is now a direct link instead of a static summary.
- Planned workouts and completed plan-only sessions open their exact planner editor immediately.
- Completed or additional imported activities open their exact Training review immediately.
- Rest-day rows remain non-interactive. Hover, focus and touch affordances make the destination visible without changing the daily layout.
- No database migration or Supabase function deployment is required.

## Track template names in the weekly planner v3.7.2

- Structured ORC Track and interval appointments show their saved template name in the compact detail row between workout type and planned metrics.
- Technical shorthand remains unchanged in storage but is presented with readable separators such as `×`, `@` and `/`.
- Older appointments without a saved template name keep their existing layout.
- No database migration or Supabase function deployment is required.

## Planner startup hotfix v3.7.3

- The weekly planner now treats missing or legacy `structuredWorkout` values as workouts without a template label.
- Non-track sessions and older plan entries no longer crash the planner after the v3.7.2 template-label update.
- No athlete data is changed. No database migration or Supabase function deployment is required.

## Target-free recovery steps v3.7.4

- Warm-up, recovery and cool-down steps are exported to Intervals.icu without a pace target, so Garmin does not raise pace alerts during easy or walking sections.
- LAP-controlled warm-up and cool-down remain open. Distance- and time-based recovery steps keep their original duration.
- Work intervals retain their configured absolute pace ranges. Legacy work intervals without an absolute pace keep the previous Z5 target.
- Existing athlete data and saved workout templates remain unchanged. No database migration is required.
- Redeploy the `intervals` Supabase function after applying this version, then resend the affected week to Garmin.

## Fuel Lab tabs v3.7.5

- Fuel Partner and product inventory now live in two separate Fuel Lab tabs instead of one long mixed page.
- Fuel Partner remains the default destination, including direct links from planned workouts.
- Product creation, editing, inventory, archived products and re-order actions stay together in the Products tab.
- The selected planned workout remains available when switching between both tabs.
- Existing products, inventory, plans and Fuel Partner recommendations remain unchanged. No database migration or Supabase function deployment is required.

## Session states and review flow v3.7.6

- Completed sessions open their linked review directly from the briefing; completed plan items without an imported activity still open the plan entry.
- Edit, cancellation and archive actions disappear from completed weekly-plan rows.
- Fixed appointments can only be manually completed after their scheduled end; future sessions no longer show a misleading empty completion control.
- Completed rows use a neutral theme-safe surface with a green status marker instead of a large green tint.

## Focused navigation and coach cleanup v3.7.7

- The main navigation is reduced to Briefing, Training, Coach, Fuel Lab and Settings.
- Week, sessions, goals and analysis are grouped as tabs inside Training without changing their existing deep links.
- Equipment is now a Settings section; the former `/equipment` route forwards to the new location.
- Coach knowledge duplicates and the recommendation-history card are removed. HF and weather remain under Today, while Fuel Partner owns fuel learning.

## Review baseline, coach clarity and mixed drinks v3.7.8

- Review coverage starts at 1 July 2026 for established accounts and at the Supabase registration date for every new account. Older imported activities, future sessions and cancelled sessions do not lower the result.
- Missing reviews are listed individually with a direct link to the exact activity review.
- Visible system shorthand is replaced with natural Coach language. The redundant Coach questions block is removed.
- Post-activity analysis leads with one clear summary, followed by load, execution and recovery consequence. Supporting measurements remain available on demand.
- Drink-powder reviews separate portions from prepared and consumed fluid. One portion therefore keeps the same carbohydrates in a 500 ml or 650 ml bottle, while hydration is calculated from the amount actually consumed.
- No database migration is required. Redeploy the `intervals` Supabase function after applying this version.

For fresh installations that have not yet applied the athlete-image cleanup, run `supabase/migrations/20260722120000_athlete_images.sql` once. Afterwards run:

```bash
npm test
npm run lint
npm run build
```
