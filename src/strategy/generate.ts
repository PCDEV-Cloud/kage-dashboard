import { format, languageOf, plural, stringsFor } from "../i18n";
import {
  buildHomeModel,
  domainOf,
  loadFloors,
  type AreaModel,
  type HomeModel,
} from "../engine/model";
import type {
  HomeAssistant,
  KageConfig,
  LovelaceCard,
  LovelaceConfig,
  LovelaceSection,
  LovelaceView,
} from "../types";

// Etap 2: strategia dashboardu tworzy listę widoków, strategia widoku buduje jego zawartość
// dopiero przy otwarciu. Karty są na razie wbudowane w HA; własne karty KAGE dochodzą w etapie 4.

export const VIEW_STRATEGY_TYPE = "custom:kage";

export async function generateDashboard(
  config: KageConfig,
  hass: HomeAssistant,
): Promise<LovelaceConfig> {
  const t = stringsFor(hass);
  return {
    title: t.strategyName,
    views: [
      {
        title: t.viewHome,
        path: "home",
        icon: "mdi:home-lightning-bolt",
        strategy: { ...config, type: VIEW_STRATEGY_TYPE, view: "home" },
      },
    ],
  };
}

export async function generateView(
  _config: KageConfig,
  hass: HomeAssistant,
): Promise<LovelaceView> {
  const floors = await loadFloors(hass);
  const model = buildHomeModel(hass, floors);
  return {
    type: "sections",
    max_columns: 4,
    sections: homeSections(model, hass),
  };
}

function areaCard(area: AreaModel): LovelaceCard {
  return {
    type: "tile",
    entity: area.entityIds[0],
    name: area.name,
    icon: area.icon ?? "mdi:texture-box",
    hide_state: true,
  };
}

function summaryLine(lang: string, t: ReturnType<typeof stringsFor>, areas: AreaModel[]): string {
  const entities = areas.reduce((sum, a) => sum + a.entityIds.length, 0);
  return `${plural(lang, areas.length, t.areaCount)} · ${plural(lang, entities, t.entityCount)}`;
}

export function homeSections(model: HomeModel, hass: HomeAssistant): LovelaceSection[] {
  const t = stringsFor(hass);
  const lang = languageOf(hass);
  const sections: LovelaceSection[] = [
    {
      type: "grid",
      column_span: 4,
      cards: [{ type: "markdown", content: `**KAGE 影** · ${t.skeletonNotice}` }],
    },
  ];

  const floorsInOrder = model.levels.flatMap((level) => level.floors);
  if (floorsInOrder.length === 0 && model.unassignedAreas.length === 0) {
    sections.push({ type: "grid", cards: [{ type: "markdown", content: t.emptyHome }] });
    return sections;
  }

  const addGroup = (title: string, icon: string, areas: AreaModel[]) => {
    const cards: LovelaceCard[] = [
      { type: "heading", heading: title, icon, badges: [] },
      { type: "markdown", content: summaryLine(lang, t, areas) },
    ];
    for (const area of areas) {
      cards.push(
        area.entityIds.length ? areaCard(area) : { type: "markdown", content: `**${area.name}**` },
      );
    }
    sections.push({ type: "grid", cards });
  };

  for (const floor of floorsInOrder) {
    addGroup(floor.name, floor.icon ?? "mdi:home-floor-" + Math.max(0, floor.level), floor.areas);
  }
  if (model.unassignedAreas.length) {
    addGroup(t.unassignedFloor, "mdi:help-box-outline", model.unassignedAreas);
  }
  if (model.unassignedEntityIds.length || model.systemEntityIds.length) {
    sections.push({
      type: "grid",
      column_span: 2,
      cards: [
        { type: "heading", heading: t.unassignedEntities, icon: "mdi:link-variant-off" },
        { type: "markdown", content: unassignedReport(model, hass, lang, t) },
      ],
    });
  }
  return sections;
}

const MAX_LISTED = 40;

// Raport do porządkowania rejestrów: podział na typy i lista encji z nazwami.
export function unassignedReport(
  model: HomeModel,
  hass: HomeAssistant,
  lang: string,
  t: ReturnType<typeof stringsFor>,
): string {
  const ids = model.unassignedEntityIds;
  const lines: string[] = [];
  if (ids.length) {
    lines.push(`**${plural(lang, ids.length, t.entityCount)}** · ${t.unassignedHint}`, "");
    const byDomain = new Map<string, number>();
    for (const id of ids) byDomain.set(domainOf(id), (byDomain.get(domainOf(id)) ?? 0) + 1);
    const domains = [...byDomain.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    lines.push(domains.map(([d, n]) => `\`${d}\` ${n}`).join(" · "), "");
    for (const id of ids.slice(0, MAX_LISTED)) {
      const name = hass.states[id]?.attributes?.friendly_name;
      lines.push(`- \`${id}\`${typeof name === "string" ? ` — ${name}` : ""}`);
    }
    if (ids.length > MAX_LISTED) {
      lines.push("", format(t.moreItems, { n: ids.length - MAX_LISTED }));
    }
  } else {
    lines.push(t.noUnassignedDevices);
  }
  if (model.systemEntityIds.length) {
    lines.push("", `_${plural(lang, model.systemEntityIds.length, t.systemEntities)}_`);
  }
  return lines.join("\n");
}
