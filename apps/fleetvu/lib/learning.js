const GUESSES = {
  howen: [
    {
      id: "guess-sticker",
      label: "Sticker on the MDVR",
      detail:
        "Best guess, not a confirmed location. The sticker may be labeled Device ID, ID, or SN. Howen CMS may call that same value the terminal number.",
    },
    {
      id: "guess-menu",
      label: "Unit menu, device info",
      detail:
        "Best guess, not a confirmed location. Open the MDVR's device information page and copy the ID shown there.",
    },
  ],
  stonkam: [
    {
      id: "guess-label",
      label: "Label on the unit",
      detail:
        "Best guess, not a confirmed location. The ID their CMS uses when the unit registers may be printed on this label.",
    },
    {
      id: "guess-menu",
      label: "Device menu, system or device information",
      detail:
        "Best guess, not a confirmed location. Check the system or device information page and copy the ID shown there.",
    },
  ],
  other: [
    {
      id: "guess-sticker",
      label: "Sticker or nameplate on the unit",
      detail:
        "Best guess, not a confirmed location. Copy the ID printed on the unit. Do not invent one.",
    },
    {
      id: "guess-menu",
      label: "Device menu, system or device information",
      detail:
        "Best guess, not a confirmed location. Use the ID that manufacturer's software shows when the unit registers.",
    },
  ],
};

export function bucketKey(manufacturer, otherName = "") {
  if (manufacturer === "other") {
    const name = String(otherName || "").trim().toLowerCase().replace(/\s+/g, " ");
    return name ? `other:${name}` : "other";
  }
  return manufacturer;
}

export function seedLocations(seedName) {
  const guesses = GUESSES[seedName] || GUESSES.other;
  return guesses.map((guess) => ({
    id: guess.id,
    label: guess.label,
    detail: guess.detail,
    origin: "guess",
    successes: 0,
    failures: 0,
    attempts: [],
  }));
}

export function createLearningState() {
  return {
    manufacturers: {
      howen: { locations: seedLocations("howen") },
      stonkam: { locations: seedLocations("stonkam") },
      other: { locations: seedLocations("other") },
    },
  };
}

export function ensureBucket(learning, key, seedName) {
  if (!learning.manufacturers[key]) {
    const seed = seedName === "howen" || seedName === "stonkam" ? seedName : "other";
    learning.manufacturers[key] = { locations: seedLocations(seed) };
  }
  return learning.manufacturers[key];
}

function badgeFor(location) {
  if (location.successes > 0) return "Led to a connection";
  if (location.failures > 0) return "No connection from here yet";
  if (location.origin === "customer") return "Reported, not tried yet";
  return "Best guess, not confirmed";
}

export function rankLocations(locations) {
  return locations
    .map((location, index) => ({ location, index }))
    .sort((a, b) => {
      if (b.location.successes !== a.location.successes) {
        return b.location.successes - a.location.successes;
      }
      const aFailed = a.location.failures > 0;
      const bFailed = b.location.failures > 0;
      if (aFailed !== bFailed) return aFailed ? 1 : -1;
      if (a.location.failures !== b.location.failures) {
        return a.location.failures - b.location.failures;
      }
      return a.index - b.index;
    })
    .map(({ location }) => ({
      id: location.id,
      label: location.label,
      detail: location.detail,
      origin: location.origin,
      successes: location.successes,
      failures: location.failures,
      badge: badgeFor(location),
      attempts: location.attempts.slice(-5),
    }));
}

export function rememberLocation(bucket, input) {
  if (input.locationId) {
    const found = bucket.locations.find((location) => location.id === input.locationId);
    if (!found) {
      const error = new Error("Choose where you found the device ID, or describe the place.");
      error.status = 400;
      throw error;
    }
    return found;
  }
  const label = String(input.customLabel || "").trim().replace(/\s+/g, " ");
  if (label.length < 3) {
    const error = new Error("Tell FleetVu where you actually found the device ID.");
    error.status = 400;
    throw error;
  }
  const existing = bucket.locations.find((location) => location.label.toLowerCase() === label.toLowerCase());
  if (existing) return existing;
  const created = {
    id: crypto.randomUUID(),
    label,
    detail: "A customer reported finding the device ID here.",
    origin: "customer",
    successes: 0,
    failures: 0,
    attempts: [],
  };
  bucket.locations.push(created);
  return created;
}

export function recordAttempt(location, attempt) {
  location.attempts.push(attempt);
  if (attempt.outcome === "success") location.successes += 1;
  else location.failures += 1;
  return attempt;
}

export function publicLearning(learning) {
  const out = {};
  for (const [key, bucket] of Object.entries(learning.manufacturers)) {
    out[key] = { locations: rankLocations(bucket.locations.filter((location) => location.origin !== "bulk")) };
  }
  return out;
}
