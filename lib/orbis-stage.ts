const satelliteOpening = "A wide, stationary aerial view holds the opening image in daylight. The blue glacier is at the head of the valley, the river curls around a pale gravel bar in the middle, and a small farmhouse cluster sits in the meadow at lower right. Water flows through the original channel with the ice edge, gravel bar and farmhouses held in the same framing.";

const tileOpening = "A distant wide shot holds the entire stationary square Patagonian terrain block, including its highest ridge and full base, with generous charcoal space on every side. The camera makes one smooth 360-degree clockwise orbit in 16 seconds at 25 degrees above the ground plane. It stays aimed at the block's center at a constant distance and focal length. All four sides pass in order before the creek mouth returns to its opening position.";

const creekOpening = "A fixed wide aerial shot holds the landscape in the reference frame. Water moves along the visible creek channels in steady daylight. The camera keeps the same framing and the terrain stays in place.";

export const terrainSeedScale = 0.72;
export const terrainSeedBackground = "#23272c";

export async function padTerrainSeed(source: Blob) {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the wide terrain seed.");
    const scale = terrainSeedScale * Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.fillStyle = terrainSeedBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    const seed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    if (!seed) throw new Error("Could not encode the wide terrain seed.");
    return seed;
  } finally {
    bitmap.close();
  }
}

export const stageViews = {
  satellite: {
    label: "Satellite",
    frame: "/patagonia-satellite.jpg",
    frameName: "Glacial valley with a small riverside settlement",
    opening: satelliteOpening,
    directions: [
      { label: "Meteor impact", instant: true, text: "A small meteor strikes the bare slope above the river bend. A brief flash gives way to a rising dust plume on that slope. Wide, stationary daylight aerial shot of the same valley, with the river bend and glacier in view." },
      {
        label: "Farms · 300 years",
        text: "Parallel dark plough furrows appear across the open pasture immediately left of the existing farmhouse cluster. The fixed aerial view holds the glacier, gravel bar and farmhouses through the three-century time-lapse.",
      },
      {
        label: "Glacier retreat",
        text: "The lower edge of the blue glacier pulls uphill and exposes a broad strip of dark bedrock beside the same rock face. Hold the original aerial framing.",
      },
      {
        label: "Block creek",
        text: "A debris flow blocks the blue channel along the near edge of the pale gravel bar. Water pools upstream and flows behind the bar to rejoin the river. Hold the original aerial framing.",
      },
      {
        label: "Open spillway",
        text: "A narrow spillway opens through the same deposit along the original channel. The upstream pool shrinks as water flows through the opening. The debris remains on both sides.",
      },
      {
        label: "Forest · 3,000 years",
        text: "A band of dark green trees advances from the forest edge into the open field just left of the farmhouses. The fixed aerial view holds the river bend and field edge through the three-millennium time-lapse.",
      },
      { label: "Tilt-shift", text: "Focus sharply on the riverside settlement and gravel bar. A subtle tilt-shift lens gently softens the nearest and farthest slopes while the camera stays fixed." },
    ],
  },
  blocked: {
    label: "Blocked creek reference",
    frame: "/creek-blocked-reference.jpg",
    frameName: "Fixed aerial view of the blocked creek",
    opening: creekOpening,
    directions: [],
  },
  spillway: {
    label: "Open spillway reference",
    frame: "/creek-spillway-reference.jpg",
    frameName: "Fixed aerial view of the reopened creek",
    opening: creekOpening,
    directions: [],
  },
  terrain: {
    label: "Terrain orbit",
    frame: "/patagonia-glacial-tile.jpg",
    frameName: "Square glacial terrain tile",
    opening: tileOpening,
    directions: [
      { label: "Widen shot", text: "The camera pulls smoothly back until the entire terrain block, from the highest ridge to the full base, fits with clear charcoal space on every side. The clockwise orbit continues at this wider distance, 25 degrees above the ground plane." },
      { label: "Deepen gorge", text: "The existing gorge deepens in place, exposing a fresh band of bedrock along its walls. The river follows the same course as the clockwise orbit continues." },
      { label: "Landslide", text: "A broad slab shears away from the near granite cliff. Ochre dust billows downslope as the rock fragments pile into a fan and leave a fresh exposed scar. The camera continues its orbit." },
      { label: "Glacier retreat", text: "The blue glacier tongue recedes uphill and exposes dark ridged bedrock along its former footprint. A thin stream of meltwater runs over the exposed rock. The camera continues its orbit." },
      { label: "Moonlight", text: "Blue moonlight washes across the landscape as a thin silver reflection appears along the creek. The camera continues its orbit." },
    ],
  },
  gorge: {
    label: "Gorge lighting",
    frame: "/patagonia-survey-reference.jpg",
    frameName: "Narrow glacial gorge",
    opening: "A fixed high aerial camera looks down at a Patagonian glacial basin, 25 degrees from vertical. Granite ridges, lenga woodland, and the foreground river bend stay in the same positions. The terrain fills the frame and both riverbanks remain visible. Photoreal natural afternoon light, cool rocky shadows, snow streaks on the highest ridge, and glacial-blue water moving through the bend. Hold the opening image's camera height and composition as the river moves.",
    directions: [
      { label: "Moonlight", text: "Night falls over the same valley. Bright moonlight turns the entire landscape deep blue, with a silver reflection along the river. The aerial camera remains fixed." },
    ],
  },
};

export type StageView = keyof typeof stageViews;

export const satelliteEvents = [
  ["Rockfall", "A cluster of rocks tumbles off the cliff above the far bend, leaving a small trail of dust."],
  ["Slope collapse", "A narrow strip of loose gravel slides down the bare slope and settles in a fan at its base."],
  ["Ice break", "A slab breaks off the blue glacier's lower edge and leaves fresh ice exposed."],
  ["Meltwater surge", "Cloudy meltwater rushes down the existing channel from the foot of the glacier."],
  ["Gravel bar floods", "The river rises over the low tip of the pale gravel bar, leaving its high center exposed."],
  ["Bank erosion", "A thin shelf of earth crumbles into the water on the outer bank of the bend."],
  ["Sediment plume", "A pale brown plume enters the blue river at the inside of the bend and travels downstream along the existing channel."],
  ["River freezes", "A thin fringe of white ice spreads inward from the riverbanks, leaving water moving in the middle."],
  ["Snow squall", "A brief snow squall crosses the upper slopes and leaves a thin white dusting on the dark rock."],
  ["Snowmelt", "Snow patches on the sunlit hillside shrink, exposing the brown grass beneath."],
  ["Valley fog", "A low bank of fog follows the river and pools in the valley floor, below the ridgelines."],
  ["Cloud break", "A gap in the clouds sends a moving patch of sunlight across the gravel bar and riverbank."],
  ["Passing storm", "A dark rain curtain sweeps over the far ridge and passes across the valley."],
  ["Rainbow", "A faint rainbow forms over the far bend as sunlight passes through a narrow band of rain."],
  ["Wind gust", "A gust sweeps across the meadow, bending the tall grass in a moving wave."],
  ["Autumn foliage", "The existing trees along the near bank turn copper and gold."],
  ["Forest edge advances", "Dark green trees spread from the existing forest edge into a narrow strip of the open meadow."],
  ["Field ploughed", "Dark parallel furrows appear in the open pasture beside the original farmhouses."],
] as const;

export const timelinePaces = {
  slow: { label: "Slow", direction: "The time-lapse slows so each change unfolds visibly before the next." },
  fast: { label: "Fast", direction: "The changes unfold in a rapid, smooth time-lapse." },
  fastest: { label: "Very fast", direction: "The same changes accelerate in a very fast generational time-lapse." },
};

export type TimelinePace = keyof typeof timelinePaces;
