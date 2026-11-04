const appEl = document.querySelector("#app");

const state = {
  route: "tracking",
  selectedId: null,
  bundle: null,
  loadError: "",
  guide: freshGuide(),
  issue: freshIssue(),
  chat: [
    {
      role: "assistant",
      text: "Ask where to find a device ID, which FleetVu address to type on the unit, or what to do when a connection fails.",
    },
  ],
  chatBusy: false,
};

function freshGuide() {
  return {
    phase: "start",
    makerText: "",
    manufacturer: "",
    otherName: "",
    deviceId: "",
    locationText: "",
    locationId: "",
    customLocation: "",
    assetName: "",
    camerasText: "Road, Driver, Left, Right, Rear, Cargo",
    channels: [],
    equipmentId: null,
    busy: false,
    error: "",
  };
}

function freshIssue() {
  return {
    equipmentId: "",
    manufacturer: "howen",
    otherName: "",
    symptom: "never-online",
    description: "",
    error: "",
    busy: false,
  };
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "htmlFor") node.htmlFor = value;
    else if (key === "checked") node.checked = value === true || value === "checked";
    else if (key === "selected") node.selected = value === true || value === "selected";
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of [].concat(children || [])) append(node, child);
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  node.append(child.nodeType ? child : document.createTextNode(String(child)));
}

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "FleetVu could not complete that.");
  return body;
}

function bucketKey(manufacturer, otherName) {
  if (manufacturer !== "other") return manufacturer;
  const name = otherName.trim().toLowerCase().replace(/\s+/g, " ");
  return name ? `other:${name}` : "other";
}

function locationsFor(manufacturer, otherName) {
  const learning = state.bundle?.learning || {};
  const exact = learning[bucketKey(manufacturer, otherName)];
  if (exact) return exact.locations;
  return learning[manufacturer]?.locations || learning.other?.locations || [];
}

function targetFor(manufacturer) {
  const key = manufacturer === "howen" || manufacturer === "stonkam" ? manufacturer : "other";
  return state.bundle?.targets?.[key];
}

function selectedEquipment() {
  return (state.bundle?.equipment || []).find((item) => item.id === state.selectedId) || null;
}

function supportContext() {
  if (state.route === "add") {
    return {
      screen: "walkthrough",
      phase: state.guide.phase,
      manufacturer: state.guide.manufacturer,
      otherName: state.guide.otherName,
    };
  }
  const equipment = selectedEquipment();
  if (!equipment && state.route === "issues" && state.issue.manufacturer) {
    return { screen: "issues", manufacturer: state.issue.manufacturer, otherName: state.issue.otherName };
  }
  if (!equipment) return { screen: state.route };
  return {
    screen: state.route,
    manufacturer: equipment.manufacturer,
    otherName: equipment.otherName,
    equipment: {
      manufacturer: equipment.manufacturer,
      otherName: equipment.otherName,
      deviceId: equipment.deviceId,
    },
  };
}

function parseHash() {
  const parts = (location.hash.replace(/^#/, "") || "/tracking").split("/").filter(Boolean);
  if (parts[0] === "add") return { route: "add", selectedId: state.selectedId };
  if (parts[0] === "issues") return { route: "issues", selectedId: state.selectedId };
  if (parts[0] === "equipment" && parts[1]) return { route: "tracking", selectedId: decodeURIComponent(parts[1]) };
  return { route: "tracking", selectedId: null };
}

function render() {
  const activeId = document.activeElement?.id;
  const caret = document.activeElement?.selectionStart;
  appEl.replaceChildren(shell());
  if (!activeId) return;
  const next = document.getElementById(activeId);
  if (!next) return;
  next.focus();
  if (typeof caret === "number" && next.setSelectionRange) {
    try { next.setSelectionRange(caret, caret); } catch { /* buttons and readonly fields */ }
  }
}

function hideSidePanel() {
  if (state.route === "add") return true;
  const selected = selectedEquipment();
  return state.route === "tracking" && selected?.status === "connected";
}

function shell() {
  const panels = [el("main", {}, [state.loadError ? el("p", { class: "error" }, state.loadError) : viewMain()])];
  if (!hideSidePanel()) panels.push(aiPanel());
  return el("div", {}, [
    header(),
    el("div", { class: state.route === "add" ? "layout layout-guide" : hideSidePanel() ? "layout layout-wide" : "layout" }, panels),
  ]);
}

function header() {
  const link = (hash, label) => {
    const current = (hash === "#/add" && state.route === "add") || (hash === "#/issues" && state.route === "issues") || (hash === "#/tracking" && state.route === "tracking");
    return el("a", { href: hash, ...(current ? { "aria-current": "page" } : {}) }, label);
  };
  return el("header", { class: "app-header" }, [
    el("div", { class: "brand" }, [
      el("img", { src: "/favicon.svg", width: "36", height: "36", alt: "" }),
      el("div", {}, [el("strong", {}, "FleetVu"), el("span", {}, "Add video equipment and connect it")]),
    ]),
    el("nav", { class: "nav", "aria-label": "Primary" }, [
      link("#/tracking", "Tracking"),
      link("#/add", "Add equipment"),
      link("#/issues", "Issues"),
    ]),
  ]);
}

function viewMain() {
  if (!state.bundle) return el("section", { class: "panel" }, "Loading FleetVu…");
  if (state.route === "add") return guideView();
  if (state.route === "issues") return issuesView();
  return trackingView();
}

function trackingView() {
  const equipment = state.bundle.equipment;
  const connected = equipment.filter((item) => item.status === "connected");
  const waiting = equipment.filter((item) => item.status !== "connected");
  const selected = selectedEquipment();
  const onConnectedUnit = selected?.status === "connected";
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h1", {}, "Tracking"),
        el("p", { class: "lede" }, onConnectedUnit
          ? "This unit is connected."
          : "Units that have registered with FleetVu show up here. The device ID is how a registration is matched."),
      ]),
      onConnectedUnit ? null : el("a", { class: "primary", href: "#/add" }, "Add equipment"),
    ]),
    equipment.length === 0
      ? el("div", { class: "callout" }, "Nothing is connected yet. Add a unit and I will walk you through it.")
      : el("div", { class: "stack" }, [
          unitGroup("Connected", connected, "No unit has connected yet."),
          unitGroup("Not connected yet", waiting, "No units are waiting."),
        ]),
    selected ? unitDetail(selected) : null,
  ]);
}

function unitGroup(title, items, empty) {
  return el("div", {}, [
    el("div", { class: "section-label" }, title),
    items.length === 0
      ? el("p", { class: "muted" }, empty)
      : el("div", { class: "cards" }, items.map(unitCard)),
  ]);
}

function unitCard(item) {
  return el("button", {
    class: "unit",
    type: "button",
    "data-action": "select-unit",
    "data-id": item.id,
    ...(item.id === state.selectedId ? { "aria-current": "true" } : {}),
  }, [
    el("strong", {}, item.assetName),
    el("span", { class: "muted" }, `${item.manufacturerLabel} · device ID ${item.deviceId}`),
    el("span", { class: statusClass(item.status) }, statusLabel(item.status)),
  ]);
}

function statusLabel(status) {
  if (status === "connected") return "Connected";
  if (status === "not_connected") return "Not connected yet";
  return "Waiting to connect";
}

function statusClass(status) {
  if (status === "connected") return "badge good";
  if (status === "not_connected") return "badge bad";
  return "badge";
}

function unitDetail(item) {
  const connected = item.status === "connected";
  const cameras = item.channels.map((channel) => channel.label).join(", ");
  return el("article", { class: "card stack", style: "margin-top:14px;padding:14px" }, [
    connected
      ? el("div", { class: "stack" }, [
          el("p", { class: "ai-line" }, "This unit is connected. Click here to add another unit."),
          el("a", { class: "primary pulse", href: "#/add" }, "Click here"),
        ])
      : null,
    el("h2", {}, item.assetName),
    el("p", {}, item.manufacturerLabel),
    el("p", {}, `Device ID ${item.deviceId}.`),
    el("p", {}, `Cameras: ${cameras}.`),
    el("div", { class: "row" }, [
      el("span", { class: statusClass(item.status) }, statusLabel(item.status)),
    ]),
    connected
      ? null
      : el("div", { class: "row" }, [
          el("a", { class: "secondary", href: "#/issues", "data-action": "report-unit", "data-id": item.id }, "Report a problem"),
        ]),
  ]);
}

function guideView() {
  const guide = state.guide;
  const field = guideField();
  return el("section", { class: "panel stack" }, [
    el("form", { id: "guide-form", class: "stack" }, [
      el("p", { class: "ai-line" }, guideSentence()),
      field,
      guide.error ? el("p", { class: "error", role: "alert" }, guide.error) : null,
      el("button", {
        class: "primary pulse",
        type: "submit",
        ...(guide.busy ? { disabled: "true" } : {}),
      }, "Click here"),
    ]),
  ]);
}

function guideSentence() {
  const guide = state.guide;
  const maker = displayLabel(guide.manufacturer, guide.otherName);
  if (guide.phase === "start") return "Click here to name the company that made this camera unit.";
  if (guide.phase === "maker") return "Type Howen, Stonkam, or the company name printed on the unit, then click here.";
  if (guide.phase === "device-id") return idSentence();
  if (guide.phase === "found") return `Type where you found that ID, such as the sticker or the device menu, then click here. I will remember it for the next ${maker} unit.`;
  if (guide.phase === "vehicle") return "Type what you call this vehicle, or leave it blank, then click here. A blank name uses the device ID.";
  if (guide.phase === "cameras") return "Type every camera, separated by commas. Road, Driver, Left, Right, Rear, Cargo, or any other name. Then click here.";
  if (guide.phase === "server") return serverSentence();
  if (guide.phase === "check") return `Click here and I will look for device ID ${guide.deviceId}.`;
  return `This computer is not the live FleetVu server, so a unit in a truck cannot reach it. Click here to record a practice connection for ${guide.deviceId} and check again. I will not invent an ID.`;
}

function idSentence() {
  const guide = state.guide;
  const maker = displayLabel(guide.manufacturer, guide.otherName);
  const locations = locationsFor(guide.manufacturer, guide.otherName);
  const worked = locations.find((location) => location.successes > 0);
  const lead = worked
    ? `On a ${maker} unit, start at ${worked.label}. A unit already connected when the ID was found there.`
    : `On a ${maker} unit, look at the sticker and in the device menu.`;
  const detail = String(locations[0]?.detail || "").replace(/^Best guess, not a confirmed location\.\s*/i, "");
  return `${lead} ${detail} Paste that ID, then click here. Do not invent one.`;
}

function serverSentence() {
  const target = targetFor(state.guide.manufacturer);
  if (!target) return "Click here to go back and name the company. I need that before I can show the address.";
  const ports = target.ports.map((port) => `${port.number} in the ${port.deviceField}`).join(", then ");
  const steps = target.menuSteps.map((step, index) => `${index + 1}. ${step}`).join(" ");
  return `On the unit, open the server page. Type ${target.address}. Then type ${ports}. This server belongs to FleetVu. Do not type a server of your own. ${steps} When those values are saved on the unit, click here.`;
}

function guideField() {
  const guide = state.guide;
  const specs = {
    maker: ["guide-maker", guide.makerText, "makerText", "Howen, Stonkam, or the name on the unit"],
    "device-id": ["device-id", guide.deviceId, "deviceId", "Paste the ID from the unit"],
    found: ["guide-found", guide.locationText, "locationText", "Sticker or device menu"],
    vehicle: ["asset-name", guide.assetName, "assetName", "Leave blank to use the device ID"],
    cameras: ["guide-cameras", guide.camerasText, "camerasText", "Road, Driver, Left, Right, Rear, Cargo"],
  }[guide.phase];
  if (!specs) return null;
  const [id, value, bind, placeholder] = specs;
  return el("input", { id, type: "text", value, "data-bind": bind, placeholder, "aria-label": placeholder });
}

function plainDetailLocation(text) {
  const guide = state.guide;
  const needle = text.trim().toLowerCase();
  const locations = locationsFor(guide.manufacturer, guide.otherName);
  return locations.find((location) => location.label.toLowerCase() === needle)
    || locations.find((location) => needle.includes("sticker") && /sticker|label|nameplate/i.test(location.label))
    || locations.find((location) => needle.includes("menu") && /menu/i.test(location.label))
    || null;
}

async function guideNext() {
  const guide = state.guide;
  if (guide.busy) return;
  guide.error = "";
  if (guide.phase === "start") {
    guide.phase = "maker";
    render();
    return;
  }
  if (guide.phase === "maker") {
    const parsed = parseMaker(readInput("guide-maker"));
    if (parsed.error) {
      guide.error = parsed.error;
      render();
      return;
    }
    guide.manufacturer = parsed.manufacturer;
    guide.otherName = parsed.otherName;
    guide.makerText = parsed.label;
    guide.phase = "device-id";
    render();
    return;
  }
  if (guide.phase === "device-id") {
    guide.deviceId = readInput("device-id");
    guide.busy = true;
    render();
    try {
      const result = await api("/api/device-id/check-format", {
        method: "POST",
        body: JSON.stringify({ deviceId: guide.deviceId }),
      });
      guide.deviceId = result.deviceId;
      guide.phase = "found";
    } catch (error) {
      guide.error = error.message;
    } finally {
      guide.busy = false;
      render();
    }
    return;
  }
  if (guide.phase === "found") {
    const text = readInput("guide-found").trim();
    if (text.length < 3) {
      guide.error = "Type where you found the ID, then click here.";
      render();
      return;
    }
    const known = plainDetailLocation(text);
    guide.locationText = text;
    guide.locationId = known ? known.id : "";
    guide.customLocation = known ? "" : text;
    guide.phase = "vehicle";
    render();
    return;
  }
  if (guide.phase === "vehicle") {
    guide.assetName = readInput("asset-name").trim();
    guide.phase = "cameras";
    render();
    return;
  }
  if (guide.phase === "cameras") {
    const names = readInput("guide-cameras").split(",").map((name) => name.trim()).filter(Boolean);
    if (names.length === 0) {
      guide.error = "Type at least one camera, then click here.";
      render();
      return;
    }
    guide.camerasText = names.join(", ");
    guide.channels = names;
    guide.phase = "server";
    render();
    return;
  }
  if (guide.phase === "server") {
    await saveEquipment();
    return;
  }
  if (guide.phase === "check") {
    await checkConnection();
    return;
  }
  await practiceConnection();
}

function parseMaker(raw) {
  const value = String(raw || "").trim();
  const lower = value.toLowerCase();
  if (!value) return { error: "Type Howen, Stonkam, or the company name, then click here." };
  if (lower === "howen") return { manufacturer: "howen", otherName: "", label: "Howen" };
  if (lower === "stonkam") return { manufacturer: "stonkam", otherName: "", label: "Stonkam" };
  if (value.length < 2) return { error: "Type the full company name, then click here." };
  return { manufacturer: "other", otherName: value, label: value };
}

async function saveEquipment() {
  const guide = state.guide;
  guide.busy = true;
  render();
  try {
    const result = await api("/api/equipment", {
      method: "POST",
      body: JSON.stringify({
        manufacturer: guide.manufacturer,
        otherName: guide.otherName,
        deviceId: guide.deviceId,
        locationId: guide.locationId,
        customLocation: guide.customLocation,
        assetName: guide.assetName,
        channels: guide.channels,
      }),
    });
    guide.equipmentId = result.equipment.id;
    guide.deviceId = result.equipment.deviceId;
    guide.phase = "check";
    await reload();
  } catch (error) {
    guide.error = error.message;
  } finally {
    guide.busy = false;
    render();
  }
}

async function checkConnection() {
  const guide = state.guide;
  guide.busy = true;
  render();
  try {
    const result = await api(`/api/equipment/${guide.equipmentId}/check`, { method: "POST", body: "{}" });
    await reload();
    if (result.connected) {
      location.hash = `#/equipment/${encodeURIComponent(guide.equipmentId)}`;
      guide.phase = "start";
      return;
    }
    guide.phase = "miss";
  } catch (error) {
    guide.error = error.message;
  } finally {
    guide.busy = false;
    render();
  }
}

async function practiceConnection() {
  const guide = state.guide;
  guide.busy = true;
  render();
  try {
    await api(`/api/equipment/${guide.equipmentId}/stand-in`, { method: "POST", body: "{}" });
    const result = await api(`/api/equipment/${guide.equipmentId}/check`, { method: "POST", body: "{}" });
    await reload();
    if (result.connected) {
      location.hash = `#/equipment/${encodeURIComponent(guide.equipmentId)}`;
      return;
    }
    guide.error = "Still not connected. Check the ID on the unit, then click here again.";
  } catch (error) {
    guide.error = error.message;
  } finally {
    guide.busy = false;
    render();
  }
}

function issuesView() {
  const issue = state.issue;
  const equipment = state.bundle.equipment;
  return el("section", { class: "panel stack" }, [
    el("div", {}, [
      el("h1", {}, "Issues"),
      el("p", { class: "lede" }, "Describe a connection or device problem. FleetVu says what failed, which company made the unit, and what to do next."),
    ]),
    issue.error ? el("p", { class: "error", role: "alert" }, issue.error) : null,
    el("label", { class: "field" }, [
      "Unit",
      el("select", { id: "issue-equipment", "data-bind": "issueEquipment" }, [
        el("option", { value: "", ...(!issue.equipmentId ? { selected: "selected" } : {}) }, "Not tied to a saved unit"),
        ...equipment.map((item) => el("option", {
          value: item.id,
          ...(issue.equipmentId === item.id ? { selected: "selected" } : {}),
        }, `${item.assetName} · ${item.manufacturerLabel} · ${item.deviceId}`)),
      ]),
    ]),
    issue.equipmentId ? null : el("label", { class: "field" }, [
      "Manufacturer",
      el("select", { id: "issue-manufacturer", "data-bind": "issueManufacturer" }, [
        option("howen", "Howen", issue.manufacturer),
        option("stonkam", "Stonkam", issue.manufacturer),
        option("other", "Another manufacturer", issue.manufacturer),
      ]),
    ]),
    !issue.equipmentId && issue.manufacturer === "other"
      ? field("Manufacturer name", "issue-other", issue.otherName, "issueOtherName", "Name printed on the unit")
      : null,
    el("label", { class: "field" }, [
      "What went wrong",
      el("select", { id: "issue-symptom", "data-bind": "issueSymptom" }, [
        option("never-online", "It never came online", issue.symptom),
        option("id-mismatch", "The device ID does not match", issue.symptom),
        option("cameras-blank", "A camera is blank", issue.symptom),
        option("drops-offline", "It connected, then dropped", issue.symptom),
        option("wrong-server", "The server settings look wrong", issue.symptom),
        option("other", "Something else", issue.symptom),
      ]),
    ]),
    el("label", { class: "field" }, [
      "What happened",
      el("textarea", { id: "issue-description", "data-bind": "issueDescription" }, issue.description),
    ]),
    el("button", { type: "button", class: "primary", "data-action": "submit-issue", ...(issue.busy ? { disabled: "true" } : {}) }, "Triage this issue"),
    el("div", { class: "stack" }, state.bundle.issues.map(issueCard)),
  ]);
}

function option(value, label, current) {
  return el("option", { value, ...(value === current ? { selected: "selected" } : {}) }, label);
}

function issueCard(issue) {
  const triage = issue.triage;
  return el("article", { class: "card stack", style: "padding:14px" }, [
    el("h2", {}, issue.assetName || displayLabel(issue.manufacturer, issue.otherName)),
    el("p", { class: "muted" }, new Date(issue.createdAt).toLocaleString()),
    el("div", { class: "triage" }, [
      el("div", {}, [el("div", { class: "section-label" }, "What failed"), el("p", {}, triage.whatFailed)]),
      el("div", {}, [el("div", { class: "section-label" }, "Manufacturer"), el("p", {}, triage.manufacturer)]),
      el("div", {}, [el("div", { class: "section-label" }, "Suggested next step"), el("p", {}, triage.nextStep)]),
    ]),
  ]);
}

function displayLabel(manufacturer, otherName) {
  if (manufacturer === "howen") return "Howen";
  if (manufacturer === "stonkam") return "Stonkam";
  return otherName || "Other manufacturer";
}

function aiPanel() {
  return el("aside", { class: "ai-panel", "aria-label": "AI Support" }, [
    el("div", {}, [
      el("h2", {}, "AI Support"),
      el("p", { class: "hint" }, "Ask while you add a unit, or after it is connected."),
    ]),
    el("div", { class: "chat", id: "chat-log" }, state.chat.map((message) => el("div", { class: `bubble ${message.role === "user" ? "user" : "assistant"}` }, message.text))),
    el("form", { class: "ai-form", id: "ai-form" }, [
      el("input", { id: "ai-input", type: "text", name: "question", placeholder: "Ask a question", "aria-label": "Question for AI Support" }),
      el("button", { class: "primary", type: "submit", ...(state.chatBusy ? { disabled: "true" } : {}) }, "Ask"),
    ]),
  ]);
}

function field(label, id, value, bind, hint) {
  return el("label", { class: "field", htmlFor: id }, [
    label,
    hint ? el("span", { class: "hint" }, hint) : null,
    el("input", { id, type: "text", value, "data-bind": bind }),
  ]);
}

async function reload() {
  state.bundle = await api("/api/state");
}

function readInput(id) {
  const node = document.getElementById(id);
  return node ? node.value : "";
}

async function ask(text) {
  const question = text.trim();
  if (!question) return;
  state.chat.push({ role: "user", text: question });
  state.chatBusy = true;
  render();
  try {
    const result = await api("/api/support", {
      method: "POST",
      body: JSON.stringify({ message: question, context: supportContext() }),
    });
    state.chat.push({ role: "assistant", text: result.reply });
  } catch (error) {
    state.chat.push({ role: "assistant", text: error.message });
  } finally {
    state.chatBusy = false;
    render();
  }
}

async function submitIssue() {
  const issue = state.issue;
  issue.busy = true;
  issue.error = "";
  render();
  try {
    await api("/api/issues", {
      method: "POST",
      body: JSON.stringify({
        equipmentId: issue.equipmentId || undefined,
        manufacturer: issue.manufacturer,
        otherName: issue.otherName,
        symptom: issue.symptom,
        description: issue.description,
      }),
    });
    issue.description = "";
    await reload();
  } catch (error) {
    issue.error = error.message;
  } finally {
    issue.busy = false;
    render();
  }
}

function onInput(event) {
  const node = event.target;
  const bind = node.dataset.bind;
  if (!bind) return;
  if (bind === "issueDescription") state.issue.description = node.value;
  else if (bind === "issueOtherName") state.issue.otherName = node.value;
  else if (state.guide && Object.prototype.hasOwnProperty.call(state.guide, bind)) state.guide[bind] = node.value;
}

function onChange(event) {
  const node = event.target;
  const bind = node.dataset.bind;
  if (bind === "issueEquipment") {
    state.issue.equipmentId = node.value;
    const equipment = state.bundle.equipment.find((item) => item.id === node.value);
    if (equipment) {
      state.issue.manufacturer = equipment.manufacturer;
      state.issue.otherName = equipment.otherName;
    }
    render();
    return;
  }
  if (bind === "issueManufacturer") {
    state.issue.manufacturer = node.value;
    render();
    return;
  }
  if (bind === "issueSymptom") state.issue.symptom = node.value;
}

async function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "submit-issue") return submitIssue();
  if (action === "select-unit") {
    location.hash = `#/equipment/${encodeURIComponent(button.dataset.id)}`;
    return;
  }
  if (action === "report-unit") {
    const equipment = state.bundle.equipment.find((item) => item.id === button.dataset.id);
    if (equipment) {
      state.issue.equipmentId = equipment.id;
      state.issue.manufacturer = equipment.manufacturer;
      state.issue.otherName = equipment.otherName;
      state.issue.symptom = equipment.status === "connected" ? "cameras-blank" : "never-online";
    }
  }
}

appEl.addEventListener("input", onInput);
appEl.addEventListener("change", onChange);
appEl.addEventListener("click", (event) => { onClick(event); });
appEl.addEventListener("submit", (event) => {
  if (event.target.id === "guide-form") {
    event.preventDefault();
    guideNext();
    return;
  }
  if (event.target.id !== "ai-form") return;
  event.preventDefault();
  const input = document.querySelector("#ai-input");
  const text = input.value;
  input.value = "";
  ask(text);
});

window.addEventListener("hashchange", () => {
  const next = parseHash();
  state.route = next.route;
  state.selectedId = next.selectedId;
  render();
});

reload()
  .then(() => {
    const next = parseHash();
    state.route = next.route;
    state.selectedId = next.selectedId;
  })
  .catch((error) => {
    state.loadError = error.message;
  })
  .finally(render);
