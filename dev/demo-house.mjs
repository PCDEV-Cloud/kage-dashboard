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
    entity_id: [
      "light.bathroom_main",
      "light.bathroom_mirror",
      "light.bathroom_deco",
      "light.bathroom_shower",
    ],
    supported_color_modes: ["onoff"],
  });
  add("light.bathroom_main", "bathroom", "on", {
    friendly_name: "Main Light",
    supported_color_modes: ["onoff"],
  });
  add("light.bathroom_mirror", "bathroom", "on", {
    friendly_name: "Mirror Light",
    supported_color_modes: ["onoff"],
  });
  add("light.bathroom_deco", "bathroom", "off", {
    friendly_name: "Decoration Light",
    supported_color_modes: ["onoff"],
  });
  add("light.bathroom_shower", "bathroom", "off", {
    friendly_name: "Shower Light",
    supported_color_modes: ["onoff"],
  });
  add("climate.bathroom", "bathroom", "heat", {
    friendly_name: "Bathroom",
    current_temperature: 23.1,
    temperature: 24,
    hvac_action: "heating",
  });

  add("cover.master_left", "master", "open", {
    friendly_name: "Left Blind",
    device_class: "shade",
    current_position: 100,
    supported_features: 15,
  });
  add("cover.master_right", "master", "open", {
    friendly_name: "Right Blind",
    device_class: "shade",
    current_position: 20,
    supported_features: 15,
  });
  add("cover.master_screen", "master", "closed", {
    friendly_name: "Screen",
    device_class: "shade",
    current_position: 0,
    supported_features: 11,
  });
  add("climate.master", "master", "heat", {
    friendly_name: "Master Bedroom",
    current_temperature: 19.8,
    temperature: 20.5,
    hvac_action: "idle",
    hvac_modes: ["off", "heat"],
    supported_features: 1 | 128 | 256,
  });
  add("media_player.tv", "master", "standby", {
    friendly_name: "Apple TV",
    supported_features: 1 | 128 | 256 | 1024 | 16384,
  });
  add("media_player.speaker_1", "master", "playing", {
    friendly_name: "HomePod Mini 1-1",
    media_title: "Nocturne in E-flat",
    media_artist: "Chopin",
    supported_features: 1 | 4 | 128 | 256 | 1024 | 16384,
  });
  add("media_player.speaker_2", "master", "paused", {
    friendly_name: "HomePod Mini 1-2",
    supported_features: 1 | 4 | 1024 | 16384,
  });
  add("sensor.master_humidity", "master", "47", { device_class: "humidity" });

  add("climate.bedroom_2", "bedroom_2", "heat", {
    friendly_name: "Bedroom 2",
    current_temperature: 20.4,
    temperature: 21,
  });
  add("climate.bedroom_3", "bedroom_3", "heat", {
    friendly_name: "Bedroom 3",
    current_temperature: 20.9,
    temperature: 21,
  });
  add("light.wc_mirror", "wc", "off", {
    friendly_name: "WC Mirror Light",
    supported_color_modes: ["onoff"],
  });

  add("climate.heat_pump_dhw", "utility", "heat", {
    friendly_name: "Heat Pump DHW",
    current_temperature: 47,
    temperature: 50,
  });
  add("binary_sensor.heat_pump_error", "utility", "off", {
    device_class: "problem",
    friendly_name: "Heat Pump Error",
  });
  add(
    "sensor.window_battery",
    "bedroom_3",
    "9",
    { device_class: "battery", friendly_name: "Window Sensor Battery" },
    { entity_category: "diagnostic" },
  );
  add("camera.driveway", "driveway", "idle", {
    friendly_name: "Driveway Camera",
    entity_picture:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='%23203040'/><rect y='6' width='16' height='3' fill='%23304030'/><rect x='3' y='4' width='5' height='3' fill='%23506070'/></svg>",
  });
  add("switch.driveway_socket", "driveway", "on", {
    friendly_name: "Socket",
    device_class: "outlet",
  });
  add("alarm_control_panel.home", "office", "disarmed", { friendly_name: "Alarm" });
  // Poza domem: obecność, otwarcia, woda, prąd, brama.
  add("person.demo", null, "home", { friendly_name: "Demo", user_id: "demo" });
  add("person.jo", null, "home", { friendly_name: "Jo", user_id: "jo" });
  add("binary_sensor.bedroom_2_window", "bedroom_2", "on", {
    device_class: "window",
    friendly_name: "Window",
  });
  add("binary_sensor.terrace_door", "living", "off", {
    device_class: "door",
    friendly_name: "Terrace Door",
  });
  add("binary_sensor.utility_leak", "utility", "off", {
    device_class: "moisture",
    friendly_name: "Leak Sensor",
  });
  add("valve.main_water", "utility", "open", {
    device_class: "water",
    friendly_name: "Main Water",
  });
  add("cover.driveway_gate", "driveway", "closed", { device_class: "gate", friendly_name: "Gate" });
  add("switch.kitchen_socket", "kitchen", "on", {
    device_class: "outlet",
    friendly_name: "Coffee Socket",
  });
  add("sensor.house_power", null, "640", {
    device_class: "power",
    unit_of_measurement: "W",
    friendly_name: "House Power",
  });
  add("sensor.water_pressure", "utility", "2.4", {
    device_class: "pressure",
    unit_of_measurement: "bar",
    friendly_name: "Water Pressure",
  });
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
    saved: null,
    async callWS(msg) {
      if (msg.type === "lovelace/config") return { strategy: { type: "custom:kage" } };
      if (msg.type === "lovelace/config/save") {
        this.saved = msg.config;
        return null;
      }
      return Object.values(floors);
    },
    async callService(domain, service, data) {
      this.calls.push([domain, service, data]);
    },
  };
}
