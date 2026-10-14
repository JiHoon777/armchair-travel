// All tunables in one place. Pure data: no DOM, importable from Node (tools/check_paths.mjs).

// Comfort limits (docs/research/02 section 5 and 8; numbers marked 출발값 are starting values).
export const COMFORT = {
  MAX_YAW_DEG_S: 10,        // hard ceiling for any camera yaw rate
  TARGET_YAW_DEG_S: 3,      // what the scripted cruise paths aim for
  MAX_PITCH_DEG_S: 5,
  ROLL_DEG: 0,              // horizon always level
  EASE_S: 1.5,              // velocity ramps at every scene start and end
  MAX_FLOW: 0.05,           // rad/s, optical flow = speed / height above ground (cruise scenes)
  FLOW_MARGIN: 0.93,        // paths aim for MAX_FLOW * FLOW_MARGIN
  MIN_CLEARANCE_M: 250,     // never closer than this to terrain (3D distance)
  // The descend/ascend zoom moves along the line of sight. Going from 25 km to the orbit in
  // the ~8 s the plan gives cannot meet MAX_FLOW, so those two scenes use a looming-rate
  // ceiling instead (image scale change per second) and keep the yaw/pitch/roll limits.
  ZOOM_MAX_PER_S: 0.4,
  // Turning the home globe toward the place happens on a dark background (object rotation,
  // not a landscape camera). Ceiling for that turn only.
  GLOBE_TURN_MAX_DEG_S: 20,
};

export const UI_IDLE_HIDE_S = 3;
export const LOOK_RESUME_S = 4;
export const LOOK_RETURN_S = 2;        // shortest return; longer for big offsets (look.js returnTime)
export const LOOK_RETURN_MARGIN = 0.9; // a return peaks at 90% of the yaw/pitch comfort limits
export const LOOK_SNAP_S = 8;          // a return that would take longer dips to dark instead
export const LOOK_SNAP_FADE_S = 0.6;   // dark dip for that (half out, half in)
export const CAPTION_SHOW_S = 10;
export const FADE_S = 1.5;            // terrain <-> pano full-screen fade (half out, half in)
export const JUMP_FADE_S = 1.2;       // next/previous scene
export const REDUCED_DISSOLVE_S = 3;  // prefers-reduced-motion: dissolve between still frames
export const PANO_AUTO_YAW_DEG_S = 1.5;
export const PANO_FADE_S = 1.5;
export const PANO_PITCH_DEG = -4;

// Scene order and lengths (s). The place file can override dur_s per scene.
export const SCENE_ORDER = ['descend', 'wide', 'approach', 'stand', 'daylapse', 'ascend'];
export const SCENE_DUR = { descend: 30, wide: 180, approach: 180, stand: 180, daylapse: 180, ascend: 10 };
export const TOUR_SCENES = ['descend', 'wide', 'approach', 'stand', 'daylapse'];

// Descend timeline (s from scene start).
export const DESCEND = {
  GLOBE_END_S: 21.5,        // swap globe -> terrain under full cloud cover
  CLOUD_IN: [19.0, 21.5],   // cloud cover rises
  CLOUD_OUT: [21.5, 24.5],  // and clears over the terrain
  START_ALT_M: 25000,       // terrain phase starts here
  PITCH_START_S: 5,         // pitch -90 -> wide pitch between these times
  TURN_MAX_S: 8,            // globe swing over the place finishes by then
  ZOOM_START_S: 0.5,
};
export const ASCEND = {
  TERRAIN_END_S: 3.5,
  CLOUD_IN: [1.2, 3.5],
  CLOUD_OUT: [3.5, 5.8],
  GLOBE_START_ALT_M: 2500000,
};

// PITCH_DEG: portrait screens; landscape screens use PITCH_LANDSCAPE_DEG so 15-20% of the frame is
// sky above the far rim (the descend's pitch-up then peaks at 4.9 deg/s, under the 5 deg/s limit)
export const WIDE = { RADIUS_M: 7000, ALT_M: 5500, PITCH_DEG: -25, PITCH_LANDSCAPE_DEG: -18, MAX_DEG_S: 2, START_AZ_DEG: 180, DIR: -1 };
export const APPROACH = {
  END_ABOVE_RIVER_M: 1050, END_ABOVE_RIVER_RANGE: [900, 1200],
  END_RADIUS_M: [900, 1300, 1700, 2200], LOOK_ABOVE_RIVER_M: 250,
  END_ARC_DEG: 28, FOV: 50,
};
// portrait screens look a little lower: more canyon, less sky above the caption
export const STAND = { FOV: 62, MAX_DEG_S: 1.5, PITCH_PORTRAIT_DEG: -12 };
export const DAYLAPSE = {
  RUN_S: 170, HOLD_START_S: 5, BEFORE_SUNRISE_MIN: 30,
  // 600 m above the rim: the nearest ground in view is about 1 km away, where the 13 m DEM and the
  // aerial photo still read as cliffs (at 320 m the soft near walls filled the foreground)
  ABOVE_GROUND_M: 600, DOLLY_M: 260, YAW_SWEEP_DEG: 12, FOV: 52,
  GOLDEN_SLOWDOWN: 3.5,
};

export const CAMERA = { FOV: 50, NEAR_MIN: 4, FAR: 2600000 };

// Local frame shared with the terrain data (see data contract).
export const ORIGIN = { lat: 36.1150, lon: -112.1050 };
export const M_PER_DEG_LAT = 110574;
export const M_PER_DEG_LON_EQ = 111320;
export const EARTH_R_M = 6371000;

// Camera hints used when place.json is missing or incomplete (Grand Canyon, research note 03).
export const DEFAULT_HINTS = {
  wide_focus: { lat: 36.1100, lon: -112.1000 },
  approach_target: { lat: 36.1002, lon: -112.0920, label_ko: '콜로라도강 · 팬텀 랜치 근처' },
  stand: { name_ko: '그랜저 포인트', lat: 36.0656, lon: -112.1216 },
  daylapse_from: { lat: 36.07452, lon: -112.15489, label_ko: '호피 포인트', look_at: { lat: 36.1200, lon: -112.1200 } },
};

// Terrain rendering.
export const TERRAIN = {
  CHUNK_CELLS: 128,
  LOD_STEPS: [1, 2, 4, 8],
  LOD_DIST_M: [0, 2600, 5200, 10500],
  LOD_DIST_MOBILE_SCALE: 0.65,
  OUTER_DROP_M: 30,
  SKIRT_M: [300, 350, 450, 600],  // deep enough to hide cracks next to a coarser neighbour
  HAZE_SCALE_H_M: 2600,
  HAZE_DENSITY_SEA: 3.6e-5,  // 1/m at sea level
  EDGE_FADE_M: [38000, 49000],
  APRON_RADIUS_M: 1500000,
  ANISO_CAP: 8,
  // imagery grade: gamma (>1 deepens mid-tones), saturation, warmth. Calibrated against the photos
  // shown later in the same tour (now.jpg, the 360 photo): canyon value ~0.45-0.6, saturation ~0.16-0.24
  GRADE: [1.18, 1.7, 0.03],
  EDGE_BLEND: [900, 40, 0.85],  // core imagery fades to the outer imagery from 900 m to 40 m inside the core edge
  STEEP_SOFTEN: 0.45,           // walls steeper than ~50 deg: blend toward the blurred local colour
  AMB_DAY: [0.42, 0.43, 0.48],  // sky light on the terrain by day (linear)
  SUN_DAY: 0.44,                // direct sun on the terrain by day (0.7 when low)
  BOUNCE: 0.08,                 // warm light bounced into the shade by day
  HAZE_FROM_ELEV_DEG: 3,        // haze colour = the rendered sky this high above the horizon (bluer, darker)
};

// Cast shadows from the DEM (terrain.js). Re-rendered when the sun moves more than MIN_DEG.
export const SHADOW = {
  FULL: { core: 1024, outer: 512, steps: 128 },
  LIGHT: { core: 512, outer: 256, steps: 72 },   // phones and software rendering
  REACH_M: 60000,
  MIN_DEG: 0.25,
  MIN_MS: 120,
  // the aerial photos' own sun (terrain.md: hillshade vs photo brightness fits best here)
  IMAGERY_SUN: { AZ_DEG: 195, ELEV_DEG: 30 },
  DEBAKE: 1.7,                  // brightness lift for pixels in the photos' baked cast shadows
};

export const GLOBE = {
  RADIUS: 1,
  HOME_DIST: 3.15,
  HOME_LAT: 24,
  HOME_LON_OFFSET: 28,
  AUTO_ROT_DEG_S: 1.2,
  FOV: 36,
};

export const AUDIO = { FADE_S: 3, DUCK_DB: -10, TARGET_LUFS: -27, MASTER: 0.9 };

export const DPR_CAP = { desktop: 2, mobile: 1.5 };
export const MOBILE_MAX_W = 800;
