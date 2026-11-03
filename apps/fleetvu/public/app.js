const appEl = document.querySelector("#app");
const STEP_LABELS = ["Manufacturer", "Device ID", "The unit", "Point it at FleetVu", "Verify"];

const state = {
  route: "tracking",
  selectedId: null,
  bundle: null,
  loadError: "",
  wizard: freshWizard(),
  issue: freshIssue(),
  chat: [
    {
      role: "assistant",
      text: "Ask how to find a device ID, which FleetVu address to type on the unit, or what to do when a connection fails.",
    },
  ],
  chatBusy: false,
};

function freshWizard() {
  return {
    step: 0,
    manufacturer: "howen",
    otherName: "",
    deviceId: "",
    locationChoice: "",
    customLocation: "",
    assetName: "",
    model: "",
    channels: ["Road facing", "Driver facing"],
    otherCamera: "",
    simNote: "",
    programmed: false,
    equipmentId: null,
    checkMessage: "",
    checkOk: null,
    busy: false,
    formError: "",
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
      screen: "wizard",
      step: state.wizard.step,
      manufacturer: state.wizard.manufacturer,
      otherName: state.wizard.otherName,
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

function suggestions() {
  if (state.route === "add" && state.wizard.step === 1) {
    return ["Where do I find the device ID?", "What does the learning loop store?"];
  }
  if (state.route === "add" && state.wizard.step >= 3) {
    return ["Which server address do I type?", "Can I use my own server?"];
  }
  if (state.route === "issues") return ["The unit will not connect", "Where do I find the device ID?"];
  return ["Where do I find the device ID?", "Which server address do I type?"];
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
    try { next.setSelectionRange(caret, caret); } catch { /* number inputs and buttons */ }
  }
}

function shell() {
  return el("div", {}, [
    header(),
    el("div", { class: "layout" }, [
      el("main", {}, [state.loadError ? el("p", { class: "error" }, state.loadError) : viewMain()]),
      aiPanel(),
    ]),
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
  if (state.route === "add") return wizardView();
  if (state.route === "issues") return issuesView();
  return trackingView();
}

function trackingView() {
  const equipment = state.bundle.equipment;
  const connected = equipment.filter((item) => item.status === "connected");
  const waiting = equipment.filter((item) => item.status !== "connected");
  const selected = selectedEquipment();
  return el("section", { class: "panel" }, [
    el("div", { class: "panel-head" }, [
      el("div", {}, [
        el("h1", {}, "Tracking"),
        el("p", { class: "lede" }, "Units that have registered with FleetVu show up here. The device ID is how a registration is matched."),
      ]),
      el("a", { class: "primary", href: "#/add" }, "Add equipment"),
    ]),
    equipment.length === 0
      ? el("div", { class: "callout" }, "Nothing is connected yet. Add a Howen, Stonkam, or other unit and point it at the address FleetVu gives you.")
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
  if (status === "not_connected") return "Check did not match";
  return "Waiting for a registration";
}

function statusClass(status) {
  if (status === "connected") return "badge good";
  if (status === "not_connected") return "badge bad";
  return "badge";
}

function unitDetail(item) {
  const ports = item.connectTarget.ports.map((port) => `${port.label} ${port.number}`).join(", ");
  return el("article", { class: "card stack", style: "margin-top:14px;padding:14px" }, [
    el("h2", {}, item.assetName),
    el("p", {}, `${item.manufacturerLabel}${item.model ? ` · ${item.model}` : ""}`),
    el("p", {}, `Device ID ${item.deviceId}. Found at: ${item.locationLabel}.`),
    el("p", { class: "muted" }, `FleetVu address ${item.connectTarget.address}. ${ports}.`),
    el("p", { class: "hint" }, item.connectTarget.notice),
    el("div", { class: "row" }, [
      el("span", { class: statusClass(item.status) }, statusLabel(item.status)),
      ...item.channels.map((channel) => el("span", { class: "badge" }, channel.label)),
    ]),
    el("div", { class: "row" }, [
      el("a", { class: "secondary", href: "#/issues", "data-action": "report-unit", "data-id": item.id }, "Report a problem"),
    ]),
  ]);
}

function wizardView() {
  const wizard = state.wizard;
  return el("section", { class: "panel stack" }, [
    el("div", {}, [
      el("h1", {}, "Add equipment"),
      el("p", { class: "lede" }, "FleetVu gives you the server address and ports. You copy the device ID from the unit."),
    ]),
    el("div", { class: "steps", "aria-label": "Wizard steps" }, STEP_LABELS.map((label, index) => {
      const mode = index === wizard.step ? "now" : index < wizard.step ? "done" : "todo";
      return el("span", { "data-state": mode }, label);
    })),
    wizard.formError ? el("p", { class: "error", role: "alert" }, wizard.formError) : null,
    wizard.step === 0 ? stepManufacturer() : null,
    wizard.step === 1 ? stepDeviceId() : null,
    wizard.step === 2 ? stepUnit() : null,
    wizard.step === 3 ? stepServer() : null,
    wizard.step === 4 ? stepVerify() : null,
    el("div", { class: "actions" }, [
      wizard.step > 0
        ? el("button", { type: "button", class: "secondary", "data-action": "wizard-back" }, "Back")
        : el("span", {}),
      wizard.step < 4
        ? el("button", { type: "button", class: "primary", "data-action": "wizard-next", ...(wizard.busy ? { disabled: "true" } : {}) }, wizard.step === 3 ? "Save and verify" : "Continue")
        : el("button", { type: "button", class: "secondary", "data-action": "wizard-reset" }, "Add another unit"),
    ]),
  ]);
}

function stepManufacturer() {
  const wizard = state.wizard;
  return el("fieldset", { class: "stack" }, [
    el("legend", {}, "Which manufacturer made this unit?"),
    manufacturerChoice("howen", "Howen", "Mobile DVR and camera recorders."),
    manufacturerChoice("stonkam", "Stonkam", "Mobile DVR and camera recorders."),
    manufacturerChoice("other", "Another manufacturer", "Any other video unit that can register to a server."),
    wizard.manufacturer === "other"
      ? field("Manufacturer name", "other-name", wizard.otherName, "otherName", "As printed on the unit")
      : null,
  ]);
}

function manufacturerChoice(value, title, detail) {
  return el("label", { class: "choice" }, [
    el("input", {
      type: "radio",
      name: "manufacturer",
      value,
      "data-bind": "manufacturer",
      ...(state.wizard.manufacturer === value ? { checked: "checked" } : {}),
    }),
    el("span", {}, [el("strong", {}, title), el("small", {}, detail)]),
  ]);
}

function stepDeviceId() {
  const wizard = state.wizard;
  const locations = locationsFor(wizard.manufacturer, wizard.otherName);
  const anySuccess = locations.some((location) => location.successes > 0);
  return el("div", { class: "stack" }, [
    el("div", { class: "callout" }, [
      el("strong", {}, "Learning loop"),
      el("p", {}, "FleetVu remembers, for this manufacturer, where a device ID was found and whether that ID then connected. Places that already led to a connection are listed first. This is stored memory in FleetVu, not a separate learning service."),
      el("p", {}, anySuccess
        ? "Start with a location that already connected. If you found the ID somewhere else, say so."
        : "No connection has confirmed a place yet. The best guess is the sticker and the device menu. Tell FleetVu where you actually found this ID."),
    ]),
    el("div", { class: "choices", role: "radiogroup", "aria-label": "Where did you find the device ID?" }, [
      ...locations.map((location) => locationChoice(location)),
      el("label", { class: "choice" }, [
        el("input", {
          type: "radio",
          name: "location",
          value: "new",
          "data-bind": "locationChoice",
          ...(wizard.locationChoice === "new" ? { checked: "checked" } : {}),
        }),
        el("span", {}, [el("strong", {}, "A different place"), el("small", {}, "Describe where you actually found the ID.")]),
      ]),
    ]),
    wizard.locationChoice === "new"
      ? field("Where did you find it?", "custom-location", wizard.customLocation, "customLocation", "For example, a card inside the SIM slot")
      : null,
    field("Device ID from the unit", "device-id", wizard.deviceId, "deviceId", "Paste the ID. Do not invent one."),
    el("p", { class: "hint" }, "FleetVu matches the unit to this ID when it connects."),
  ]);
}

function locationChoice(location) {
  const badgeClass = location.successes > 0 ? "badge good" : location.failures > 0 ? "badge bad" : "badge";
  const tally = `${location.successes} connected · ${location.failures} missed`;
  return el("label", { class: "choice" }, [
    el("input", {
      type: "radio",
      name: "location",
      value: location.id,
      "data-bind": "locationChoice",
      ...(state.wizard.locationChoice === location.id ? { checked: "checked" } : {}),
    }),
    el("span", {}, [
      el("strong", {}, location.label),
      el("span", { class: badgeClass }, ` ${location.badge}`),
      el("small", {}, `${location.detail} ${tally}.`),
    ]),
  ]);
}

function stepUnit() {
  const wizard = state.wizard;
  return el("div", { class: "stack" }, [
    field("Vehicle or asset name", "asset-name", wizard.assetName, "assetName", "The name you use for this vehicle"),
    field("Model", "model", wizard.model, "model", "Optional. Whatever is printed on the unit."),
    el("div", { class: "stack" }, [
      el("span", { class: "section-label" }, "Cameras"),
      el("p", { class: "hint" }, "Road and driver are only a start. Add every camera on the unit."),
      el("div", { class: "camera-picks" }, ["Left", "Right", "Rear", "Cargo"].map((name) =>
        el("button", { type: "button", class: "secondary", "data-action": "add-quick-camera", "data-name": name }, name),
      )),
      el("div", { class: "row" }, [
        el("input", {
          id: "other-camera",
          type: "text",
          value: wizard.otherCamera,
          "data-bind": "otherCamera",
          placeholder: "Any other camera name",
          "aria-label": "Any other camera name",
        }),
        el("button", { type: "button", class: "secondary", "data-action": "add-other-camera" }, "Add this name"),
      ]),
      ...wizard.channels.map((channel, index) => el("div", { class: "row" }, [
        el("input", { id: `channel-${index}`, type: "text", value: channel, "data-channel": String(index), "aria-label": `Channel ${index + 1}` }),
        el("button", { type: "button", class: "secondary", "data-action": "remove-channel", "data-index": String(index) }, "Remove"),
      ])),
      el("button", { type: "button", class: "secondary", "data-action": "add-channel" }, "Add channel"),
    ]),
    field("SIM note", "sim-note", wizard.simNote, "simNote", "Optional. Last four digits, or the carrier name."),
  ]);
}

function stepServer() {
  const target = targetFor(state.wizard.manufacturer);
  if (!target) return el("p", { class: "error" }, "FleetVu has no connection target for that manufacturer.");
  return el("div", { class: "stack" }, [
    el("div", { class: "callout" }, target.notice),
    el("p", {}, "Type these FleetVu values on the device. They are not editable here because you do not choose the server."),
    readonlyField("FleetVu server address", "server-address", target.address),
    el("div", { class: "ports" }, target.ports.map((port) => readonlyField(`${port.label} · ${port.deviceField}`, `port-${port.id}`, String(port.number)))),
    el("div", {}, [
      el("div", { class: "section-label" }, "On the device"),
      el("ol", { class: "steps-list" }, target.menuSteps.map((step) => el("li", {}, step))),
    ]),
    el("label", { class: "check" }, [
      el("input", {
        type: "checkbox",
        id: "programmed",
        "data-bind": "programmed",
        ...(state.wizard.programmed ? { checked: "checked" } : {}),
      }),
      el("span", {}, "I entered this FleetVu address and these ports on the device and saved them."),
    ]),
  ]);
}

function stepVerify() {
  const wizard = state.wizard;
  const equipment = state.bundle.equipment.find((item) => item.id === wizard.equipmentId);
  const heard = state.bundle.registrations.filter((entry) => entry.deviceId === wizard.deviceId && entry.manufacturer === wizard.manufacturer).length;
  return el("div", { class: "stack" }, [
    el("h2", {}, "Verify the connection"),
    el("p", {}, `FleetVu will look for a registration from device ID ${wizard.deviceId}. The result is stored on “${equipment?.locationLabel || "the place you named"}” for later ${equipment?.manufacturerLabel || "manufacturer"} customers.`),
    el("p", { class: "muted" }, `Registrations heard for this device ID: ${heard}.`),
    wizard.checkMessage
      ? el("div", { class: wizard.checkOk ? "callout good" : "callout bad", role: "status" }, wizard.checkMessage)
      : null,
    el("div", { class: "row" }, [
      el("button", { type: "button", class: "primary", "data-action": "check", ...(wizard.busy ? { disabled: "true" } : {}) }, "Check connection"),
    ]),
    el("div", { class: "callout" }, [
      el("strong", {}, "Local ingest stand-in"),
      el("p", {}, "The address above is a placeholder, so a unit in a truck cannot reach this computer. This posts the device ID you already entered to FleetVu's local ingest, the way the unit would register. It does not invent an ID, and it does not make you host a server."),
      el("button", { type: "button", class: "secondary", "data-action": "stand-in", ...(wizard.busy ? { disabled: "true" } : {}) }, "Post this device ID to the local FleetVu ingest"),
    ]),
    wizard.checkOk ? el("a", { class: "primary", href: `#/equipment/${encodeURIComponent(wizard.equipmentId)}` }, "Show it on Tracking") : null,
  ]);
}

function issuesView() {
  const issue = state.issue;
  const equipment = state.bundle.equipment;
  return el("section", { class: "panel stack" }, [
    el("div", {}, [
      el("h1", {}, "Issues"),
      el("p", { class: "lede" }, "Describe a connection or device problem. FleetVu triages what failed, which manufacturer it is, and what to do next."),
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
    el("div", { class: "suggest" }, suggestions().map((prompt) => el("button", { type: "button", "data-action": "ask", "data-prompt": prompt, ...(state.chatBusy ? { disabled: "true" } : {}) }, prompt))),
    el("form", { class: "ai-form", id: "ai-form" }, [
      el("input", { id: "ai-input", type: "text", name: "question", placeholder: "Ask about this step", "aria-label": "Question for AI Support" }),
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

function readonlyField(label, id, value) {
  return el("label", { class: "field", htmlFor: id }, [
    label,
    el("span", { class: "readonly" }, [
      el("input", { id, type: "text", value, readonly: "readonly" }),
      el("button", { type: "button", class: "secondary", "data-action": "copy", "data-copy": value }, "Copy"),
    ]),
  ]);
}

async function reload() {
  state.bundle = await api("/api/state");
}

async function wizardNext() {
  const wizard = state.wizard;
  wizard.formError = "";
  if (wizard.step === 0) {
    if (wizard.manufacturer === "other" && wizard.otherName.trim().length < 2) {
      wizard.formError = "Enter the manufacturer's name.";
      render();
      return;
    }
    wizard.step = 1;
    render();
    return;
  }
  if (wizard.step === 1) {
    if (!wizard.locationChoice) {
      wizard.formError = "Choose where you found the device ID, or describe the place.";
      render();
      return;
    }
    if (wizard.locationChoice === "new" && wizard.customLocation.trim().length < 3) {
      wizard.formError = "Describe the place you found the device ID.";
      render();
      return;
    }
    wizard.busy = true;
    render();
    try {
      const result = await api("/api/device-id/check-format", {
        method: "POST",
        body: JSON.stringify({ deviceId: wizard.deviceId }),
      });
      wizard.deviceId = result.deviceId;
      wizard.step = 2;
    } catch (error) {
      wizard.formError = error.message;
    } finally {
      wizard.busy = false;
      render();
    }
    return;
  }
  if (wizard.step === 2) {
    if (wizard.assetName.trim().length < 2) {
      wizard.formError = "Name the vehicle or asset.";
      render();
      return;
    }
    if (!wizard.channels.some((channel) => channel.trim())) {
      wizard.formError = "Name at least one camera channel.";
      render();
      return;
    }
    wizard.step = 3;
    render();
    return;
  }
  if (wizard.step === 3) {
    if (!wizard.programmed) {
      wizard.formError = "Confirm that you entered FleetVu's address and ports on the device.";
      render();
      return;
    }
    await saveEquipment();
  }
}

async function saveEquipment() {
  const wizard = state.wizard;
  wizard.busy = true;
  wizard.formError = "";
  render();
  const payload = {
    manufacturer: wizard.manufacturer,
    otherName: wizard.otherName,
    deviceId: wizard.deviceId,
    locationId: wizard.locationChoice === "new" ? "" : wizard.locationChoice,
    customLocation: wizard.locationChoice === "new" ? wizard.customLocation : "",
    assetName: wizard.assetName,
    model: wizard.model,
    channels: wizard.channels,
    simNote: wizard.simNote,
  };
  try {
    const path = wizard.equipmentId ? `/api/equipment/${wizard.equipmentId}` : "/api/equipment";
    const result = await api(path, {
      method: wizard.equipmentId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    wizard.equipmentId = result.equipment.id;
    wizard.locationChoice = result.equipment.locationId;
    wizard.deviceId = result.equipment.deviceId;
    wizard.checkMessage = "";
    wizard.checkOk = null;
    wizard.step = 4;
    if (result.equipment.connectTarget.address !== targetFor(wizard.manufacturer).address) {
      wizard.formError = "FleetVu replaced the server address with its own target.";
    }
    await reload();
  } catch (error) {
    wizard.formError = error.message;
  } finally {
    wizard.busy = false;
    render();
  }
}

async function checkConnection() {
  const wizard = state.wizard;
  wizard.busy = true;
  render();
  try {
    const result = await api(`/api/equipment/${wizard.equipmentId}/check`, { method: "POST", body: "{}" });
    wizard.checkOk = result.connected;
    wizard.checkMessage = result.message;
    await reload();
  } catch (error) {
    wizard.checkOk = false;
    wizard.checkMessage = error.message;
  } finally {
    wizard.busy = false;
    render();
  }
}

async function standIn() {
  const wizard = state.wizard;
  wizard.busy = true;
  render();
  try {
    const result = await api(`/api/equipment/${wizard.equipmentId}/stand-in`, { method: "POST", body: "{}" });
    wizard.checkMessage = result.note;
    wizard.checkOk = null;
    await reload();
  } catch (error) {
    wizard.checkMessage = error.message;
    wizard.checkOk = false;
  } finally {
    wizard.busy = false;
    render();
  }
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
  if (node.dataset.channel != null) {
    state.wizard.channels[Number(node.dataset.channel)] = node.value;
    return;
  }
  const bind = node.dataset.bind;
  if (!bind) return;
  if (bind === "issueDescription") state.issue.description = node.value;
  else if (bind === "issueOtherName") state.issue.otherName = node.value;
  else if (bind === "programmed") state.wizard.programmed = node.checked;
  else state.wizard[bind] = node.value;
}

function onChange(event) {
  const node = event.target;
  const bind = node.dataset.bind;
  if (bind === "manufacturer") {
    state.wizard.manufacturer = node.value;
    state.wizard.locationChoice = "";
    state.wizard.customLocation = "";
    render();
    return;
  }
  if (bind === "locationChoice") {
    state.wizard.locationChoice = node.value;
    render();
    return;
  }
  if (bind === "programmed") {
    state.wizard.programmed = node.checked;
    return;
  }
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
  if (action === "wizard-next") return wizardNext();
  if (action === "wizard-back") {
    state.wizard.step -= 1;
    state.wizard.formError = "";
    render();
    return;
  }
  if (action === "wizard-reset") {
    state.wizard = freshWizard();
    render();
    return;
  }
  if (action === "add-channel") {
    state.wizard.channels.push("");
    render();
    return;
  }
  if (action === "add-quick-camera") {
    state.wizard.channels.push(button.dataset.name);
    state.wizard.formError = "";
    render();
    return;
  }
  if (action === "add-other-camera") {
    const name = state.wizard.otherCamera.trim();
    if (!name) {
      state.wizard.formError = "Type the camera name, then add it.";
      render();
      return;
    }
    state.wizard.channels.push(name);
    state.wizard.otherCamera = "";
    state.wizard.formError = "";
    render();
    return;
  }
  if (action === "remove-channel") {
    state.wizard.channels.splice(Number(button.dataset.index), 1);
    render();
    return;
  }
  if (action === "check") return checkConnection();
  if (action === "stand-in") return standIn();
  if (action === "ask") return ask(button.dataset.prompt);
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
    return;
  }
  if (action === "copy") {
    try { await navigator.clipboard.writeText(button.dataset.copy); } catch { /* readonly field is still selectable */ }
    button.textContent = "Copied";
  }
}

appEl.addEventListener("input", onInput);
appEl.addEventListener("change", onChange);
appEl.addEventListener("click", (event) => { onClick(event); });
appEl.addEventListener("submit", (event) => {
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
