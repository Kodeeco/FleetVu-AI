import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { answerSupport, triageIssue } from "./assistant.js";
import { bucketKey, ensureBucket, publicLearning, rankLocations, recordAttempt, rememberLocation } from "./learning.js";
import { createStore } from "./store.js";
import { publicTargets, targetFor } from "./targets.js";
import { displayManufacturer, validateChannels, validateDeviceId } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataFile = path.join(__dirname, "..", "data", "fleetvu.json");

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function equipmentView(equipment) {
  return {
    ...equipment,
    manufacturerLabel: displayManufacturer(equipment),
  };
}

function snapshotTarget(manufacturer) {
  const key = manufacturer === "howen" || manufacturer === "stonkam" ? manufacturer : "other";
  const target = targetFor(key);
  return {
    address: target.address,
    placeholder: true,
    notice: target.notice,
    ports: target.ports,
    menuSteps: target.menuSteps,
  };
}

export function createApp({ dataFile = defaultDataFile } = {}) {
  const store = createStore(dataFile);
  const app = express();
  app.use(express.json({ limit: "200kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, product: "FleetVu" });
  });

  app.get("/api/state", (_req, res) => {
    const data = store.read();
    res.json({
      equipment: data.equipment.map(equipmentView),
      issues: data.issues,
      registrations: data.registrations,
      learning: publicLearning(data.learning),
      targets: publicTargets(),
    });
  });

  app.post("/api/device-id/check-format", (req, res) => {
    const result = validateDeviceId(req.body?.deviceId);
    if (!result.ok) throw httpError(400, result.error);
    res.json({ ok: true, deviceId: result.deviceId });
  });

  app.post("/api/equipment", (req, res) => {
    const saved = store.update((data) => saveEquipment(data, null, req.body || {}));
    res.status(201).json({ equipment: equipmentView(saved) });
  });

  app.patch("/api/equipment/:id", (req, res) => {
    const saved = store.update((data) => saveEquipment(data, req.params.id, req.body || {}));
    res.json({ equipment: equipmentView(saved) });
  });

  app.post("/api/equipment/:id/stand-in", (req, res) => {
    const registration = store.update((data) => {
      const equipment = data.equipment.find((item) => item.id === req.params.id);
      if (!equipment) throw httpError(404, "That unit is not in FleetVu yet.");
      const entry = {
        id: crypto.randomUUID(),
        equipmentId: equipment.id,
        deviceId: equipment.deviceId,
        manufacturer: equipment.manufacturer,
        source: "local-stand-in",
        at: new Date().toISOString(),
      };
      data.registrations.push(entry);
      return entry;
    });
    res.status(201).json({
      registration,
      note: "Recorded a practice connection for this device ID. Check again to confirm it matches. This is only so you can try the steps on this computer.",
    });
  });

  app.post("/api/equipment/:id/check", (req, res) => {
    const result = store.update((data) => verifyEquipment(data, req.params.id));
    res.json(result);
  });

  app.post("/api/support", (req, res) => {
    const data = store.read();
    const reply = answerSupport({
      message: req.body?.message,
      context: req.body?.context || {},
      data,
    });
    res.json(reply);
  });

  app.post("/api/issues", (req, res) => {
    const issue = store.update((data) => createIssue(data, req.body || {}));
    res.status(201).json({ issue });
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: `No FleetVu API at ${req.path}` });
  });

  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? "FleetVu could not complete that." : error.message });
  });

  return app;

  function saveEquipment(data, id, body) {
    const manufacturer = body.manufacturer;
    if (!["howen", "stonkam", "other"].includes(manufacturer)) {
      throw httpError(400, "Choose Howen, Stonkam, or another manufacturer.");
    }
    const otherName = String(body.otherName || "").trim();
    if (manufacturer === "other" && otherName.length < 2) {
      throw httpError(400, "Enter the manufacturer's name.");
    }
    const idCheck = validateDeviceId(body.deviceId);
    if (!idCheck.ok) throw httpError(400, idCheck.error);
    const channels = validateChannels(body.channels);
    if (!channels.ok) throw httpError(400, channels.error);
    const assetName = String(body.assetName || "").trim() || idCheck.deviceId;

    const key = bucketKey(manufacturer, otherName);
    const bucket = ensureBucket(data.learning, key, manufacturer);
    const location = rememberLocation(bucket, {
      locationId: body.locationId,
      customLabel: body.customLocation,
    });

    const now = new Date().toISOString();
    const fields = {
      manufacturer,
      otherName: manufacturer === "other" ? otherName : "",
      deviceId: idCheck.deviceId,
      locationId: location.id,
      locationLabel: location.label,
      learningKey: key,
      assetName,
      model: String(body.model || "").trim(),
      channels: channels.channels,
      simNote: String(body.simNote || "").trim(),
      connectTarget: snapshotTarget(manufacturer),
      updatedAt: now,
    };

    if (!id) {
      const created = {
        id: crypto.randomUUID(),
        ...fields,
        status: "awaiting_connection",
        createdAt: now,
        lastCheck: null,
      };
      data.equipment.push(created);
      return created;
    }

    const existing = data.equipment.find((item) => item.id === id);
    if (!existing) throw httpError(404, "That unit is not in FleetVu yet.");
    const identityChanged = existing.deviceId !== fields.deviceId || existing.manufacturer !== fields.manufacturer;
    Object.assign(existing, fields);
    if (identityChanged) {
      existing.status = "awaiting_connection";
      existing.lastCheck = null;
    }
    return existing;
  }

  function verifyEquipment(data, id) {
    const equipment = data.equipment.find((item) => item.id === id);
    if (!equipment) throw httpError(404, "That unit is not in FleetVu yet.");
    const match = [...data.registrations].reverse().find((entry) => {
      return entry.deviceId === equipment.deviceId && entry.manufacturer === equipment.manufacturer;
    });
    const connected = Boolean(match);
    const at = new Date().toISOString();
    equipment.status = connected ? "connected" : "not_connected";
    equipment.lastCheck = {
      at,
      connected,
      source: match?.source || null,
      registrationAt: match?.at || null,
    };
    equipment.updatedAt = at;
    const bucket = ensureBucket(data.learning, equipment.learningKey, equipment.manufacturer);
    const location = bucket.locations.find((item) => item.id === equipment.locationId);
    if (!location) throw httpError(400, "The place you found this device ID is no longer stored.");
    recordAttempt(location, {
      at,
      equipmentId: equipment.id,
      deviceId: equipment.deviceId,
      outcome: connected ? "success" : "failure",
      source: match?.source || "no-registration",
    });
    return {
      equipment: equipmentView(equipment),
      connected,
      location: rankLocations(bucket.locations).find((item) => item.id === location.id),
      message: connected
        ? `Connected. FleetVu matched device ID ${equipment.deviceId}.`
        : `Not connected yet. FleetVu has not heard from device ID ${equipment.deviceId}.`,
    };
  }

  function createIssue(data, body) {
    const description = String(body.description || "").trim();
    if (description.length < 8) throw httpError(400, "Describe what the unit or the connection did.");
    const symptoms = new Set(["never-online", "id-mismatch", "cameras-blank", "drops-offline", "wrong-server", "other"]);
    const symptom = symptoms.has(body.symptom) ? body.symptom : "other";
    let equipment = null;
    if (body.equipmentId) {
      equipment = data.equipment.find((item) => item.id === body.equipmentId);
      if (!equipment) throw httpError(404, "That unit is not in FleetVu yet.");
    }
    const manufacturer = equipment?.manufacturer || body.manufacturer;
    if (!["howen", "stonkam", "other"].includes(manufacturer)) {
      throw httpError(400, "Choose the manufacturer this problem is about.");
    }
    const otherName = equipment?.otherName || String(body.otherName || "").trim();
    if (manufacturer === "other" && otherName.length < 2) {
      throw httpError(400, "Enter the manufacturer's name.");
    }
    const triage = triageIssue({
      symptom,
      description,
      manufacturer,
      otherName,
      equipment,
      data,
    });
    const issue = {
      id: crypto.randomUUID(),
      equipmentId: equipment?.id || null,
      assetName: equipment?.assetName || "",
      deviceId: equipment?.deviceId || "",
      manufacturer,
      otherName: manufacturer === "other" ? otherName : "",
      symptom,
      description,
      triage,
      createdAt: new Date().toISOString(),
    };
    data.issues.unshift(issue);
    return issue;
  }
}
