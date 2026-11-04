import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { answerSupport, triageIssue } from "./assistant.js";
import { bucketKey, ensureBucket, publicLearning, rankLocations, recordAttempt, rememberLocation } from "./learning.js";
import { createStore } from "./store.js";
import { publicTargets, targetFor } from "./targets.js";
import { displayManufacturer, validateChannels, validateDeviceId } from "./validate.js";
import { buildUnitsTemplate, readUnitRows } from "./xlsx.js";

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
  app.use(express.json({ limit: "4mb" }));

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

  app.post("/api/equipment/bulk", (req, res) => {
    const result = store.update((data) => importEquipmentFile(data, req.body?.csv));
    res.status(201).json(result);
  });

  app.get("/api/mail", (_req, res) => {
    const mail = store.update((data) => publicInvite(data, ensurePreviewInvite(data)));
    res.json(mail);
  });

  app.get("/api/start/:token/template.xlsx", (req, res) => {
    const data = store.read();
    inviteByToken(data, req.params.token);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"FleetVu-units.xlsx\"");
    res.setHeader("Cache-Control", "no-cache");
    res.send(buildUnitsTemplate());
  });

  app.get("/api/start/:token", (req, res) => {
    const data = store.read();
    res.json(publicInvite(data, inviteByToken(data, req.params.token)));
  });

  app.post("/api/start/:token/submit", (req, res) => {
    const buffer = decodeWorkbook(req.body);
    let table;
    try {
      table = readUnitRows(buffer);
    } catch {
      throw httpError(400, "Upload the Excel template (.xlsx).");
    }
    const result = store.update((data) => importEquipmentTable(data, table, inviteByToken(data, req.params.token)));
    res.status(201).json(result);
  });

  app.post("/api/start/:token/join", (req, res) => {
    const account = store.update((data) => joinInvite(data, req.params.token, req.body || {}));
    res.status(201).json(account);
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

  app.use(express.static(path.join(__dirname, "..", "public"), {
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-cache");
    },
  }));

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? "FleetVu could not complete that." : error.message });
  });

  return app;

  function importEquipmentFile(data, csv) {
    return importEquipmentTable(data, parseCsv(csv));
  }

  function importEquipmentTable(data, table, invite = null) {
    if (!Array.isArray(table) || table.length < 2) throw httpError(400, "The file needs a header row and at least one unit.");
    const columns = mapBulkColumns(table[0]);
    if (!columns) throw httpError(400, "The file needs columns for manufacturer, model, device ID, and IMEI.");
    const errors = [];
    const seen = new Set(data.equipment.map((item) => item.deviceId.toLowerCase()));
    let added = 0;
    for (let index = 1; index < table.length; index += 1) {
      const row = table[index];
      const rowNumber = index + 1;
      const manufacturerName = cell(row, columns.manufacturer);
      const model = cell(row, columns.model);
      const deviceId = cell(row, columns.deviceId);
      const imei = cell(row, columns.imei).replace(/[\s-]+/g, "");
      const maker = parseBulkManufacturer(manufacturerName);
      if (!maker) {
        errors.push(`Row ${rowNumber} needs a manufacturer name.`);
        continue;
      }
      if (!model) {
        errors.push(`Row ${rowNumber} needs a model.`);
        continue;
      }
      const idCheck = validateDeviceId(deviceId);
      if (!idCheck.ok) {
        errors.push(`Row ${rowNumber}: ${idCheck.error}`);
        continue;
      }
      if (!/^\d{14,16}$/.test(imei)) {
        errors.push(`Row ${rowNumber} needs an IMEI of 14 to 16 digits.`);
        continue;
      }
      if (seen.has(idCheck.deviceId.toLowerCase())) {
        errors.push(`Row ${rowNumber} repeats device ID ${idCheck.deviceId}.`);
        continue;
      }
      const key = bucketKey(maker.manufacturer, maker.otherName);
      const bucket = ensureBucket(data.learning, key, maker.manufacturer);
      const location = ensureBulkLocation(bucket);
      const now = new Date().toISOString();
      const unit = {
        id: crypto.randomUUID(),
        manufacturer: maker.manufacturer,
        otherName: maker.otherName,
        deviceId: idCheck.deviceId,
        locationId: location.id,
        locationLabel: location.label,
        learningKey: key,
        assetName: idCheck.deviceId,
        model,
        channels: [],
        simNote: "",
        imei,
        connectTarget: snapshotTarget(maker.manufacturer),
        updatedAt: now,
        status: "awaiting_connection",
        createdAt: now,
        lastCheck: null,
      };
      if (invite) {
        unit.inviteId = invite.id;
        invite.unitIds ||= [];
        invite.unitIds.push(unit.id);
      }
      data.equipment.push(unit);
      seen.add(idCheck.deviceId.toLowerCase());
      added += 1;
    }
    return { added, skipped: errors.length, errors: errors.slice(0, 8) };
  }

  function cell(row, index) {
    return String(row[index] ?? "").trim();
  }

  function parseBulkManufacturer(name) {
    const value = String(name || "").trim();
    const lower = value.toLowerCase();
    if (lower === "howen") return { manufacturer: "howen", otherName: "" };
    if (lower === "stonkam") return { manufacturer: "stonkam", otherName: "" };
    if (value.length < 2) return null;
    return { manufacturer: "other", otherName: value };
  }

  function ensureBulkLocation(bucket) {
    let location = bucket.locations.find((item) => item.id === "bulk-file");
    if (!location) {
      location = {
        id: "bulk-file",
        label: "Uploaded file",
        detail: "The device ID came from a file the customer uploaded.",
        origin: "bulk",
        successes: 0,
        failures: 0,
        attempts: [],
      };
      bucket.locations.push(location);
    }
    return location;
  }

  function mapBulkColumns(header) {
    const columns = {};
    header.forEach((name, index) => {
      const key = String(name || "").trim().toLowerCase().replace(/[_-]+/g, " ");
      if (/manufacturer|maker|company/.test(key)) columns.manufacturer = index;
      else if (/model/.test(key)) columns.model = index;
      else if (/device/.test(key) || key === "id") columns.deviceId = index;
      else if (/imei/.test(key)) columns.imei = index;
    });
    if (["manufacturer", "model", "deviceId", "imei"].every((key) => Number.isInteger(columns[key]))) return columns;
    return null;
  }

  function parseCsv(raw) {
    const text = String(raw || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"') {
          if (text[index + 1] === '"') {
            value += '"';
            index += 1;
          } else quoted = false;
        } else value += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        row.push(value);
        value = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(value);
        value = "";
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
      } else value += char;
    }
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
    return rows;
  }

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
      imei: String(body.imei || "").trim(),
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

  function ensurePreviewInvite(data) {
    data.invites ||= [];
    let invite = data.invites.find((item) => item.preview);
    if (!invite) {
      invite = {
        id: crypto.randomUUID(),
        token: randomBytes(16).toString("hex"),
        preview: true,
        createdAt: new Date().toISOString(),
        unitIds: [],
        account: null,
      };
      data.invites.push(invite);
    }
    invite.unitIds ||= [];
    return invite;
  }

  function inviteByToken(data, token) {
    const invite = (data.invites || []).find((item) => item.token === token);
    if (!invite) throw httpError(404, "That setup link is not valid.");
    invite.unitIds ||= [];
    return invite;
  }

  function publicInvite(data, invite) {
    const units = invite.unitIds
      .map((id) => data.equipment.find((item) => item.id === id))
      .filter(Boolean);
    const connectedCount = units.filter((item) => item.status === "connected").length;
    return {
      token: invite.token,
      submitted: units.length > 0,
      unitCount: units.length,
      connectedCount,
      allConnected: units.length > 0 && connectedCount === units.length,
      joined: Boolean(invite.account),
    };
  }

  function decodeWorkbook(body) {
    const raw = String(body?.xlsxBase64 || "").trim();
    if (!raw) throw httpError(400, "Upload the filled Excel template.");
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw httpError(400, "Upload the Excel template (.xlsx).");
    }
    return buffer;
  }

  function hashPassword(password) {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 32).toString("hex");
    return { salt, hash };
  }

  function cleanPeople(raw) {
    if (!Array.isArray(raw)) throw httpError(400, "Assign a manager, an admin, and a superadmin.");
    const allowed = ["manager", "admin", "superadmin"];
    const people = raw.map((person) => ({
      name: String(person?.name || "").trim(),
      role: String(person?.role || "").trim().toLowerCase(),
      region: String(person?.region || "").trim(),
      location: String(person?.location || "").trim(),
    })).filter((person) => person.name || person.region || person.location || person.role);
    for (const person of people) {
      if (!allowed.includes(person.role)) throw httpError(400, "Each person needs a role: manager, admin, or superadmin.");
      if (person.name.length < 2) throw httpError(400, "Each person needs a name.");
      if (person.region.length < 2 || person.location.length < 2) {
        throw httpError(400, "Assign each person to a region and a location.");
      }
    }
    for (const role of allowed) {
      if (!people.some((person) => person.role === role)) {
        throw httpError(400, "Assign a manager, an admin, and a superadmin.");
      }
    }
    return people;
  }

  function joinInvite(data, token, body) {
    const invite = inviteByToken(data, token);
    if (!publicInvite(data, invite).allConnected) {
      throw httpError(409, "The login opens after every unit is connected.");
    }
    const email = String(body.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Enter the email you will use to log in.");
    const password = String(body.password || "");
    if (password.length < 8) throw httpError(400, "Use a password of at least 8 characters.");
    const people = cleanPeople(body.people);
    const { salt, hash } = hashPassword(password);
    invite.account = {
      email,
      passwordSalt: salt,
      passwordHash: hash,
      people,
      createdAt: new Date().toISOString(),
    };
    return { ok: true, email };
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
