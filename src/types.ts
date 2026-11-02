// Minimalny podzbiór obiektu `hass` z frontendu Home Assistant, którego używa KAGE.
// Pola są opcjonalne tam, gdzie starsze wersje HA mogą ich nie mieć.

export interface FloorEntry {
  floor_id: string;
  name: string;
  level: number | null;
  icon?: string | null;
  aliases?: string[];
}

export interface AreaEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
  icon?: string | null;
  labels?: string[];
}

export interface DeviceEntry {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  area_id?: string | null;
  labels?: string[];
  entry_type?: "service" | null;
}

export interface EntityEntry {
  entity_id: string;
  name?: string | null;
  device_id?: string | null;
  area_id?: string | null;
  entity_category?: "config" | "diagnostic" | null;
  hidden?: boolean;
  labels?: string[];
  platform?: string;
}

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HassUser {
  id: string;
  name: string;
  is_admin: boolean;
}

export interface HomeAssistant {
  floors?: Record<string, FloorEntry>;
  areas: Record<string, AreaEntry>;
  devices: Record<string, DeviceEntry>;
  entities: Record<string, EntityEntry>;
  states: Record<string, HassEntityState>;
  user?: HassUser;
  language?: string;
  locale?: { language: string };
  callWS<T>(msg: { type: string; [key: string]: unknown }): Promise<T>;
  callService?(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

// Konfiguracja strategii zapisana w dashboardzie (`strategy: type: custom:kage`).
export interface KageConfig {
  type: string;
  // Dalsze opcje (role, rzut, konta techniczne) dochodzą w etapach 3 i 6.
  [key: string]: unknown;
}

// Konfiguracja Lovelace, którą strategia zwraca do HA.
export interface LovelaceCard {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceSection {
  type: "grid";
  cards: LovelaceCard[];
  column_span?: number;
}

export interface LovelaceView {
  title?: string;
  path?: string;
  icon?: string;
  type?: string;
  max_columns?: number;
  sections?: LovelaceSection[];
  cards?: LovelaceCard[];
  strategy?: { type: string; [key: string]: unknown };
}

export interface LovelaceConfig {
  title?: string;
  views: LovelaceView[];
  kiosk_mode?: unknown;
}
