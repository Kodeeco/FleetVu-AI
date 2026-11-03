import { bucketKey, ensureBucket, rankLocations } from "./learning.js";
import { targetFor } from "./targets.js";
import { displayManufacturer } from "./validate.js";

function clip(text, max = 180) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function portList(target) {
  return target.ports.map((port) => `${port.label} ${port.number} (${port.deviceField})`).join(", ");
}

function locationSummary(locations) {
  if (!locations.length) return "No locations are stored yet.";
  return locations
    .map((location) => {
      const tally =
        location.successes > 0
          ? `${location.successes} successful connection${location.successes === 1 ? "" : "s"}`
          : location.failures > 0
            ? `${location.failures} check${location.failures === 1 ? "" : "s"} with no connection`
            : "not confirmed yet";
      return `${location.label} (${location.badge}; ${tally})`;
    })
    .join("; ");
}

function lookupLocations(data, manufacturer, otherName) {
  if (!manufacturer) return [];
  const key = bucketKey(manufacturer, otherName);
  const bucket = data.learning.manufacturers[key] || data.learning.manufacturers[manufacturer] || data.learning.manufacturers.other;
  return bucket ? rankLocations(bucket.locations) : [];
}

export function answerSupport({ message, context = {}, data }) {
  const text = String(message || "").trim();
  if (!text) {
    const error = new Error("Ask a question for AI Support.");
    error.status = 400;
    throw error;
  }
  const manufacturer = ["howen", "stonkam", "other"].includes(context.manufacturer)
    ? context.manufacturer
    : ["howen", "stonkam", "other"].includes(context.equipment?.manufacturer)
      ? context.equipment.manufacturer
      : "";
  const otherName = context.otherName || context.equipment?.otherName || "";
  const label = manufacturer ? displayManufacturer(manufacturer, otherName) : "this unit";
  const resolvedTarget = manufacturer ? targetFor(manufacturer) : null;
  const locations = lookupLocations(data, manufacturer, otherName);
  const q = text.toLowerCase();
  const successful = locations.find((location) => location.successes > 0);

  if (/my own server|host (a |the )?server|invent a server|customer server|our server/.test(q)) {
    return {
      reply: `FleetVu supplies the server. You type FleetVu's address and ports on the device. You do not host a server and you do not make one up. ${
        resolvedTarget
          ? `For ${label}, the address is ${resolvedTarget.address}. ${resolvedTarget.notice}`
          : "Pick Howen, Stonkam, or the other manufacturer path and the wizard shows the address."
      }`,
    };
  }

  if (/port|address|server|ingest|host/.test(q)) {
    if (!resolvedTarget) {
      return {
        reply: "Open Add equipment and choose a manufacturer. FleetVu then shows the address and ports to type on the device. Those values come from FleetVu, not from you.",
      };
    }
    return {
      reply: `On the ${label} unit, enter FleetVu's address ${resolvedTarget.address}. Ports: ${portList(resolvedTarget)}. ${resolvedTarget.notice} Your part is the device ID and the cameras on the unit.`,
    };
  }

  if (/device id|sticker|terminal|serial|found the id|which id|where (do i|can i|should i|is the id|did you)/.test(q)) {
    const lead = successful
      ? `For ${label}, start with locations that already led to a connection. Learning loop: ${locationSummary(locations)}.`
      : `For ${label}, the device ID location is not confirmed yet. The learning loop starts with the best guess (sticker and device menu): ${locationSummary(locations)}.`;
    const notes = locations.slice(0, 1).map((location) => location.detail).filter(Boolean).join(" ");
    return {
      reply: `${lead} ${notes} Copy that ID into FleetVu. Do not invent one. FleetVu matches the unit when it connects by that ID. After you point the unit at FleetVu, Check connection records whether that place worked.`,
    };
  }

  if (/learning loop|learned|remember/.test(q)) {
    return {
      reply: `The learning loop is stored memory for each manufacturer. It keeps the place you found the device ID and whether Check connection succeeded or failed. Places that already led to a connection are listed first for the next customer. ${
        locations.length ? `Currently for ${label}: ${locationSummary(locations)}.` : "Choose a manufacturer to see its memory."
      } It is not a separate learning service.`,
    };
  }

  if (/camera|channel|video blank|no video/.test(q)) {
    return {
      reply: `Name each camera the way it is installed (road, driver, cargo, and so on). A blank picture usually means that channel has no camera seated, or the channel number on the unit does not match the one you saved. The device ID and FleetVu's server address are separate from the camera list. ${
        resolvedTarget ? `The unit still has to register at ${resolvedTarget.address}.` : ""
      }`.trim(),
    };
  }

  if (/not connect|offline|never|fail|no heartbeat|won't|wont|cannot connect|can't connect/.test(q)) {
    const where = successful
      ? `Recheck the ID against a location that already connected: ${successful.label}.`
      : "Recheck the ID against the sticker and the device menu, and record where you actually found it.";
    return {
      reply: `${label} is not matching a registration yet. ${where} Then confirm the unit shows FleetVu's address${
        resolvedTarget ? ` ${resolvedTarget.address}` : ""
      } and FleetVu's ports, not a server of your own. Run Check connection again. A miss is stored on that location so the next person can see it.`,
    };
  }

  const stepHint = {
    0: "Choose Howen, Stonkam, or another manufacturer. The rest of the wizard follows that choice.",
    1: "Copy the device ID from the unit and say where you found it. The learning loop lists confirmed places first.",
    2: "Name the asset and the cameras on this unit. FleetVu still uses the device ID to recognize the connection.",
    3: "Type FleetVu's address and ports on the device. They are shown on this step and you cannot edit them.",
    4: "Check connection asks FleetVu whether a registration with this device ID has arrived. Success and failure are stored with the place you found the ID.",
  }[context.step];

  return {
    reply: stepHint
      ? `${stepHint} You can ask where the device ID is, which address to type, or what to do if the unit does not connect.`
      : "Ask where to find a device ID, which FleetVu address to type on the unit, or report what the connection is doing. Tracking lists units that have already connected.",
  };
}

export function triageIssue({ symptom, description, manufacturer, otherName, equipment, data }) {
  const key = manufacturer === "howen" || manufacturer === "stonkam" ? manufacturer : "other";
  const label = displayManufacturer(manufacturer, otherName || equipment?.otherName || "");
  const target = targetFor(key);
  const bucketKeyName = bucketKey(key === "other" ? "other" : key, otherName || equipment?.otherName || "");
  ensureBucket(data.learning, bucketKeyName, key);
  const locations = rankLocations(data.learning.manufacturers[bucketKeyName].locations);
  const successful = locations.find((location) => location.successes > 0);
  const deviceId = equipment?.deviceId || "";
  const where = equipment?.locationLabel ? ` The ID was reported from: ${equipment.locationLabel}.` : "";
  const checks = [
    "Compare the device ID on the unit with the ID saved in FleetVu. They must match.",
    `On the device, the server address must be ${target.address}.`,
    `Ports must be ${target.ports.map((port) => `${port.number}`).join(" and ")}.`,
  ];
  if (successful) {
    checks.unshift(`For ${label}, a connection already succeeded when the ID was found here: ${successful.label}.`);
  } else {
    checks.unshift(`For ${label}, no location has a successful connection yet. The starting guess is the sticker and the device menu.`);
  }

  let whatFailed;
  let nextStep;
  switch (symptom) {
    case "never-online":
      whatFailed = `${label} did not register, so FleetVu has nothing to match${deviceId ? ` to device ID ${deviceId}` : ""}.${where}`;
      nextStep = successful
        ? `Copy the ID again from ${successful.label}, confirm the unit has ${target.address}, then run Check connection.`
        : `Copy the ID from the sticker or the device menu, tell the learning loop where you found it, enter ${target.address} on the unit, then run Check connection.`;
      break;
    case "id-mismatch":
      whatFailed = `The ID saved in FleetVu${deviceId ? ` (${deviceId})` : ""} is not the ID the ${label} unit is registering with.${where}`;
      nextStep = "Copy the ID again from the place you found it. Do not type a new one. FleetVu can match the unit only when those values are the same.";
      break;
    case "cameras-blank":
      whatFailed = `${label} may be connected, but a camera channel has no picture.`;
      nextStep = "Reseat that camera and confirm the channel name in FleetVu matches the channel on the unit. Then check the other channels.";
      break;
    case "drops-offline":
      whatFailed = `${label} registered and then stopped reaching FleetVu.`;
      nextStep = `Check that the unit still has data service and that its server page still shows ${target.address} and ports ${target.ports.map((port) => port.number).join(" and ")}.`;
      break;
    case "wrong-server":
      whatFailed = `${label} is pointed at a server other than FleetVu, or the ports do not match.`;
      nextStep = `Enter ${target.address} and ports ${target.ports.map((port) => port.number).join(" and ")} on the device. FleetVu provides those values. Do not host your own.`;
      break;
    default:
      whatFailed = `${label} problem, as reported: ${clip(description) || "no detail given"}.`;
      nextStep = `Confirm the device ID, then set the unit to ${target.address}. Run Check connection and read the learning loop result for that location.`;
  }

  return {
    whatFailed,
    manufacturer: label,
    nextStep,
    checks,
  };
}
