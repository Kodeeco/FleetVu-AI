import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../lib/app.js";

async function withServer(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "fleetvu-"));
  const app = createApp({ dataFile: path.join(dir, "fleetvu.json") });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

async function post(base, urlPath, body) {
  const response = await fetch(`${base}${urlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

function equipmentBody(overrides = {}) {
  return {
    manufacturer: "howen",
    deviceId: "HWN-88421",
    locationId: "guess-sticker",
    assetName: "Truck 12",
    channels: ["Road facing"],
    ...overrides,
  };
}

test("rejects an invented device ID and keeps FleetVu's server address", async () => {
  await withServer(async (base) => {
    const invented = await post(base, "/api/equipment", equipmentBody({ deviceId: "test" }));
    assert.equal(invented.status, 400);
    assert.match(invented.payload.error, /made up|copy/i);

    const created = await post(base, "/api/equipment", equipmentBody({
      connectTarget: { address: "customer.example", ports: [{ number: 1 }] },
    }));
    assert.equal(created.status, 201);
    assert.equal(created.payload.equipment.connectTarget.address, "howen.ingest.fleetvu.invalid");
    assert.equal(created.payload.equipment.connectTarget.placeholder, true);
    assert.deepEqual(created.payload.equipment.connectTarget.ports.map((port) => port.number), [8900, 8901]);
  });
});

test("learning loop records a miss, then a connection, and ranks that place first", async () => {
  await withServer(async (base) => {
    const created = await post(base, "/api/equipment", equipmentBody());
    const id = created.payload.equipment.id;
    const missed = await post(base, `/api/equipment/${id}/check`, {});
    assert.equal(missed.status, 200);
    assert.equal(missed.payload.connected, false);
    assert.equal(missed.payload.location.failures, 1);
    assert.equal(missed.payload.location.successes, 0);

    const standIn = await post(base, `/api/equipment/${id}/stand-in`, {});
    assert.equal(standIn.status, 201);
    assert.equal(standIn.payload.registration.deviceId, "HWN-88421");

    const matched = await post(base, `/api/equipment/${id}/check`, {});
    assert.equal(matched.payload.connected, true);
    assert.equal(matched.payload.equipment.status, "connected");
    assert.equal(matched.payload.location.successes, 1);

    const state = await fetch(`${base}/api/state`).then((response) => response.json());
    assert.equal(state.learning.howen.locations[0].id, "guess-sticker");
    assert.equal(state.learning.howen.locations[0].badge, "Led to a connection");
    assert.equal(state.equipment[0].connectTarget.address, "howen.ingest.fleetvu.invalid");
  });
});

test("a later Stonkam customer sees a successful custom location first", async () => {
  await withServer(async (base) => {
    const created = await post(base, "/api/equipment", equipmentBody({
      manufacturer: "stonkam",
      deviceId: "SK-44091",
      locationId: "",
      customLocation: "Card inside the SIM door",
      assetName: "Van 4",
    }));
    const id = created.payload.equipment.id;
    await post(base, `/api/equipment/${id}/stand-in`, {});
    await post(base, `/api/equipment/${id}/check`, {});
    const state = await fetch(`${base}/api/state`).then((response) => response.json());
    assert.equal(state.learning.stonkam.locations[0].label, "Card inside the SIM door");
    assert.ok(state.learning.stonkam.locations[0].successes >= 1);
    assert.equal(state.learning.stonkam.locations[1].badge, "Best guess, not confirmed");
  });
});

test("support and issue triage name the manufacturer and the FleetVu address", async () => {
  await withServer(async (base) => {
    const support = await post(base, "/api/support", {
      message: "Where do I find the device ID?",
      context: { manufacturer: "howen", step: 1, screen: "wizard" },
    });
    assert.equal(support.status, 200);
    assert.doesNotMatch(support.payload.reply, /learning loop/i);
    assert.match(support.payload.reply, /terminal number/);
    assert.match(support.payload.reply, /Do not invent one/);

    const server = await post(base, "/api/support", {
      message: "Can I use my own server?",
      context: { manufacturer: "stonkam", step: 3 },
    });
    assert.match(server.payload.reply, /stonkam\.ingest\.fleetvu\.invalid/);
    assert.match(server.payload.reply, /do not host a server/i);

    const issue = await post(base, "/api/issues", {
      manufacturer: "howen",
      symptom: "never-online",
      description: "The Howen unit never showed up after I saved the server page.",
    });
    assert.equal(issue.status, 201);
    assert.equal(issue.payload.issue.triage.manufacturer, "Howen");
    assert.match(issue.payload.issue.triage.whatFailed, /Howen/);
    assert.match(issue.payload.issue.triage.nextStep, /howen\.ingest\.fleetvu\.invalid/);
    assert.ok(issue.payload.issue.triage.checks.length >= 3);
  });
});

test("a blank vehicle name, model, and SIM note still save the unit", async () => {
  await withServer(async (base) => {
    const created = await post(base, "/api/equipment", equipmentBody({
      assetName: "   ",
      model: "",
      simNote: "",
      channels: ["Rear", "Cargo", "Side door", ""],
    }));
    assert.equal(created.status, 201);
    assert.equal(created.payload.equipment.assetName, "HWN-88421");
    assert.equal(created.payload.equipment.model, "");
    assert.equal(created.payload.equipment.simNote, "");
    assert.deepEqual(
      created.payload.equipment.channels.map((channel) => channel.label),
      ["Rear", "Cargo", "Side door"],
    );
  });
});

test("a CSV file adds many units in one step", async () => {
  await withServer(async (base) => {
    const csv = [
      "manufacturer,model,device id,imei",
      "Howen,ME41,HWN-BULK-01,359876543210011",
      "Stonkam,SV-1,SK-BULK-02,359876543210022",
      "Acme Vision,X9,ACME-BULK-03,359876543210033",
      "Howen,ME41,test,359876543210044",
    ].join("\n");
    const created = await post(base, "/api/equipment/bulk", { csv });
    assert.equal(created.status, 201);
    assert.equal(created.payload.added, 3);
    assert.equal(created.payload.skipped, 1);
    const state = await fetch(`${base}/api/state`).then((response) => response.json());
    const byId = Object.fromEntries(state.equipment.map((item) => [item.deviceId, item]));
    assert.equal(byId["HWN-BULK-01"].manufacturer, "howen");
    assert.equal(byId["HWN-BULK-01"].model, "ME41");
    assert.equal(byId["HWN-BULK-01"].imei, "359876543210011");
    assert.equal(byId["SK-BULK-02"].manufacturer, "stonkam");
    assert.equal(byId["ACME-BULK-03"].manufacturer, "other");
    assert.equal(byId["ACME-BULK-03"].otherName, "Acme Vision");
    assert.equal(state.learning.howen.locations.some((location) => location.label === "Uploaded file"), false);
  });
});

test("a unit can store more cameras than road and driver", async () => {
  await withServer(async (base) => {
    const names = ["Road facing", "Driver facing", "Left", "Right", "Rear", "Cargo", "Side door", "Hopper", "Blind spot"];
    const created = await post(base, "/api/equipment", equipmentBody({ channels: names }));
    assert.equal(created.status, 201);
    assert.deepEqual(created.payload.equipment.channels.map((channel) => channel.label), names);
  });
});

test("the copy instructions name one start command, port 4173, and the files to copy", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /sh start\.sh/);
  assert.match(readme, /4173/);
  const files = [
    "package.json",
    "package-lock.json",
    "server.js",
    "start.sh",
    "lib/app.js",
    "lib/assistant.js",
    "lib/learning.js",
    "lib/store.js",
    "lib/targets.js",
    "lib/validate.js",
    "public/index.html",
    "public/app.js",
    "public/styles.css",
    "public/favicon.svg",
  ];
  for (const file of files) {
    assert.match(readme, new RegExp(file.replaceAll(".", "\\.").replaceAll("/", "\\/")));
    await readFile(new URL(`../${file}`, import.meta.url));
  }
});

test("each onboard step uses Next step and does not hard-code ingest ports", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(source, /Click here\. Next step\./);
  assert.match(source, /This unit is connected\. The next step is to add another unit\./);
  assert.doesNotMatch(source, /Learning loop|local ingest stand-in/);
  assert.doesNotMatch(source, /8900|9100|9200/);
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /FleetVu/);
});
