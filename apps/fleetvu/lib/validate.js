const INVENTED = new Set([
  "test",
  "testing",
  "abc",
  "device",
  "deviceid",
  "id",
  "na",
  "n/a",
  "none",
  "unknown",
  "todo",
  "xxx",
  "123",
  "1234",
  "12345",
  "123456",
  "0000",
  "00000",
  "000000",
  "sample",
  "example",
  "placeholder",
  "temp",
  "asdf",
]);

export function validateDeviceId(raw) {
  const deviceId = String(raw ?? "").trim();
  if (!deviceId) {
    return {
      ok: false,
      error: "Copy the device ID from the unit. FleetVu matches the connection on that ID.",
    };
  }
  if (deviceId.length < 4) {
    return {
      ok: false,
      error: "That value is too short. Copy the full ID from the unit. Do not invent one.",
    };
  }
  const compact = deviceId.toLowerCase().replace(/[\s_-]+/g, "");
  if (INVENTED.has(compact) || INVENTED.has(deviceId.toLowerCase())) {
    return {
      ok: false,
      error: "That looks made up. Copy the ID from the unit, then paste it here.",
    };
  }
  if (/^(.)\1+$/.test(compact)) {
    return {
      ok: false,
      error: "That looks made up. Copy the ID printed on the unit or shown in its menu.",
    };
  }
  return { ok: true, deviceId };
}

export function validateChannels(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Add at least one camera channel." };
  }
  const channels = [];
  for (const entry of raw) {
    const label = String(entry ?? "").trim();
    if (!label) continue;
    channels.push({ label });
  }
  if (channels.length === 0) {
    return { ok: false, error: "Name at least one camera channel." };
  }
  return { ok: true, channels };
}

export function displayManufacturer(equipmentOrName, otherName = "") {
  const key = typeof equipmentOrName === "string" ? equipmentOrName : equipmentOrName?.manufacturer;
  if (key === "howen") return "Howen";
  if (key === "stonkam") return "Stonkam";
  const named = (typeof equipmentOrName === "object" ? equipmentOrName?.otherName : otherName) || "";
  return named.trim() || "Other manufacturer";
}
