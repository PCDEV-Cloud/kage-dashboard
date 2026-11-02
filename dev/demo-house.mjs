// Anonimowy dom testowy o strukturze typowego domu właściciela: trzy piętra + teren
// zewnętrzny, grupy świateł i rolet, termostaty, głośniki, pompa ciepła, alarm.
export function demoHass(language = "en") {
  const floors = {
    attic: { floor_id: "attic", name: "Attic", level: 2 },
    first: { floor_id: "first", name: "First Floor", level: 1 },
    ground: { floor_id: "ground", name: "Ground Floor", level: 0 },
    outdoors: { floor_id: "outdoors", name: "Outdoors", level: 0 },
  };
  const areaList = [
    ["gym", "Gym", "attic"],
    ["office", "Office", "attic"],
    ["attic_stairs", "Attic Stairs", "first"],
    ["bathroom", "Bathroom", "first"],
    ["bedroom_2", "Bedroom 2", "first"],
    ["bedroom_3", "Bedroom 3", "first"],
    ["landing", "Landing", "first"],
    ["master", "Master Bedroom", "first"],
    ["dining", "Dining Room", "ground"],
    ["hallway", "Hallway", "ground"],
    ["kitchen", "Kitchen", "ground"],
    ["living", "Living Room", "ground"],
    ["porch", "Porch", "ground"],
    ["stairs", "Stairs", "ground"],
    ["wc", "WC", "ground"],
    ["utility", "Utility Cupboard", "ground"],
    ["driveway", "Driveway", "outdoors"],
    ["front_step", "Front Step", "outdoors"],
    ["garden", "Garden", "outdoors"],
    ["terrace", "Terrace", "outdoors"],
  ];
  const areas = Object.fromEntries(
    areaList.map(([id, name, floor]) => [id, { area_id: id, name, floor_id: floor }]),
  );
  const entities = {};
  const states = {};
  const add = (id, area, state, attributes = {}, extra = {}) => {
    entities[id] = { entity_id: id, area_id: area, ...extra };
    states[id] = { entity_id: id, state, attributes };
  };

  add("light.bathroom_lights", "bathroom", "on", {
    friendly_name: "Lights",
    entity_id: ["light.bathroom_main", "light.bathroom_mirror", "light.bathroom_deco", "light.bathroom_shower"],
    supported_color_modes: ["onoff"],
  });
  add("light.bathroom_main", "bathroom", "on", { friendly_name: "Main Light", supported_color_modes: ["onoff"] });
  add("light.bathroom_mirror", "bathroom", "on", { friendly_name: "Mirror Light", supported_color_modes: ["onoff"] });
  add("light.bathroom_deco", "bathroom", "off", { friendly_name: "Decoration Light", supported_color_modes: ["onoff"] });
  add("light.bathroom_shower", "bathroom", "off", { friendly_name: "Shower Light", supported_color_modes: ["onoff"] });
  add("climate.bathroom", "bathroom", "heat", { friendly_name: "Bathroom", current_temperature: 23.1, temperature: 24, hvac_action: "heating" });

  add("cover.master_blinds", "master", "open", {
    friendly_name: "Blinds",
    device_class: "blind",
    entity_id: ["cover.master_left", "cover.master_right"],
    current_position: 60,
  });
  add("cover.master_left", "master", "open", { friendly_name: "Left Blind", device_class: "blind", current_position: 100 });
  add("cover.master_right", "master", "open", { friendly_name: "Right Blind", device_class: "blind", current_position: 20 });
  add("cover.master_screen", "master", "closed", { friendly_name: "Screen", current_position: 0 });
  add("climate.master", "master", "heat", { friendly_name: "Master Bedroom", current_temperature: 19.8, temperature: 20.5, hvac_action: "idle" });
  add("media_player.tv", "master", "idle", { friendly_name: "Apple TV" });
  add("media_player.speaker_1", "master", "playing", { friendly_name: "HomePod Mini 1-1", media_title: "Nocturne in E-flat", media_artist: "Chopin" });
  add("media_player.speaker_2", "master", "paused", { friendly_name: "HomePod Mini 1-2" });
  add("sensor.master_humidity", "master", "47", { device_class: "humidity" });

  add("climate.bedroom_2", "bedroom_2", "heat", { friendly_name: "Bedroom 2", current_temperature: 20.4, temperature: 21 });
  add("climate.bedroom_3", "bedroom_3", "heat", { friendly_name: "Bedroom 3", current_temperature: 20.9, temperature: 21 });
  add("light.wc_mirror", "wc", "off", { friendly_name: "WC Mirror Light", supported_color_modes: ["onoff"] });

  add("climate.heat_pump_dhw", "utility", "heat", { friendly_name: "Heat Pump DHW", current_temperature: 47, temperature: 50 });
  add("binary_sensor.heat_pump_error", "utility", "off", { device_class: "problem", friendly_name: "Heat Pump Error" });
  add("sensor.window_battery", "bedroom_3", "9", { device_class: "battery", friendly_name: "Window Sensor Battery" }, { entity_category: "diagnostic" });
  add("camera.driveway", "driveway", "idle", { friendly_name: "Driveway Camera" });
  add("alarm_control_panel.home", "office", "disarmed", { friendly_name: "Alarm" });
  add("scene.movie", null, "unknown", { friendly_name: "Movie" });
  add("scene.dinner", null, "unknown", { friendly_name: "Dinner" });
  add("scene.cleaning", null, "unknown", { friendly_name: "Cleaning" });
  add("scene.good_night", null, "unknown", { friendly_name: "Good night" });

  return {
    language,
    locale: { language },
    user: { id: "demo", name: "Demo", is_admin: true },
    floors,
    areas,
    devices: {},
    entities,
    states,
    calls: [],
    async callWS() {
      return Object.values(floors);
    },
    async callService(domain, service, data) {
      this.calls.push([domain, service, data]);
    },
  };
}
