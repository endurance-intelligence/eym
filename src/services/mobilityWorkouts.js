export const MOBILITY_EQUIPMENT = [
  { id: "mat", label: "Matte" },
  { id: "band", label: "Gummiband / Miniband" },
  { id: "dumbbells", label: "Gewichte / Kurzhanteln" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "step", label: "Bank / stabile Stufe" },
];

export const MOBILITY_FOCUS_AREAS = [
  {
    id: "core",
    label: "Core & Rumpf",
    shortLabel: "Core",
    description: "Rumpfspannung, Beckenstabilität und kontrollierte Kraftübertragung.",
  },
  {
    id: "ankle",
    label: "Sprunggelenk & Fuß",
    shortLabel: "Sprunggelenk",
    description: "Beweglichkeit, Fußgewölbe, Waden- und Schienbeinmuskulatur.",
  },
  {
    id: "hips",
    label: "Hüfte & Gesäß",
    shortLabel: "Hüfte",
    description: "Hüftstabilität, Gesäßkraft und eine ruhige Beckenführung.",
  },
  {
    id: "adductors",
    label: "Adduktoren",
    shortLabel: "Adduktoren",
    description: "Innenschenkel kontrolliert kräftigen und beweglich halten.",
  },
  {
    id: "back",
    label: "Rücken & Haltung",
    shortLabel: "Rücken",
    description: "Wirbelsäulenbeweglichkeit, Schultergürtel und aufrechte Haltung.",
  },
  {
    id: "knee-axis",
    label: "Knie & Beinachse",
    shortLabel: "Beinachse",
    description: "Kontrollierte Knieausrichtung und einbeinige Stabilität.",
  },
  {
    id: "balance",
    label: "Balance & Koordination",
    shortLabel: "Balance",
    description: "Einbeinstand, Körperkontrolle und koordinierte Bewegungen.",
  },
  {
    id: "mobility",
    label: "Beweglichkeit",
    shortLabel: "Beweglichkeit",
    description: "Ruhige Mobilisation für Hüfte, Rücken, Sprunggelenk und Brustwirbelsäule.",
  },
  {
    id: "strength",
    label: "Ganzkörperkraft",
    shortLabel: "Kraft",
    description: "Grundübungen mit Körpergewicht, Kurzhanteln oder Kettlebell.",
  },
];

const exercise = (definition) => ({
  seconds: 60,
  equipment: [],
  focusAreas: [],
  intensity: "medium",
  steps: [],
  cues: [],
  mistakes: [],
  quickStart: "",
  sideSwitch: false,
  switchCue: "Seite wechseln",
  asymmetryNote: "",
  ...definition,
});

export const MOBILITY_EXERCISES = [
  exercise({
    id: "cat-cow",
    name: "Katze-Kuh",
    group: "Mobilität",
    seconds: 60,
    physioDefault: true,
    focusAreas: ["back", "mobility"],
    visual: "cat-cow",
    purpose: "Mobilisiert die Wirbelsäule und macht die Bewegung des Beckens bewusst.",
    instruction: "Im Vierfüßler langsam zwischen Rundrücken und sanfter Streckung wechseln. Nicht ins Endgefühl drücken.",
    steps: ["Vierfüßlerstand einnehmen.", "Wirbelsäule Wirbel für Wirbel runden.", "Danach kontrolliert in die sanfte Streckung wechseln."],
    cues: ["Langsam atmen", "Schultern weg von den Ohren", "Bewegung nicht erzwingen"],
    mistakes: ["Schwung holen", "Nur den Kopf bewegen", "Ins Hohlkreuz drücken"],
    easier: "Bewegungsumfang verkleinern.",
    harder: "Am Ende jeder Position zwei ruhige Atemzüge halten.",
  }),
  exercise({
    id: "ankle-circles",
    name: "Fußkreisen",
    group: "Fuß & Sprunggelenk",
    seconds: 90,
    physioDefault: true,
    focusAreas: ["ankle", "mobility"],
    visual: "ankle-circles",
    purpose: "Bewegt das Sprunggelenk in alle Richtungen und verbessert die Gelenkwahrnehmung.",
    instruction: "Je Fuß kontrolliert in beide Richtungen kreisen. Das Knie möglichst ruhig halten.",
    steps: ["Im Sitzen oder Liegen ein Bein leicht anheben.", "Den Fuß langsam nach außen kreisen.", "Richtung wechseln und anschließend die Seite tauschen."],
    cues: ["Große, ruhige Kreise", "Knie bleibt still", "Beide Richtungen trainieren"],
    mistakes: ["Zu schnell kreisen", "Das ganze Bein mitdrehen", "Nur kleine Zehenbewegungen"],
    easier: "Ferse auflegen und nur den Vorfuß bewegen.",
    harder: "Mit dem Fuß langsam das Alphabet in die Luft schreiben.",
  }),
  exercise({
    id: "ankle-pumps",
    name: "Fußwippe (Fußspitze hoch und tief)",
    subtitle: "Ankle Pumps · Sprunggelenk bewusst bewegen",
    quickStart: "Setz dich hin oder leg dich auf den Rücken. Ziehe die Fußspitzen kräftig Richtung Schienbein und drücke sie danach kontrolliert von dir weg.",
    group: "Fuß & Sprunggelenk",
    seconds: 60,
    focusAreas: ["ankle", "mobility"],
    visual: "ankle-pumps",
    purpose: "Bewegt das Sprunggelenk ohne Körpergewicht und macht den gesamten Weg nach oben und unten bewusst.",
    instruction: "Fersen liegen auf. Fußspitzen abwechselnd Richtung Schienbein ziehen und kontrolliert nach vorn strecken.",
    steps: ["Im Sitzen oder Liegen beide Fersen auflegen.", "Fußspitzen so weit wie angenehm Richtung Schienbein ziehen.", "Anschließend kontrolliert nach vorn strecken und ruhig wiederholen."],
    cues: ["Knie und Beine bleiben ruhig", "Beide Richtungen vollständig nutzen", "Nicht ruckartig arbeiten"],
    mistakes: ["Nur die Zehen bewegen", "Mit den ganzen Beinen wippen", "In einen schmerzhaften Endbereich drücken"],
    easier: "Nur einen Fuß gleichzeitig bewegen.",
    harder: "In der oberen und unteren Position jeweils zwei Sekunden halten.",
  }),
  exercise({
    id: "band-adduction",
    name: "Adduktoren mit Gummiband",
    quickStart: "Stell dich seitlich zur Bandbefestigung. Das Band zieht das Arbeitsbein nach außen; führe das gestreckte Bein langsam zur Körpermitte.",
    sideSwitch: true,
    group: "Physio",
    seconds: 120,
    equipment: ["band"],
    physioDefault: true,
    focusAreas: ["adductors", "hips"],
    visual: "band-adduction",
    purpose: "Kräftigt die Oberschenkelinnenseite bei stabiler Beckenposition.",
    instruction: "In der vom Physio gezeigten Variante arbeiten. Becken stabil halten und jede Seite langsam ausführen.",
    steps: ["Band seitlich befestigen und am Arbeitsbein anlegen.", "Aufrecht und stabil stehen.", "Bein kontrolliert zur Körpermitte führen und langsam zurücklassen."],
    cues: ["Becken bleibt gerade", "Standbein leicht gebeugt", "Keine ruckartige Bewegung"],
    mistakes: ["Oberkörper zur Seite kippen", "Band zurückschnellen lassen", "Fuß stark ausdrehen"],
    easier: "Leichteres Band oder kleinerer Bewegungsweg.",
    harder: "Schwereres Band oder kurze Haltephase an der Körpermitte.",
  }),
  exercise({
    id: "adductor-rockback",
    name: "Adduktoren-Rockback (Vierfüßler)",
    subtitle: "Innenschenkel im Vierfüßler mobilisieren",
    quickStart: "Vierfüßlerstand. Ein Bein gestreckt zur Seite, Fuß am Boden. Schiebe das Gesäß langsam Richtung Ferse und wieder nach vorn.",
    sideSwitch: true,
    group: "Mobilität",
    seconds: 75,
    equipment: ["mat"],
    focusAreas: ["adductors", "hips", "mobility"],
    visual: "adductor-rockback",
    purpose: "Mobilisiert die Adduktoren kontrolliert, ohne lange statisch zu dehnen.",
    instruction: "Im Vierfüßler ein Bein seitlich ausstrecken und das Becken kontrolliert nach hinten schieben.",
    steps: ["Aus dem Vierfüßler ein Bein seitlich ausstrecken.", "Fuß flach oder Ferse am Boden lassen.", "Becken langsam nach hinten schieben und wieder nach vorn kommen."],
    cues: ["Rücken bleibt lang", "Becken gerade halten", "Nur bis zu einem angenehmen Zug"],
    mistakes: ["Rundrücken machen", "Zu weit nach hinten drücken", "Ausgestrecktes Knie verdrehen"],
    easier: "Bein weniger weit seitlich ausstellen.",
    harder: "In der hinteren Position einen Atemzug halten.",
  }),
  exercise({
    id: "dead-bug",
    name: "Dead Bug (Arm/Bein diagonal)",
    subtitle: "Rückenlage · diagonal Arm und Bein absenken",
    quickStart: "Lege dich auf den Rücken. Arme zeigen zur Decke, Hüfte und Knie sind 90 Grad gebeugt. Senke rechten Arm und linkes Bein, dann umgekehrt.",
    group: "Rumpf",
    seconds: 60,
    equipment: ["mat"],
    focusAreas: ["core"],
    visual: "dead-bug",
    purpose: "Trainiert tiefe Rumpfspannung, während Arme und Beine unabhängig bewegt werden.",
    instruction: "Lendenwirbelsäule ruhig halten. Gegenüberliegenden Arm und Bein langsam absenken und zurückführen.",
    steps: ["Auf den Rücken legen, Hüfte und Knie etwa 90 Grad beugen.", "Arme über den Schultern halten.", "Gegenüberliegenden Arm und ein Bein langsam absenken, zurückführen und wechseln."],
    cues: ["Unterer Rücken bleibt ruhig", "Lang ausatmen", "Langsame Bewegung"],
    mistakes: ["Hohlkreuz entstehen lassen", "Arme und Beine zu tief absenken", "Zu schnell wechseln"],
    easier: "Nur die Ferse abtippen oder nur einen Arm bewegen.",
    harder: "Beine weiter strecken oder ein leichtes Gewicht halten.",
  }),
  exercise({
    id: "bird-dog",
    name: "Bird Dog",
    subtitle: "Vierfüßler · diagonal Arm und Bein strecken",
    quickStart: "Vierfüßlerstand. Strecke rechten Arm und linkes Bein gleichzeitig lang aus, zurück zur Mitte, dann die andere Diagonale.",
    group: "Rumpf",
    seconds: 60,
    equipment: ["mat"],
    focusAreas: ["core", "back", "balance"],
    visual: "bird-dog",
    purpose: "Verbindet Rumpfspannung, Beckenstabilität und diagonale Koordination.",
    instruction: "Gegenüberliegenden Arm und Bein strecken. Becken und Rumpf bleiben möglichst unbewegt.",
    steps: ["Vierfüßlerstand mit Händen unter den Schultern.", "Einen Arm nach vorn und das gegenüberliegende Bein nach hinten führen.", "Kurz stabilisieren, kontrolliert zurück und Seite wechseln."],
    cues: ["Becken zeigt zum Boden", "Nacken bleibt lang", "Nicht höher als der Rücken strecken"],
    mistakes: ["Hüfte aufdrehen", "Ins Hohlkreuz fallen", "Arm und Bein hochwerfen"],
    easier: "Nur einen Arm oder nur ein Bein anheben.",
    harder: "Unter dem Körper Ellenbogen und Knie zusammenführen.",
  }),
  exercise({
    id: "pallof-press",
    name: "Pallof Press (Anti-Rotation mit Band)",
    subtitle: "Band gegen Rotation nach vorn drücken",
    quickStart: "Befestige das Band auf Brusthöhe. Stell dich seitlich dazu, halte es vor der Brust und drücke beide Hände gerade nach vorn, ohne dich zum Band zu drehen.",
    sideSwitch: true,
    group: "Rumpf",
    seconds: 60,
    equipment: ["band"],
    focusAreas: ["core"],
    visual: "pallof-press",
    purpose: "Trainiert den Rumpf gegen Rotation – hilfreich für eine stabile Laufhaltung.",
    instruction: "Seitlich zum befestigten Band stehen, Hände vor der Brust halten und langsam nach vorn drücken, ohne den Rumpf zu verdrehen.",
    steps: ["Band auf Brusthöhe seitlich befestigen.", "Seitlich zum Zug stehen und Band vor der Brust halten.", "Arme ausstrecken, kurz stabil bleiben und zurückführen; Seite wechseln."],
    cues: ["Rippen über dem Becken", "Becken bleibt gerade", "Band kontrollieren"],
    mistakes: ["Zum Band drehen", "Schultern hochziehen", "Zu schweres Band wählen"],
    easier: "Näher am Befestigungspunkt stehen.",
    harder: "Weiter weg stehen oder im halben Kniestand arbeiten.",
  }),
  exercise({
    id: "forearm-plank",
    name: "Unterarmstütz (Plank)",
    subtitle: "Körper wie ein gerades Brett halten",
    quickStart: "Ellenbogen unter die Schultern, Unterarme am Boden, Beine lang. Hebe Knie und Becken an und halte den Körper von Kopf bis Ferse in einer Linie.",
    group: "Rumpf",
    seconds: 45,
    equipment: ["mat"],
    focusAreas: ["core"],
    visual: "plank",
    purpose: "Kräftigt den Rumpf isometrisch und verbessert die Ganzkörperspannung.",
    instruction: "Bauch und Gesäß aktiv halten. Bei nachlassender Form auf den Knien fortsetzen oder pausieren.",
    steps: ["Unterarme aufstützen und Beine nach hinten strecken.", "Körper in einer langen Linie halten.", "Ruhig weiteratmen und Spannung sauber halten."],
    cues: ["Gesäß anspannen", "Bauchnabel sanft einziehen", "Boden aktiv wegdrücken"],
    mistakes: ["Hüfte hängt durch", "Gesäß zu hoch", "Luft anhalten"],
    easier: "Knie absetzen.",
    harder: "Abwechselnd einen Fuß wenige Zentimeter anheben.",
  }),
  exercise({
    id: "side-plank",
    name: "Seitstütz",
    subtitle: "Seitliche Plank auf dem Unterarm",
    quickStart: "Lege dich seitlich ab, Ellenbogen direkt unter der Schulter. Hebe das Becken an und halte Schulter, Hüfte und Füße möglichst in einer Linie.",
    sideSwitch: true,
    group: "Rumpf",
    seconds: 60,
    equipment: ["mat"],
    focusAreas: ["core", "hips"],
    visual: "side-plank",
    purpose: "Kräftigt seitliche Rumpfmuskulatur und Hüftstabilität.",
    instruction: "Etwa zur Hälfte die Seite wechseln. Schulter aktiv wegdrücken und das Becken stabil halten.",
    steps: ["Seitlich auf dem Unterarm abstützen.", "Becken anheben und Körper lang halten.", "Ruhig atmen, danach kontrolliert die Seite wechseln."],
    cues: ["Ellenbogen unter der Schulter", "Becken nach vorn ausrichten", "Kopf in Verlängerung"],
    mistakes: ["Becken sinkt ab", "Schulter fällt ein", "Oberkörper dreht nach vorn"],
    easier: "Unteres Knie ablegen.",
    harder: "Oberes Bein anheben.",
  }),
  exercise({
    id: "slow-mountain-climber",
    name: "Langsame Bergsteiger",
    group: "Rumpf dynamisch",
    seconds: 45,
    equipment: ["mat"],
    focusAreas: ["core", "hips"],
    intensity: "high",
    visual: "mountain-climber",
    purpose: "Fordert dynamische Rumpfspannung bei wechselnder Beinbewegung.",
    instruction: "Knie abwechselnd ruhig nach vorn führen. Kein Sprint: Rumpfspannung und saubere Bewegung zählen.",
    steps: ["Hohe Stützposition einnehmen.", "Ein Knie kontrolliert in Richtung Brust führen.", "Zurückstellen und langsam die Seite wechseln."],
    cues: ["Schultern über den Händen", "Becken ruhig", "Langsamer als beim Konditionstraining"],
    mistakes: ["Hüpfen", "Rücken rund machen", "Hüfte stark drehen"],
    easier: "Hände auf einer Bank oder Wand abstützen.",
    harder: "Knie diagonal zum gegenüberliegenden Ellenbogen führen.",
  }),
  exercise({
    id: "glute-bridge",
    name: "Glute Bridge (Beckenheben)",
    subtitle: "Beckenheben in Rückenlage",
    quickStart: "Rückenlage, Füße aufstellen. Drücke die Füße in den Boden, spanne das Gesäß an und hebe das Becken bis Schulter, Hüfte und Knie eine Linie bilden.",
    group: "Gesäß & Hüfte",
    seconds: 60,
    equipment: ["mat"],
    focusAreas: ["hips", "core"],
    visual: "glute-bridge",
    purpose: "Aktiviert Gesäß und hintere Kette bei kontrollierter Beckenposition.",
    instruction: "Hüfte kontrolliert anheben, Gesäß anspannen und ohne Schwung absenken.",
    steps: ["Rückenlage, Füße hüftbreit aufstellen.", "Becken anheben, bis Schulter, Hüfte und Knie eine Linie bilden.", "Kurz halten und langsam absenken."],
    cues: ["Druck über ganze Füße", "Rippen unten halten", "Gesäß statt Rücken nutzen"],
    mistakes: ["Ins Hohlkreuz drücken", "Knie fallen nach innen", "Mit Schwung arbeiten"],
    easier: "Kleinerer Bewegungsweg.",
    harder: "Miniband über den Knien oder einbeinig ausführen.",
  }),
  exercise({
    id: "clamshell",
    name: "Clamshell (Muschelübung)",
    subtitle: "Muschelbewegung in Seitlage",
    quickStart: "Seitlage, Knie gebeugt und Füße zusammen. Lass die Füße aufeinander und öffne nur das obere Knie wie eine Muschel; das Becken bleibt übereinander.",
    sideSwitch: true,
    group: "Gesäß & Hüfte",
    seconds: 75,
    equipment: ["mat"],
    focusAreas: ["hips", "knee-axis"],
    visual: "clamshell",
    purpose: "Kräftigt die seitliche Hüfte und unterstützt eine stabile Beinachse.",
    instruction: "Seitlage, Knie gebeugt. Oberes Knie öffnen, ohne das Becken nach hinten rollen zu lassen.",
    steps: ["Seitlich liegen, Hüfte und Knie leicht beugen.", "Füße zusammenlassen.", "Oberes Knie kontrolliert öffnen und wieder schließen; Seite wechseln."],
    cues: ["Becken übereinander", "Kleine saubere Bewegung", "Gesäß seitlich spüren"],
    mistakes: ["Becken nach hinten rollen", "Füße trennen", "Zu großen Bewegungsweg erzwingen"],
    easier: "Ohne Band arbeiten.",
    harder: "Miniband oberhalb der Knie verwenden.",
  }),
  exercise({
    id: "calf-raise",
    name: "Wadenheben beidbeinig",
    subtitle: "Beide Fersen langsam anheben",
    quickStart: "Stell dich aufrecht hin und halte dich bei Bedarf fest. Drücke beide Fersen langsam hoch, halte kurz und senke sie über etwa drei Sekunden ab.",
    group: "Fuß & Unterschenkel",
    seconds: 60,
    focusAreas: ["ankle", "knee-axis"],
    visual: "calf-raise",
    purpose: "Kräftigt Wade und Achillessehnenbereich kontrolliert.",
    instruction: "Langsam hochdrücken, oben kurz halten und kontrolliert absenken. Bei Bedarf an einer Wand festhalten.",
    steps: ["Aufrecht stehen, Füße parallel.", "Fersen langsam anheben.", "Oben kurz halten und über drei Sekunden absenken."],
    cues: ["Gewicht über Groß- und Kleinzehenballen", "Fersen bleiben parallel", "Volle Kontrolle"],
    mistakes: ["Nach außen wegknicken", "Hochfedern", "Nur schnell absenken"],
    easier: "Beidbeinig und mit Halt.",
    harder: "Einbeinig oder auf einer Stufe ausführen.",
  }),
  exercise({
    id: "single-leg-calf-raise",
    name: "Wadenheben einbeinig",
    subtitle: "Wadenkraft und Sprunggelenkstabilität pro Seite",
    quickStart: "Stell dich auf ein Bein und halte dich leicht an einer Wand fest. Hebe die Ferse langsam an, halte oben kurz und senke sie kontrolliert ab. Danach Seite wechseln.",
    sideSwitch: true,
    group: "Fuß & Unterschenkel",
    seconds: 75,
    focusAreas: ["ankle", "balance", "knee-axis"],
    visual: "single-leg-calf-raise",
    purpose: "Kräftigt Wade und Fuß einseitig und macht Unterschiede zwischen links und rechts sichtbar.",
    asymmetryNote: "Beginne auf der schwächeren Seite, arbeite aber auf beiden Seiten mit derselben sauberen Zeit. Qualität geht vor Wiederholungszahl.",
    instruction: "Auf einem Bein langsam auf den Vorfuß drücken, oben stabilisieren und die Ferse kontrolliert absenken.",
    steps: ["Neben einer Wand auf ein Bein stellen.", "Ferse gerade nach oben anheben, ohne nach außen wegzuknicken.", "Oben kurz halten, langsam absenken und nach dem Signal die Seite wechseln."],
    cues: ["Druck über Groß- und Kleinzehenballen", "Ferse steigt gerade hoch", "Nur so viele saubere Wiederholungen wie möglich"],
    mistakes: ["Mit dem Oberkörper hochfedern", "Sprunggelenk kippt nach außen", "Zu schnell nach unten fallen"],
    easier: "Mit beiden Füßen hochgehen und nur einbeinig absenken.",
    harder: "Auf einer Stufe arbeiten oder eine leichte Kurzhantel halten.",
  }),
  exercise({
    id: "knee-to-wall",
    name: "Knie-zur-Wand-Mobilisation",
    subtitle: "Sprunggelenk testen und mobilisieren",
    quickStart: "Stell einen Fuß flach etwa 3–8 cm vor eine Wand. Schiebe das Knie gerade zur Wand, ohne dass die Ferse abhebt. Danach Seite wechseln.",
    sideSwitch: true,
    group: "Fuß & Sprunggelenk",
    seconds: 75,
    focusAreas: ["ankle", "mobility"],
    visual: "knee-to-wall",
    purpose: "Verbessert die Dorsalflexion des Sprunggelenks für Laufen, Kniebeuge und Treppenbewegungen.",
    asymmetryNote: "Teste links und rechts einzeln. Merke dir den größten Abstand zur Wand, bei dem Kniekontakt mit flacher Ferse möglich ist. Ein deutlicher Seitenunterschied ist ein Trainingshinweis, keine Diagnose – nicht in Schmerz oder mit angehobener Ferse erzwingen.",
    instruction: "Fuß flach vor eine Wand stellen und das Knie kontrolliert zur Wand führen, ohne dass die Ferse abhebt.",
    steps: ["Fuß wenige Zentimeter vor die Wand stellen.", "Knie über den zweiten oder dritten Zeh zur Wand führen.", "Ferse bleibt am Boden; Abstand bei Bedarf anpassen und Seite wechseln."],
    cues: ["Ferse bleibt unten", "Knie folgt der Fußrichtung", "Ruhige Wiederholungen"],
    mistakes: ["Fußgewölbe kollabiert", "Knie kippt stark nach innen", "Ferse hebt ab"],
    easier: "Näher an die Wand rücken.",
    harder: "Abstand leicht vergrößern, ohne die Technik zu verlieren.",
  }),
  exercise({
    id: "tibialis-raise",
    name: "Tibialis Raises (Fußspitzenheben)",
    subtitle: "Fersen bleiben unten, Fußspitzen gehen hoch",
    quickStart: "Lehne dich mit dem Rücken an eine Wand, Füße etwas nach vorn. Lass die Fersen am Boden und ziehe beide Fußspitzen hoch Richtung Schienbein.",
    group: "Fuß & Unterschenkel",
    seconds: 60,
    focusAreas: ["ankle"],
    visual: "tibialis-raise",
    purpose: "Kräftigt die Muskulatur an der Vorderseite des Unterschenkels.",
    instruction: "Mit dem Rücken an eine Wand lehnen, Fersen stehen lassen und die Fußspitzen kontrolliert anheben und absenken.",
    steps: ["Rücken an eine Wand lehnen und Füße etwas nach vorn stellen.", "Fersen bleiben fest am Boden.", "Fußspitzen hochziehen und langsam absenken."],
    cues: ["Nur das Sprunggelenk bewegt sich", "Langsam absenken", "Knie locker"],
    mistakes: ["Fersen anheben", "Mit dem Oberkörper wippen", "Bewegung zu schnell ausführen"],
    easier: "Aufrechter stehen und weniger zurücklehnen.",
    harder: "Füße weiter von der Wand entfernen.",
  }),
  exercise({
    id: "short-foot",
    name: "Fußgewölbe aktivieren",
    subtitle: "Short Foot · Fuß sanft verkürzen",
    quickStart: "Barfuß sitzen oder stehen. Zehen locker lassen. Ziehe den Großzehenballen ganz leicht Richtung Ferse, sodass sich das innere Fußgewölbe hebt.",
    sideSwitch: true,
    group: "Fuß & Sprunggelenk",
    seconds: 60,
    focusAreas: ["ankle", "balance"],
    visual: "short-foot",
    purpose: "Aktiviert die kleinen Fußmuskeln, ohne die Zehen einzukrallen.",
    instruction: "Ferse und Vorfuß am Boden lassen und den Großzehenballen sanft in Richtung Ferse ziehen, sodass sich das Fußgewölbe hebt.",
    steps: ["Barfuß sitzen oder stehen.", "Ferse, Groß- und Kleinzehenballen am Boden lassen.", "Fuß sanft verkürzen und Gewölbe anheben, dann lösen."],
    cues: ["Zehen bleiben lang", "Drei-Punkt-Kontakt halten", "Kleine Bewegung genügt"],
    mistakes: ["Zehen krallen", "Fuß nach außen rollen", "Zu viel Kraft einsetzen"],
    easier: "Im Sitzen üben.",
    harder: "Im Einbeinstand ausführen.",
  }),
  exercise({
    id: "single-leg-balance",
    name: "Einbeinstand",
    quickStart: "Stell dich auf ein Bein, richte Knie und Fuß gerade aus und halte das Fußgewölbe aktiv. Bei Bedarf mit einem Finger sichern.",
    sideSwitch: true,
    group: "Balance",
    seconds: 75,
    focusAreas: ["ankle", "balance", "knee-axis"],
    visual: "single-leg-balance",
    purpose: "Trainiert Fuß-, Sprunggelenk- und Beinachsenstabilität im Stand.",
    instruction: "Auf einem Bein stehen, Fußgewölbe aktiv halten und das Knie ruhig über dem Fuß ausrichten. Nach der Hälfte wechseln.",
    steps: ["Aufrecht stehen und einen festen Punkt ansehen.", "Ein Bein anheben und Standfuß aktiv halten.", "Ruhig stabilisieren und danach Seite wechseln."],
    cues: ["Drei-Punkt-Kontakt am Fuß", "Knie weich", "Becken bleibt waagerecht"],
    mistakes: ["Standfuß knickt ein", "Knie wird durchgedrückt", "Becken kippt stark"],
    easier: "Mit einem Finger an der Wand sichern.",
    harder: "Kopf drehen oder einen Gegenstand langsam um den Körper führen.",
  }),
  exercise({
    id: "single-leg-clock-reach",
    name: "Einbeinstand mit Uhrzeiger-Tippen",
    subtitle: "Freien Fuß nach vorn, seitlich und hinten tippen",
    quickStart: "Steh auf einem Bein. Tippe mit dem freien Fuß wie auf einem Zifferblatt kontrolliert nach vorn, schräg zur Seite und nach hinten, ohne das Standbein zu verlieren.",
    sideSwitch: true,
    group: "Balance",
    seconds: 90,
    focusAreas: ["ankle", "balance", "knee-axis"],
    visual: "clock-reach",
    purpose: "Trainiert das Sprunggelenk in wechselnden Richtungen und verbindet Balance mit kontrollierter Beinachse.",
    instruction: "Auf einem Bein stehen und mit dem freien Fuß mehrere Punkte rund um den Körper antippen. Standfuß und Knie bleiben kontrolliert.",
    steps: ["Neben einer Wand auf ein Bein stellen.", "Mit dem freien Fuß erst nach vorn, dann seitlich und anschließend nach hinten tippen.", "Zur Mitte zurückkehren, ruhig wiederholen und nach dem Signal die Seite wechseln."],
    cues: ["Standfuß bleibt als Dreipunkt stabil", "Knie folgt den Zehen", "Reichweite nur so groß wie kontrollierbar"],
    mistakes: ["Mit dem Oberkörper stark ausweichen", "Standknie kippt nach innen", "Freien Fuß vollständig belasten"],
    easier: "Nur nach vorn und seitlich tippen und mit einem Finger sichern.",
    harder: "Größere Reichweite oder langsameres Zurückführen.",
  }),
  exercise({
    id: "band-ankle-eversion",
    name: "Sprunggelenk mit Band nach außen",
    subtitle: "Eversion · nur den Fuß gegen den Bandzug drehen",
    quickStart: "Setz dich hin. Das Band zieht den Vorfuß nach innen. Halte Knie und Unterschenkel still und bewege nur den Fuß gegen den Zug nach außen.",
    sideSwitch: true,
    group: "Fuß & Sprunggelenk",
    seconds: 75,
    equipment: ["band"],
    focusAreas: ["ankle"],
    visual: "band-ankle",
    purpose: "Kräftigt die seitliche Unterschenkelmuskulatur für Sprunggelenkstabilität.",
    instruction: "Band am Vorfuß anlegen und den Fuß kontrolliert nach außen bewegen, ohne das Knie mitzudrehen.",
    steps: ["Im Sitzen Band seitlich am Vorfuß befestigen.", "Knie und Unterschenkel ruhig halten.", "Fuß nach außen führen und langsam zurücklassen; Seite wechseln."],
    cues: ["Bewegung nur im Sprunggelenk", "Langsam zurückführen", "Kleiner sauberer Weg"],
    mistakes: ["Ganzes Bein drehen", "Band zurückschnellen lassen", "Zu starke Spannung"],
    easier: "Leichteres Band verwenden.",
    harder: "Endposition zwei Sekunden halten.",
  }),
  exercise({
    id: "band-ankle-inversion",
    name: "Sprunggelenk mit Band nach innen",
    subtitle: "Inversion · Vorfuß kontrolliert zur Körpermitte",
    quickStart: "Setz dich hin. Das Band zieht den Vorfuß nach außen. Halte Knie und Unterschenkel still und bewege nur den Fuß kontrolliert nach innen.",
    sideSwitch: true,
    group: "Fuß & Sprunggelenk",
    seconds: 75,
    equipment: ["band"],
    focusAreas: ["ankle"],
    visual: "band-ankle-inversion",
    purpose: "Kräftigt die Muskulatur an der Innenseite des Unterschenkels und ergänzt die Bewegung nach außen.",
    instruction: "Band am Vorfuß anlegen und den Fuß gegen den Zug nach innen führen. Das ganze Bein bleibt ruhig.",
    steps: ["Im Sitzen das Band außen am Vorfuß befestigen.", "Knie und Unterschenkel gerade ausrichten.", "Vorfuß nach innen bewegen, langsam zurücklassen und nach dem Signal die Seite wechseln."],
    cues: ["Nur das Sprunggelenk bewegt sich", "Kleiner sauberer Bewegungsweg", "Rückweg genauso kontrollieren"],
    mistakes: ["Knie nach innen drehen", "Band zurückschnellen lassen", "Fuß stark nach unten drücken"],
    easier: "Leichteres Band oder kleinerer Weg.",
    harder: "Endposition zwei Sekunden halten.",
  }),
  exercise({
    id: "band-ankle-dorsiflexion",
    name: "Sprunggelenk mit Band nach oben",
    subtitle: "Fußspitze gegen Widerstand zum Schienbein ziehen",
    quickStart: "Setz dich mit gestrecktem Bein hin. Befestige das Band vor dir am Vorfuß. Ziehe die Fußspitze Richtung Schienbein und lass sie langsam wieder nach vorn.",
    sideSwitch: true,
    group: "Fuß & Sprunggelenk",
    seconds: 75,
    equipment: ["band"],
    focusAreas: ["ankle"],
    visual: "band-ankle-dorsiflexion",
    purpose: "Kräftigt die Bewegung der Fußspitze nach oben und die Muskulatur an der Vorderseite des Unterschenkels.",
    instruction: "Band am Vorfuß befestigen und die Fußspitze kontrolliert Richtung Schienbein ziehen, ohne das Knie zu bewegen.",
    steps: ["Im Sitzen das Bein ausstrecken und das Band vor dem Fuß befestigen.", "Ferse liegen lassen und Fußspitze Richtung Schienbein ziehen.", "Langsam zurückführen und nach dem Signal die Seite wechseln."],
    cues: ["Ferse bleibt ruhig", "Zehen entspannt lassen", "Bewegung kommt aus dem Sprunggelenk"],
    mistakes: ["Ganzes Bein zurückziehen", "Nur die Zehen krallen", "Band unkontrolliert zurückziehen lassen"],
    easier: "Leichteres Band verwenden oder ohne Band üben.",
    harder: "Obere Position zwei Sekunden halten.",
  }),
  exercise({
    id: "step-up",
    name: "Kontrollierte Step-ups",
    sideSwitch: true,
    group: "Beinachse",
    seconds: 75,
    equipment: ["step"],
    focusAreas: ["knee-axis", "hips", "balance"],
    visual: "step-up",
    purpose: "Trainiert einbeinige Kraft und kontrollierte Knieausrichtung.",
    instruction: "Auf eine stabile Stufe steigen, Knie kontrolliert führen und langsam wieder absteigen.",
    steps: ["Einen Fuß vollständig auf eine stabile Stufe stellen.", "Über dieses Bein nach oben drücken.", "Oben kurz stabilisieren und kontrolliert absteigen; Seite wechseln."],
    cues: ["Knie folgt den Zehen", "Druck über den ganzen Fuß", "Nicht vom hinteren Bein abspringen"],
    mistakes: ["Knie kippt nach innen", "Nur mit Schwung hochkommen", "Fuß steht halb auf der Stufe"],
    easier: "Niedrigere Stufe wählen.",
    harder: "Kurzhanteln halten oder Abstieg langsamer ausführen.",
  }),
  exercise({
    id: "hip-flexor-stretch",
    name: "Hüftbeuger-Stretch",
    sideSwitch: true,
    group: "Mobilität",
    seconds: 90,
    equipment: ["mat"],
    focusAreas: ["hips", "mobility"],
    visual: "hip-flexor",
    purpose: "Mobilisiert die Hüftvorderseite bei aufgerichtetem Becken.",
    instruction: "Je Seite ruhig halten. Becken leicht aufrichten, ohne ins Hohlkreuz auszuweichen.",
    steps: ["Halbkniestand einnehmen.", "Becken leicht nach hinten kippen.", "Gewicht sanft nach vorn verlagern und Seite wechseln."],
    cues: ["Gesäß der hinteren Seite anspannen", "Rippen unten", "Kleiner Weg genügt"],
    mistakes: ["Ins Hohlkreuz gehen", "Vorderes Knie weit vorschieben", "Becken aufdrehen"],
    easier: "Mehr Polster unter das Knie legen.",
    harder: "Arm der hinteren Seite über Kopf nehmen.",
  }),
  exercise({
    id: "thoracic-rotation",
    name: "Brustwirbelsäulen-Rotation",
    sideSwitch: true,
    group: "Mobilität",
    seconds: 75,
    equipment: ["mat"],
    focusAreas: ["back", "mobility"],
    visual: "thoracic-rotation",
    purpose: "Mobilisiert die Brustwirbelsäule und entlastet eine starre Oberkörperhaltung.",
    instruction: "Aus dem Vierfüßler einen Arm öffnen und der Hand mit dem Blick folgen. Becken bleibt ruhig.",
    steps: ["Vierfüßlerstand einnehmen.", "Eine Hand hinter den Kopf legen.", "Ellenbogen nach unten und anschließend kontrolliert zur Decke öffnen; Seite wechseln."],
    cues: ["Becken bleibt ruhig", "Bewegung aus dem oberen Rücken", "Ruhig atmen"],
    mistakes: ["Nur den Arm bewegen", "Becken mitdrehen", "In den Nacken ausweichen"],
    easier: "Bewegungsweg verkleinern.",
    harder: "In der geöffneten Position kurz halten.",
  }),
  exercise({
    id: "goblet-squat",
    name: "Goblet Squat",
    group: "Kraft",
    seconds: 60,
    equipmentAny: ["dumbbells", "kettlebell"],
    focusAreas: ["strength", "hips", "knee-axis", "ankle"],
    intensity: "high",
    visual: "goblet-squat",
    purpose: "Kräftigt Beine und Rumpf in einer alltagsnahen Kniebeugebewegung.",
    instruction: "Gewicht nah vor dem Körper halten. Kontrolliert absenken, Knie stabil führen und sauber aufstehen.",
    steps: ["Gewicht dicht vor der Brust halten.", "Hüfte und Knie gleichzeitig beugen.", "Kontrolliert tief gehen und über den ganzen Fuß aufstehen."],
    cues: ["Rumpf stabil", "Knie folgen den Zehen", "Gewicht nah am Körper"],
    mistakes: ["Fersen heben ab", "Knie kollabieren nach innen", "Rücken rundet stark"],
    easier: "Ohne Gewicht auf eine Bank setzen und aufstehen.",
    harder: "Langsamer absenken oder schwereres Gewicht verwenden.",
  }),
  exercise({
    id: "weighted-rdl",
    name: "Romanian Deadlift",
    group: "Kraft",
    seconds: 60,
    equipmentAny: ["dumbbells", "kettlebell"],
    focusAreas: ["strength", "hips", "back"],
    intensity: "high",
    visual: "rdl",
    purpose: "Kräftigt hintere Kette und Hüftstreckung bei neutralem Rücken.",
    instruction: "Hüfte nach hinten schieben, Rücken neutral halten und das Gewicht nah am Körper führen.",
    steps: ["Aufrecht stehen, Gewicht vor den Oberschenkeln.", "Knie leicht beugen und Hüfte weit nach hinten schieben.", "Spannung in der Rückseite fühlen und durch Hüftstreckung aufrichten."],
    cues: ["Rücken bleibt lang", "Gewicht nah am Körper", "Hüfte bewegt sich nach hinten"],
    mistakes: ["Kniebeuge statt Hüftknick", "Rücken rund machen", "Gewicht weit vom Körper"],
    easier: "Ohne Gewicht den Hüftknick üben.",
    harder: "Einbeinig oder schwerer ausführen.",
  }),
  exercise({
    id: "suitcase-carry",
    name: "Suitcase Carry",
    sideSwitch: true,
    group: "Rumpf & Haltung",
    seconds: 75,
    equipmentAny: ["dumbbells", "kettlebell"],
    focusAreas: ["core", "strength", "balance"],
    visual: "suitcase-carry",
    purpose: "Trainiert Rumpf und Haltung gegen seitliches Abknicken.",
    instruction: "Gewicht einseitig tragen, aufrecht gehen und nach der Hälfte die Seite wechseln.",
    steps: ["Ein Gewicht wie einen Koffer an einer Seite halten.", "Aufrecht und ruhig gehen.", "Nicht zur Last kippen; nach der Hälfte Seite wechseln."],
    cues: ["Schultern auf gleicher Höhe", "Kurze kontrollierte Schritte", "Rumpf bleibt aufrecht"],
    mistakes: ["Zur Seite kippen", "Schulter hochziehen", "Zu schweres Gewicht"],
    easier: "Leichteres Gewicht oder kürzere Strecke.",
    harder: "Langsamer gehen oder Gewicht erhöhen.",
  }),
  exercise({
    id: "child-pose-breathing",
    name: "Kindhaltung & ruhige Atmung",
    group: "Abschluss",
    seconds: 90,
    equipment: ["mat"],
    focusAreas: ["back", "mobility"],
    intensity: "low",
    visual: "child-pose",
    purpose: "Ruhiger Abschluss, um Spannung zu lösen und die Atmung zu beruhigen.",
    instruction: "Ruhig atmen und Spannung lösen. Die Position nur so weit einnehmen, wie sie angenehm bleibt.",
    steps: ["Aus dem Vierfüßler das Becken nach hinten führen.", "Arme entspannt nach vorn oder neben den Körper legen.", "Ruhig in Flanken und Rücken atmen."],
    cues: ["Keine Position erzwingen", "Lange Ausatmung", "Schultern entspannen"],
    mistakes: ["Schmerzen ignorieren", "Luft anhalten", "Zu viel Druck auf Knie oder Rücken"],
    easier: "Kissen unter Becken oder Stirn legen.",
    harder: "Nicht nötig – der Abschluss soll ruhig bleiben.",
  }),
];

export const DEFAULT_PHYSIO_EXERCISES = MOBILITY_EXERCISES.filter((item) => item.physioDefault).map((item) => item.id);

function hasEquipment(item, selectedEquipment) {
  const selected = new Set(selectedEquipment || []);
  if (item.equipment?.some((equipmentId) => !selected.has(equipmentId))) return false;
  if (item.equipmentAny?.length && !item.equipmentAny.some((equipmentId) => selected.has(equipmentId))) return false;
  return true;
}

function uniqueExercises(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function rotate(items, offset = 0) {
  if (!items.length) return items;
  const normalized = Math.abs(Number(offset || 0)) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function interleaveExerciseGroups(items, groupOrder, offset = 0) {
  const grouped = groupOrder.map((group, index) => rotate(items.filter((item) => item.group === group), offset + index));
  const maxLength = Math.max(0, ...grouped.map((group) => group.length));
  const result = [];
  for (let row = 0; row < maxLength; row += 1) {
    grouped.forEach((group) => {
      if (group[row]) result.push(group[row]);
    });
  }
  return uniqueExercises(result);
}

export function exerciseById(id) {
  return MOBILITY_EXERCISES.find((item) => item.id === id);
}

export function focusAreaById(id) {
  return MOBILITY_FOCUS_AREAS.find((item) => item.id === id);
}

export function focusAreaLabel(id) {
  return focusAreaById(id)?.shortLabel || id;
}

export function exercisesForFocus(id) {
  return MOBILITY_EXERCISES.filter((item) => item.focusAreas.includes(id));
}

function exerciseEquipmentIds(item) {
  return [...(item?.equipment || []), ...(item?.equipmentAny || [])].sort();
}

function requiresMaterialChange(previous, next) {
  if (!previous || !next) return false;
  const before = exerciseEquipmentIds(previous);
  const after = exerciseEquipmentIds(next);
  if (!before.length && !after.length) return false;
  return before.join("|") !== after.join("|");
}

export function buildMobilityWorkout({
  durationMinutes = 25,
  condition = "normal",
  equipment = ["mat", "band"],
  physioExerciseIds = [],
  focusAreaIds = [],
  knownExerciseIds = [],
  preparationSeconds = 10,
  unknownPreparationSeconds = 20,
  transitionSeconds = 10,
  materialTransitionSeconds = 20,
  longerPreparationForUnknown = true,
  rotationOffset = 0,
} = {}) {
  const targetActiveSeconds = Math.max(10, Number(durationMinutes || 25)) * 60;
  const selectedPhysio = (physioExerciseIds || []).map(exerciseById).filter(Boolean);
  const availablePhysio = selectedPhysio.filter((item) => hasEquipment(item, equipment));
  const missingPhysio = selectedPhysio.filter((item) => !hasEquipment(item, equipment));
  const selectedFocusIds = (focusAreaIds || []).filter((id) => focusAreaById(id));
  const knownIds = new Set([...(knownExerciseIds || []), ...(physioExerciseIds || [])]);
  const normalPreparation = Math.max(0, Number(preparationSeconds || 0));
  const newExercisePreparation = Math.max(normalPreparation, Number(unknownPreparationSeconds || normalPreparation));
  const normalTransition = Math.max(0, Number(transitionSeconds || 0));
  const materialTransition = Math.max(normalTransition, Number(materialTransitionSeconds || normalTransition));
  const available = MOBILITY_EXERCISES.filter((item) => hasEquipment(item, equipment));
  const conditionAvailable = condition === "tired"
    ? available.filter((item) => item.intensity !== "high")
    : available;

  const physioIds = new Set(availablePhysio.map((item) => item.id));
  const finishers = conditionAvailable.filter((item) => item.group === "Abschluss");
  const finisher = rotate(finishers, rotationOffset)[0];
  const finisherIds = new Set(finishers.map((item) => item.id));
  const pool = conditionAvailable.filter((item) => !physioIds.has(item.id) && !finisherIds.has(item.id));

  const focusSequence = [];
  if (selectedFocusIds.length) {
    const focusSlots = Number(durationMinutes || 25) >= 20 ? 2 : 1;
    const rotatedFocusIds = rotate(selectedFocusIds, rotationOffset);
    for (let slot = 0; slot < focusSlots; slot += 1) {
      const focusId = rotatedFocusIds[slot % rotatedFocusIds.length];
      const candidate = rotate(
        pool.filter((item) => item.focusAreas.includes(focusId) && !focusSequence.some((selected) => selected.id === item.id)),
        rotationOffset + slot,
      )[0];
      if (candidate) focusSequence.push(candidate);
    }
  }

  const standardPriority = condition === "tired"
    ? ["Mobilität", "Fuß & Sprunggelenk", "Balance", "Rumpf", "Gesäß & Hüfte", "Fuß & Unterschenkel", "Beinachse"]
    : condition === "fresh"
      ? ["Rumpf", "Gesäß & Hüfte", "Kraft", "Rumpf & Haltung", "Beinachse", "Fuß & Sprunggelenk", "Mobilität"]
      : ["Rumpf", "Fuß & Sprunggelenk", "Gesäß & Hüfte", "Mobilität", "Balance", "Beinachse", "Kraft"];
  const standardSequence = interleaveExerciseGroups(pool, standardPriority, rotationOffset);

  const items = [];
  let activeSeconds = 0;
  let totalSeconds = 0;
  const add = (item, reason = "Standard", round = 1, activeLimitSeconds = targetActiveSeconds) => {
    if (!item) return false;
    const seconds = Number(item.seconds || 60);
    const known = knownIds.has(item.id);
    const stepPreparationSeconds = longerPreparationForUnknown && !known
      ? newExercisePreparation
      : normalPreparation;
    const previous = items.at(-1);
    const transitionBeforeSeconds = previous
      ? requiresMaterialChange(previous, item) ? materialTransition : normalTransition
      : 0;
    const stepTotalSeconds = seconds + stepPreparationSeconds + transitionBeforeSeconds;
    if (activeSeconds + seconds > activeLimitSeconds + 30 && items.length >= 3) return false;
    const matchedFocus = selectedFocusIds.filter((focusId) => item.focusAreas.includes(focusId));
    items.push({
      ...item,
      stepId: `${item.id}-${round}-${items.length}`,
      round,
      selectionReason: reason,
      matchedFocus,
      known,
      preparationSeconds: stepPreparationSeconds,
      transitionBeforeSeconds,
      materialChangeBefore: Boolean(previous && requiresMaterialChange(previous, item)),
    });
    activeSeconds += seconds;
    totalSeconds += stepTotalSeconds;
    return true;
  };

  rotate(availablePhysio, rotationOffset).forEach((item) => add(item, "Physio-Priorität", 1));
  uniqueExercises(focusSequence).forEach((item) => {
    const labels = selectedFocusIds.filter((id) => item.focusAreas.includes(id)).map(focusAreaLabel);
    add(item, labels.length ? `Schwerpunkt ${labels.join(" & ")}` : "Persönlicher Schwerpunkt", 1);
  });

  const alreadySelectedIds = new Set(items.map((item) => item.id));
  const base = standardSequence.filter((item) => !alreadySelectedIds.has(item.id));
  const mainTargetSeconds = Math.max(0, targetActiveSeconds - Number(finisher?.seconds || 0));
  let index = 0;
  let round = 1;
  while (activeSeconds < mainTargetSeconds - 30 && base.length) {
    const candidate = base[index % base.length];
    if (!candidate) break;
    add(candidate, "Ausgewogener Basisblock", round, mainTargetSeconds);
    index += 1;
    if (base.length && index % base.length === 0) round += 1;
    if (round > 4 || index > 40) break;
  }

  if (finisher && !items.some((item) => item.id === finisher.id)) {
    add(finisher, "Ruhiger Abschluss", round + 1, targetActiveSeconds);
  }

  const focusLabels = selectedFocusIds.map(focusAreaLabel);
  const focusExerciseCount = items.filter((item) => item.matchedFocus?.length && item.selectionReason.startsWith("Schwerpunkt")).length;
  const missingFocus = selectedFocusIds.filter((focusId) => !conditionAvailable.some((item) => item.focusAreas.includes(focusId)));

  return {
    id: `mobility-${durationMinutes}-${condition}-${equipment.join("-")}-${physioExerciseIds.join("-")}-${selectedFocusIds.join("-")}-${preparationSeconds}-${transitionSeconds}-${rotationOffset}`,
    title: focusLabels.length
      ? `${focusLabels.join(" & ")} im Fokus`
      : condition === "tired"
        ? "Regeneration & Bewegungsqualität"
        : condition === "fresh"
          ? "Ausgewogene Läufer-Stabilität mit Kraft"
          : "Ausgewogene Mobility & Stabi-Basis",
    durationMinutes: Math.max(1, Math.round(totalSeconds / 60)),
    activeMinutes: Math.max(1, Math.round(activeSeconds / 60)),
    pauseMinutes: Math.max(0, Math.round((totalSeconds - activeSeconds) / 60)),
    activeSeconds,
    pauseSeconds: totalSeconds - activeSeconds,
    totalSeconds,
    targetMinutes: Number(durationMinutes || 25),
    condition,
    equipment,
    focusAreaIds: selectedFocusIds,
    focusLabels,
    focusExerciseCount,
    timing: {
      preparationSeconds: normalPreparation,
      unknownPreparationSeconds: newExercisePreparation,
      transitionSeconds: normalTransition,
      materialTransitionSeconds: materialTransition,
      longerPreparationForUnknown,
    },
    items,
    missingPhysio,
    missingFocus,
  };
}

function workoutSequenceSignature(workout) {
  return (workout?.items || []).map((item) => item.id).join("|");
}

export function nextMobilityWorkoutRotation(options = {}, currentOffset = 0, random = Math.random) {
  const baseOptions = { ...options };
  delete baseOptions.rotationOffset;
  const normalizedCurrentOffset = Number.isFinite(Number(currentOffset)) ? Number(currentOffset) : 0;
  const currentWorkout = buildMobilityWorkout({ ...baseOptions, rotationOffset: normalizedCurrentOffset });
  const currentSignature = workoutSequenceSignature(currentWorkout);
  const currentFirstExerciseId = currentWorkout.items[0]?.id;
  const variants = [];
  const variantsWithDifferentStart = [];
  const seenSignatures = new Set([currentSignature]);
  const searchLimit = Math.max(12, MOBILITY_EXERCISES.length * 2);

  for (let step = 1; step <= searchLimit; step += 1) {
    const rotationOffset = normalizedCurrentOffset + step;
    const workout = buildMobilityWorkout({ ...baseOptions, rotationOffset });
    const signature = workoutSequenceSignature(workout);
    if (!signature || seenSignatures.has(signature)) continue;

    seenSignatures.add(signature);
    variants.push(rotationOffset);
    if (workout.items[0]?.id !== currentFirstExerciseId) {
      variantsWithDifferentStart.push(rotationOffset);
    }
  }

  const candidates = variantsWithDifferentStart.length ? variantsWithDifferentStart : variants;
  if (!candidates.length) return normalizedCurrentOffset;

  const randomValue = Number(random());
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(0.999999999, Math.max(0, randomValue))
    : 0;
  return candidates[Math.floor(normalizedRandom * candidates.length)];
}

export function equipmentLabel(id) {
  return MOBILITY_EQUIPMENT.find((entry) => entry.id === id)?.label || id;
}
