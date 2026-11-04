(function () {
  const NAV = [
    {
      id: "track",
      label: "Track",
      summary: "Live fleet tracking for the day, with geofences and idle time.",
      subs: [
        { id: "map", label: "Map" },
        { id: "units", label: "Units" },
        { id: "geofences", label: "Geofences" },
        { id: "idle", label: "Idle" },
      ],
    },
    {
      id: "live",
      label: "Live",
      summary: "Cameras on connected units, ready whenever you are signed in.",
      subs: [
        { id: "cameras", label: "Cameras" },
        { id: "channels", label: "Channels" },
      ],
    },
    {
      id: "playback",
      label: "Playback",
      summary: "Review 1080p HD footage for a time you choose.",
      subs: [
        { id: "player", label: "Player" },
        { id: "range", label: "Range" },
        { id: "request", label: "Request" },
      ],
    },
    {
      id: "videos",
      label: "Videos",
      summary: "Channel records, clips marked for review, and requests you made.",
      subs: [
        { id: "library", label: "Library" },
        { id: "curated", label: "Curated" },
        { id: "requests", label: "Requests" },
      ],
    },
    {
      id: "journeys",
      label: "Journeys",
      summary: "Trips, stops, speeding, and mileage for the selected day.",
      subs: [
        { id: "trips", label: "Trips" },
        { id: "stops", label: "Stops" },
        { id: "speeding", label: "Speeding" },
        { id: "mileage", label: "Mileage" },
      ],
    },
    {
      id: "events",
      label: "Events",
      summary: "Safety alerts: collision, phone use, fatigue, and smoking while driving.",
      subs: [
        { id: "all", label: "All alerts" },
        { id: "collision", label: "Collision" },
        { id: "phone", label: "Phone" },
        { id: "fatigue", label: "Fatigue" },
        { id: "smoking", label: "Smoking" },
      ],
    },
    {
      id: "timeline",
      label: "Timeline",
      summary: "One unit across the day, including ignition and the checks FleetVu stored.",
      subs: [
        { id: "day", label: "Day" },
        { id: "ignition", label: "Ignition" },
        { id: "diagnostics", label: "Diagnostics" },
      ],
    },
    {
      id: "reports",
      label: "Reports",
      summary: "Daily, weekly, and monthly telematics reports, plus schedules.",
      subs: [
        { id: "daily", label: "Daily" },
        { id: "weekly", label: "Weekly" },
        { id: "monthly", label: "Monthly" },
        { id: "scheduled", label: "Scheduled" },
      ],
    },
    {
      id: "coaching",
      label: "Coaching",
      summary: "Review the alerts worth a coaching session and mark them when they are done.",
      subs: [
        { id: "queue", label: "Queue" },
        { id: "sessions", label: "Sessions" },
        { id: "scores", label: "Scores" },
      ],
    },
    {
      id: "risk",
      label: "Risk",
      summary: "Vehicle risk, open alerts, and duty-of-care checks for regions and fatigue.",
      subs: [
        { id: "drivers", label: "Vehicles" },
        { id: "alerts", label: "Alerts" },
        { id: "compliance", label: "Compliance" },
      ],
    },
    {
      id: "dashboards",
      label: "Dashboards",
      summary: "Fleet, vehicle, and responsible-person performance on one board.",
      subs: [
        { id: "fleet", label: "Fleet" },
        { id: "drivers", label: "People" },
        { id: "vehicles", label: "Vehicles" },
      ],
    },
    {
      id: "fleet",
      label: "Fleet",
      summary: "Regions, the people assigned to them, and the equipment you uploaded.",
      subs: [
        { id: "regions", label: "Regions" },
        { id: "people", label: "People" },
        { id: "equipment", label: "Equipment" },
      ],
    },
  ];

  const KIND_LABEL = {
    collision: "Collision warning",
    phone: "Phone use",
    fatigue: "Fatigue",
    smoking: "Smoking while driving",
    speeding: "Speeding",
    idle: "Extended idle",
  };

  const COACH_KINDS = ["collision", "phone", "fatigue", "smoking", "speeding"];
  const SCHEDULES = [
    { id: "daily-safety", label: "Daily safety alerts", detail: "Open collision, phone, fatigue, and smoking alerts for the day." },
    { id: "weekly-risk", label: "Weekly risk overview", detail: "Vehicles ordered from higher risk to lower risk." },
    { id: "monthly-mileage", label: "Monthly mileage", detail: "Preview mileage totals for the month of the selected day." },
  ];

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function dayStamp(state) {
    if (state.workDate) return state.workDate;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function addDays(iso, delta) {
    const [year, month, day] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }

  function weekday(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  }

  function clockFromScrub(value) {
    const minutes = Math.round((Number(value) / 100) * 24 * 60) % (24 * 60);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function scrubFromClock(clock) {
    const [hour, minute] = String(clock).split(":").map(Number);
    return Math.round((((hour * 60) + minute) / (24 * 60)) * 100);
  }

  function roleName(role) {
    if (role === "superadmin") return "Superadmin";
    if (role === "admin") return "Admin";
    if (role === "manager") return "Manager";
    return role;
  }

  function create(deps) {
    const { el, state } = deps;

    function units() {
      return [...(state.bundle?.equipment || [])].sort((a, b) => String(a.assetName).localeCompare(String(b.assetName)));
    }

    function people() {
      return state.bundle?.account?.people || [];
    }

    function places() {
      const grouped = new Map();
      for (const person of people()) {
        const key = `${person.region}|||${person.location}`;
        if (!grouped.has(key)) grouped.set(key, { region: person.region, location: person.location, people: [] });
        grouped.get(key).people.push(person);
      }
      return [...grouped.values()];
    }

    function placeFor(item) {
      const list = places();
      if (!list.length) return null;
      return list[hashString(item.id) % list.length];
    }

    function signal(item) {
      const seed = hashString(`${item.deviceId}|${dayStamp(state)}`);
      const connected = item.status === "connected";
      const idle = connected && seed % 5 === 0;
      return {
        seed,
        presence: !connected ? "Offline" : idle ? "Idle" : "Moving",
        idleMinutes: !connected ? 0 : idle ? 15 + (seed % 50) : seed % 6,
        speed: !connected || idle ? 0 : 12 + (seed % 48),
        miles: connected ? 20 + (seed % 160) : 0,
        x: 8 + (seed % 80),
        y: 12 + ((seed >>> 8) % 68),
        startHour: 5 + (seed % 4),
        endHour: 15 + (seed % 6),
        risk: 15 + (seed % 80),
      };
    }

    function eventsFor(item) {
      if (item.status !== "connected") return [];
      const { seed } = signal(item);
      const order = ["speeding", "idle", "phone", "fatigue", "collision", "smoking"];
      const count = 1 + (seed % 3);
      const list = [];
      for (let index = 0; index < count; index += 1) {
        const kind = order[(seed + index) % order.length];
        const hour = 6 + (((seed >>> (index + 1)) >>> 0) % 12);
        const minute = ((seed >>> (index + 3)) >>> 0) % 60;
        const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        list.push({
          id: `${item.id}:${kind}:${index}:${dayStamp(state)}`,
          equipmentId: item.id,
          assetName: item.assetName,
          kind,
          label: KIND_LABEL[kind],
          clock,
          day: dayStamp(state),
        });
      }
      return list.sort((a, b) => a.clock.localeCompare(b.clock));
    }

    function allEvents() {
      return units().flatMap(eventsFor);
    }

    function tripsFor(item) {
      if (item.status !== "connected") return [];
      const { seed, miles } = signal(item);
      const count = 1 + (seed % 3);
      const trips = [];
      let remaining = miles;
      for (let index = 0; index < count; index += 1) {
        const share = index === count - 1 ? remaining : Math.max(1, Math.round(remaining / (count - index)));
        remaining -= share;
        const startHour = 6 + (index * 3);
        trips.push({
          id: `${item.id}:trip:${index}:${dayStamp(state)}`,
          equipmentId: item.id,
          assetName: item.assetName,
          start: `${String(startHour).padStart(2, "0")}:10`,
          end: `${String(Math.min(23, startHour + 2)).padStart(2, "0")}:40`,
          miles: share,
          stopped: index % 2 === 0,
          speeding: seed % 4 === index,
        });
      }
      return trips;
    }

    function allTrips() {
      return units().flatMap(tripsFor);
    }

    function focusUnit() {
      const list = units();
      const selected = list.find((item) => item.id === state.selectedId);
      if (selected) return selected;
      return list.find((item) => item.status === "connected" && channels(item).length)
        || list.find((item) => item.status === "connected")
        || list[0]
        || null;
    }

    function channels(item) {
      return (item?.channels || []).map((channel) => channel.label).filter(Boolean);
    }

    function tag(text, tone) {
      return el("span", { class: tone ? `fv-tag ${tone}` : "fv-tag" }, text);
    }

    function empty(text) {
      return el("p", { class: "fv-empty" }, text);
    }

    function sheet(title, body) {
      return el("section", { class: "fv-sheet" }, [
        el("h2", {}, title),
        el("div", { class: "fv-sheet-body" }, body),
      ]);
    }

    function split(left, right) {
      return el("div", { class: "fv-split" }, [left, right]);
    }

    function stats(items) {
      return el("div", { class: "fv-stats" }, items.map(([label, value]) => el("div", {}, [
        el("strong", {}, String(value)),
        el("span", {}, label),
      ])));
    }

    function table(headers, rows) {
      return el("table", { class: "fv-table" }, [
        el("thead", {}, el("tr", {}, headers.map((header) => el("th", {}, header)))),
        el("tbody", {}, rows.length
          ? rows.map((row) => el("tr", {}, row.map((cell) => el("td", {}, cell))))
          : [el("tr", {}, el("td", { colspan: String(headers.length) }, "Nothing for this day."))]),
      ]);
    }

    function unitButton(item, extra) {
      const current = item.id === state.selectedId;
      return el("button", {
        type: "button",
        class: "fv-line",
        "data-action": "select-unit",
        "data-id": item.id,
        ...(current ? { "aria-current": "true" } : {}),
      }, [
        el("span", {}, [
          el("strong", {}, item.assetName),
          el("small", {}, `${item.manufacturerLabel} · ${item.deviceId}`),
        ]),
        extra || tag(signal(item).presence, signal(item).presence === "Moving" ? "hot" : ""),
      ]);
    }

    function previewNote() {
      return el("p", { class: "fv-note" }, "Preview samples follow the device ID and the selected day. They are not a feed from the vehicle. Connection status, cameras, and people are the records FleetVu saved.");
    }

    function mapBoard() {
      const list = units();
      return el("div", { class: "fv-map", role: "group", "aria-label": "Fleet map" }, [
        list.length ? null : el("p", { class: "fv-map-empty" }, "No units to plot."),
        list.map((item) => {
          const facts = signal(item);
          return el("button", {
            type: "button",
            class: `fv-pin ${facts.presence.toLowerCase()}`,
            style: `left:${facts.x}%;top:${facts.y}%`,
            "data-action": "select-unit",
            "data-id": item.id,
          }, [
            el("span", {}, item.assetName),
          ]);
        }),
      ]);
    }

    function videoWell(item, channel) {
      const active = state.selectedId === item.id && state.channel === channel;
      return el("button", {
        type: "button",
        class: active ? "fv-video is-on" : "fv-video",
        "data-action": "pick-channel",
        "data-id": item.id,
        "data-channel": channel,
      }, [
        el("span", { class: "fv-video-tag" }, "1080p HD"),
        el("strong", {}, channel),
        el("span", {}, item.assetName),
      ]);
    }

    function wellsFor(list) {
      const cards = [];
      for (const item of list) {
        for (const channel of channels(item)) cards.push(videoWell(item, channel));
      }
      return cards.length ? el("div", { class: "fv-videos" }, cards) : empty("No cameras are listed on the connected units.");
    }

    function eventLine(event, mode) {
      const reviewed = Boolean(state.reviewed[event.id]);
      const coached = Boolean(state.coached[event.id]);
      const closed = mode === "coach" ? coached : reviewed;
      const button = mode === "coach"
        ? el("button", {
          type: "button",
          class: "secondary",
          "data-action": "coach-event",
          "data-id": event.id,
          ...(coached ? { disabled: "true" } : {}),
        }, coached ? "Coached" : "Mark coached")
        : el("button", {
          type: "button",
          class: "secondary",
          "data-action": "review-event",
          "data-id": event.id,
        }, reviewed ? "Reviewed" : "Mark reviewed");
      return el("div", { class: "fv-line" }, [
        el("span", {}, [
          el("strong", {}, event.label),
          el("small", {}, [
            el("button", { type: "button", class: "fv-text", "data-action": "select-unit", "data-id": event.equipmentId }, event.assetName),
            ` · ${event.day} ${event.clock}`,
          ]),
        ]),
        tag(closed ? "Closed" : "Open", closed ? "" : "hot"),
        button,
      ]);
    }

    function factSheet(item) {
      const facts = signal(item);
      const place = placeFor(item);
      const checked = item.lastCheck?.at ? new Date(item.lastCheck.at).toLocaleString() : "No connection check yet";
      return sheet(item.assetName, [
        el("dl", { class: "fv-facts" }, [
          ["Manufacturer", item.manufacturerLabel],
          ["Model", item.model || "Not recorded"],
          ["Device ID", item.deviceId],
          ["IMEI", item.imei || "Not recorded"],
          ["Cameras", channels(item).join(", ") || "None listed"],
          ["Connection", item.status === "connected" ? "Connected" : "Not connected"],
          ["Last check", checked],
          ["Region", place ? `${place.region} · ${place.location}` : "No region assigned"],
          ["Preview", `${facts.presence}, ${facts.speed} mph, ${facts.miles} mi`],
        ].map(([label, value]) => el("div", {}, [el("dt", {}, label), el("dd", {}, value)]))),
      ]);
    }

    function dayBar(item) {
      const facts = signal(item);
      if (item.status !== "connected") return empty("This unit is not connected, so this day has no ignition block.");
      const start = facts.startHour;
      const end = Math.min(23, Math.max(start + 1, facts.endHour));
      return el("div", { class: "fv-day" }, [
        el("div", { class: "fv-day-track" }, [
          el("div", { class: "fv-day-on", style: `left:${(start / 24) * 100}%;width:${((end - start) / 24) * 100}%` }),
          eventsFor(item).map((event) => {
            const [hour, minute] = event.clock.split(":").map(Number);
            const left = ((hour + (minute / 60)) / 24) * 100;
            return el("i", { class: "fv-tick", style: `left:${left}%`, title: event.label });
          }),
        ]),
        el("p", {}, `Preview ignition ${start}:00–${end}:00. Orange marks are preview alerts.`),
      ]);
    }

    function trackPage(sub) {
      const list = units();
      if (sub === "map") {
        return split(
          sheet("Map", [mapBoard(), el("p", { class: "hint" }, "Orange is moving, cream is idle, and gray is offline.")]),
          sheet("Units", list.length ? list.map((item) => unitButton(item)) : [empty("No units yet.")]),
        );
      }
      if (sub === "units") {
        const picked = focusUnit();
        const detail = picked
          ? [factSheet(picked), location.hash.startsWith("#/equipment/") ? deps.unitDetail(picked) : null]
          : [empty("Add a unit to see it here.")];
        return split(
          sheet("Units", list.length ? list.map((item) => unitButton(item)) : [empty("No units yet.")]),
          el("div", { class: "stack" }, detail),
        );
      }
      if (sub === "geofences") {
        const yards = places();
        if (!yards.length) {
          return sheet("Geofences", [
            empty("Regions appear after you assign managers, admins, and superadmins on the login page."),
            el("a", { href: "#/welcome" }, "Back to the mailbox"),
          ]);
        }
        return el("div", { class: "stack" }, yards.map((place) => {
          const inside = list.filter((item) => placeFor(item)?.region === place.region && placeFor(item)?.location === place.location);
          return sheet(`${place.region} · ${place.location}`, [
            el("p", {}, place.people.map((person) => `${person.name} (${roleName(person.role)})`).join(", ")),
            inside.length ? inside.map((item) => unitButton(item)) : empty("No unit is assigned to this geofence."),
          ]);
        }));
      }
      const idleUnits = list.filter((item) => signal(item).presence === "Idle");
      return sheet("Idle", [
        idleUnits.length
          ? idleUnits.map((item) => unitButton(item, tag(`${signal(item).idleMinutes} min`, "hot")))
          : empty("No connected unit is idle for this day."),
      ]);
    }

    function livePage(sub) {
      const connected = units().filter((item) => item.status === "connected");
      if (!connected.length) return sheet("Live", [empty("Live cameras open after a unit is connected.")]);
      if (sub === "channels") {
        const rows = [];
        for (const item of connected) {
          const names = channels(item);
          if (!names.length) rows.push([item.assetName, "No camera listed", ""]);
          for (const name of names) rows.push([item.assetName, name, "1080p HD"]);
        }
        return sheet("Channels", [table(["Unit", "Channel", "Picture"], rows)]);
      }
      return sheet("Cameras", [wellsFor(connected)]);
    }

    function playbackPage(sub) {
      const item = focusUnit();
      if (!item) return sheet("Playback", [empty("Add a unit before requesting footage.")]);
      const names = channels(item);
      if (sub === "range") {
        const trips = tripsFor(item);
        return sheet(`Range · ${item.assetName}`, [
          trips.length ? trips.map((trip) => el("button", {
            type: "button",
            class: "fv-line",
            "data-action": "jump-scrub",
            "data-value": String(scrubFromClock(trip.start)),
          }, [
            el("span", {}, [el("strong", {}, `${trip.start}–${trip.end}`), el("small", {}, `${trip.miles} mi preview`)]),
            tag("Jump"),
          ])) : empty("No preview trips for this unit."),
          el("p", { class: "hint" }, `Player time is ${clockFromScrub(state.scrub)}.`),
        ]);
      }
      if (sub === "request") {
        const mine = state.clipRequests.filter((clip) => clip.equipmentId === item.id);
        return sheet(`Request · ${item.assetName}`, [
          names.length ? el("button", { type: "button", class: "primary", "data-action": "request-clip" }, `Request ${state.channel || names[0]} at ${clockFromScrub(state.scrub)}`) : empty("This unit has no cameras listed."),
          state.clipNote ? el("p", { role: "status" }, state.clipNote) : null,
          mine.length ? mine.map((clip) => el("p", {}, `${clip.day} ${clip.clock} · ${clip.channel}`)) : empty("No clip requested yet."),
        ]);
      }
      return sheet(`Player · ${item.assetName}`, [
        names.length ? el("div", { class: "fv-videos" }, names.map((name) => videoWell(item, name))) : empty("This unit has no cameras listed."),
        el("label", { class: "fv-scrub" }, [
          "Time",
          el("input", { id: "scrub", type: "range", min: "0", max: "100", value: String(state.scrub) }),
          el("span", { id: "scrub-read" }, clockFromScrub(state.scrub)),
        ]),
      ]);
    }

    function videosPage(sub) {
      const connected = units().filter((item) => item.status === "connected");
      if (sub === "requests") {
        return sheet("Requests", [
          state.clipRequests.length
            ? state.clipRequests.map((clip) => el("p", {}, `${clip.assetName} · ${clip.channel} · ${clip.day} ${clip.clock}`))
            : empty("Request a clip from Playback."),
        ]);
      }
      if (sub === "curated") {
        const marked = allEvents().filter((event) => COACH_KINDS.includes(event.kind) && event.kind !== "speeding");
        return sheet("Curated", [
          el("p", { class: "hint" }, "These are the preview alerts worth watching first."),
          marked.length ? marked.map((event) => eventLine(event, "review")) : empty("No curated alerts for this day."),
        ]);
      }
      return sheet("Library", [wellsFor(connected)]);
    }

    function journeysPage(sub) {
      const trips = allTrips();
      if (sub === "stops") {
        const stops = trips.filter((trip) => trip.stopped);
        return sheet("Stops", [table(["Unit", "Arrive", "Leave", "Miles"], stops.map((trip) => [trip.assetName, trip.start, trip.end, String(trip.miles)]))]);
      }
      if (sub === "speeding") {
        const fast = trips.filter((trip) => trip.speeding);
        return sheet("Speeding", [table(["Unit", "From", "To", "Miles"], fast.map((trip) => [trip.assetName, trip.start, trip.end, String(trip.miles)]))]);
      }
      if (sub === "mileage") {
        const rows = units().filter((item) => item.status === "connected").map((item) => {
          const miles = tripsFor(item).reduce((sum, trip) => sum + trip.miles, 0);
          return [item.assetName, String(miles)];
        });
        return sheet("Mileage", [table(["Unit", "Preview miles"], rows)]);
      }
      return sheet("Trips", [table(["Unit", "Start", "End", "Miles"], trips.map((trip) => [trip.assetName, trip.start, trip.end, String(trip.miles)]))]);
    }

    function eventsPage(sub) {
      const list = allEvents().filter((event) => sub === "all" || event.kind === sub);
      const title = sub === "all" ? "All alerts" : (KIND_LABEL[sub] || "Alerts");
      return sheet(title, [
        sub === "fatigue" ? el("p", { class: "hint" }, "Fatigue alerts for the selected day. Mark each one after you review it.") : null,
        list.length ? list.map((event) => eventLine(event, "review")) : empty("No alerts of this kind for the selected day."),
      ]);
    }

    function timelinePage(sub) {
      const item = focusUnit();
      if (!item) return sheet("Timeline", [empty("Add a unit to see its day.")]);
      if (sub === "ignition") return sheet(`Ignition · ${item.assetName}`, [dayBar(item)]);
      if (sub === "diagnostics") {
        const checked = item.lastCheck?.at ? new Date(item.lastCheck.at).toLocaleString() : "No connection check yet";
        return sheet(`Diagnostics · ${item.assetName}`, [
          el("dl", { class: "fv-facts" }, [
            ["Device ID", item.deviceId],
            ["Connection", item.status === "connected" ? "Connected" : "Not connected"],
            ["Last check", checked],
            ["Cameras", channels(item).join(", ") || "None listed"],
            ["Engine samples", "Not stored for this unit"],
          ].map(([label, value]) => el("div", {}, [el("dt", {}, label), el("dd", {}, value)]))),
        ]);
      }
      return sheet(`Day · ${item.assetName}`, [
        dayBar(item),
        eventsFor(item).length ? eventsFor(item).map((event) => eventLine(event, "review")) : empty("No preview alerts on this day."),
      ]);
    }

    function weekCounts() {
      const end = dayStamp(state);
      const days = [];
      for (let index = 6; index >= 0; index -= 1) {
        const iso = addDays(end, -index);
        const count = units().filter((item) => item.status === "connected").reduce((sum, item) => sum + (hashString(`${item.deviceId}|${iso}`) % 4), 0);
        days.push({ iso, label: weekday(iso), count });
      }
      return days;
    }

    function reportsPage(sub) {
      if (sub === "weekly") {
        const days = weekCounts();
        const max = Math.max(1, ...days.map((day) => day.count));
        return sheet("Weekly", [
          el("div", { class: "fv-bars" }, days.map((day) => el("div", { class: "fv-bar" }, [
            el("i", { style: `height:${Math.max(6, Math.round((day.count / max) * 96))}px` }),
            el("span", {}, day.label),
            el("small", {}, String(day.count)),
          ]))),
          el("p", { class: "hint" }, "Each bar is a preview count of alerts for connected units."),
        ]);
      }
      if (sub === "monthly") {
        const end = dayStamp(state);
        const weeks = [0, 1, 2, 3].map((week) => {
          let count = 0;
          for (let day = 0; day < 7; day += 1) {
            const iso = addDays(end, -((week * 7) + day));
            count += units().filter((item) => item.status === "connected").reduce((sum, item) => sum + (hashString(`${item.deviceId}|${iso}`) % 4), 0);
          }
          return [`Week ${4 - week}`, String(count)];
        });
        return sheet("Monthly", [table(["Span", "Preview alerts"], weeks)]);
      }
      if (sub === "scheduled") {
        return sheet("Scheduled", SCHEDULES.map((item) => el("div", { class: "fv-line" }, [
          el("span", {}, [el("strong", {}, item.label), el("small", {}, item.detail)]),
          el("button", {
            type: "button",
            class: state.schedules[item.id] ? "primary" : "secondary",
            "data-action": "toggle-schedule",
            "data-id": item.id,
          }, state.schedules[item.id] ? "Scheduled" : "Schedule"),
        ])));
      }
      const rows = units().map((item) => {
        const facts = signal(item);
        const alerts = eventsFor(item).length;
        return [item.assetName, facts.presence, String(facts.miles), String(alerts)];
      });
      return sheet(`Daily · ${dayStamp(state)}`, [table(["Unit", "Preview", "Miles", "Alerts"], rows)]);
    }

    function coachList() {
      return allEvents().filter((event) => COACH_KINDS.includes(event.kind));
    }

    function coachingPage(sub) {
      const list = coachList();
      if (sub === "sessions") {
        const done = list.filter((event) => state.coached[event.id]);
        return sheet("Sessions", [done.length ? done.map((event) => eventLine(event, "coach")) : empty("Marked sessions show up here.")]);
      }
      if (sub === "scores") return sheet("Scores", [riskTable()]);
      const queue = list.filter((event) => !state.coached[event.id]);
      return sheet("Queue", [queue.length ? queue.map((event) => eventLine(event, "coach")) : empty("The coaching queue is clear for this day.")]);
    }

    function riskTable() {
      const rows = units().map((item) => {
        const facts = signal(item);
        const place = placeFor(item);
        return {
          item,
          risk: item.status === "connected" ? facts.risk : 0,
          place,
        };
      }).sort((a, b) => b.risk - a.risk);
      return table(
        ["Vehicle", "Responsible", "Region", "Preview risk"],
        rows.map((row) => [
          row.item.assetName,
          responsibleName(row.place),
          row.place ? row.place.region : "Unassigned",
          row.item.status === "connected" ? String(row.risk) : "Offline",
        ]),
      );
    }

    function responsibleName(place) {
      if (!place) return "Unassigned";
      const manager = place.people.find((person) => person.role === "manager");
      return (manager || place.people[0]).name;
    }

    function riskPage(sub) {
      if (sub === "alerts") {
        const open = allEvents().filter((event) => COACH_KINDS.includes(event.kind) && !state.reviewed[event.id]);
        return sheet("Alerts", [open.length ? open.map((event) => eventLine(event, "review")) : empty("No open safety alerts for this day.")]);
      }
      if (sub === "compliance") {
        const regions = [...new Set(people().map((person) => person.region))];
        const missing = regions.filter((region) => !people().some((person) => person.region === region && person.role === "manager"));
        const fatigue = allEvents().filter((event) => event.kind === "fatigue");
        const fatigueOpen = fatigue.filter((event) => !state.reviewed[event.id]);
        const bare = units().filter((item) => item.status === "connected" && channels(item).length === 0);
        const checks = [
          ["Region coverage", regions.length > 0 && missing.length === 0, regions.length ? (missing.length ? `Add a manager for ${missing.join(", ")}.` : "Every region has a manager.") : "Assign regions from the login page."],
          ["Fatigue alerts", fatigueOpen.length === 0, fatigue.length ? (fatigueOpen.length ? `${fatigueOpen.length} fatigue alert${fatigueOpen.length === 1 ? "" : "s"} still open.` : "Fatigue alerts for this day are reviewed.") : "No fatigue alerts in this preview day."],
          ["Cameras listed", bare.length === 0, bare.length ? `${bare.length} connected unit${bare.length === 1 ? "" : "s"} have no cameras.` : "Connected units have cameras listed."],
        ];
        return sheet("Compliance", checks.map(([name, ok, detail]) => el("div", { class: "fv-line" }, [
          el("span", {}, [el("strong", {}, name), el("small", {}, detail)]),
          tag(ok ? "Met" : "Open", ok ? "" : "hot"),
        ])));
      }
      return sheet("Vehicles", [
        el("p", { class: "hint" }, "Ordered from higher preview risk to lower. Driver names appear when a driver is assigned. Until then, the responsible person is the manager for the region."),
        riskTable(),
      ]);
    }

    function dashboardsPage(sub) {
      const list = units();
      const connected = list.filter((item) => item.status === "connected").length;
      const waiting = list.length - connected;
      if (sub === "drivers") {
        return sheet("People", [
          people().length ? table(["Name", "Role", "Region", "Location"], people().map((person) => [person.name, roleName(person.role), person.region, person.location])) : empty("No people are assigned yet."),
        ]);
      }
      if (sub === "vehicles") {
        const miles = list.reduce((sum, item) => sum + signal(item).miles, 0);
        return sheet("Vehicles", [
          stats([["Connected", connected], ["Waiting", waiting], ["Preview miles", miles]]),
          riskTable(),
        ]);
      }
      const makers = new Map();
      for (const item of list) makers.set(item.manufacturerLabel, (makers.get(item.manufacturerLabel) || 0) + 1);
      return sheet("Fleet", [
        stats([
          ["Units", list.length],
          ["Connected", connected],
          ["Waiting", waiting],
          ["Open alerts", allEvents().filter((event) => COACH_KINDS.includes(event.kind) && !state.reviewed[event.id]).length],
        ]),
        table(["Manufacturer", "Units"], [...makers.entries()].map(([name, count]) => [name, String(count)])),
      ]);
    }

    function fleetPage(sub) {
      if (sub === "people") {
        return sheet("People", [
          people().length
            ? table(["Name", "Role", "Region", "Location"], people().map((person) => [person.name, roleName(person.role), person.region, person.location]))
            : empty("Assign managers, admins, and superadmins from the login page."),
        ]);
      }
      if (sub === "equipment") {
        return sheet("Equipment", [
          units().length
            ? table(
              ["Unit", "Manufacturer", "Device ID", "IMEI", "Connection"],
              units().map((item) => [item.assetName, item.manufacturerLabel, item.deviceId, item.imei || "", item.status === "connected" ? "Connected" : "Not connected"]),
            )
            : empty("No equipment uploaded yet."),
        ]);
      }
      const yards = places();
      if (!yards.length) return sheet("Regions", [empty("Regions appear after login setup."), el("a", { href: "#/welcome" }, "Back to the mailbox")]);
      return el("div", { class: "stack" }, yards.map((place) => sheet(`${place.region} · ${place.location}`, [
        table(["Name", "Role"], place.people.map((person) => [person.name, roleName(person.role)])),
      ])));
    }

    function renderPage(section, sub) {
      if (section === "track") return trackPage(sub);
      if (section === "live") return livePage(sub);
      if (section === "playback") return playbackPage(sub);
      if (section === "videos") return videosPage(sub);
      if (section === "journeys") return journeysPage(sub);
      if (section === "events") return eventsPage(sub);
      if (section === "timeline") return timelinePage(sub);
      if (section === "reports") return reportsPage(sub);
      if (section === "coaching") return coachingPage(sub);
      if (section === "risk") return riskPage(sub);
      if (section === "dashboards") return dashboardsPage(sub);
      return fleetPage(sub);
    }

    function alertCount() {
      return allEvents().filter((event) => COACH_KINDS.includes(event.kind) && event.kind !== "speeding" && !state.reviewed[event.id]).length;
    }

    function rail() {
      const openId = state.route === "product" ? state.section : "";
      return el("aside", { class: "fv-rail" }, [
        el("a", { class: "fv-brand", href: "#/track/map" }, [
          el("img", { src: "/brand/fleetvu-logo-wordmark.png", alt: "FleetVu" }),
          el("p", { class: "fv-live-name" }, ["fleetvu", el("b", {}, "LIVE")]),
        ]),
        el("nav", { class: "fv-nav", "aria-label": "fleetvuLIVE" }, NAV.map((section) => {
          const open = section.id === openId;
          return el("div", { class: "fv-group" }, [
            el("a", {
              class: open ? "fv-main is-open" : "fv-main",
              href: `#/${section.id}/${section.subs[0].id}`,
              ...(open ? { "aria-current": "page" } : {}),
            }, [
              section.label,
              section.id === "events" && alertCount() ? el("span", { class: "fv-count" }, String(alertCount())) : null,
            ]),
            el("div", { class: "fv-subs" }, section.subs.map((sub) => el("a", {
              href: `#/${section.id}/${sub.id}`,
              ...(open && state.sub === sub.id ? { "aria-current": "page" } : {}),
            }, sub.label))),
          ]);
        })),
        el("div", { class: "fv-rail-foot" }, [
          el("a", { href: "#/add", ...(state.route === "add" ? { "aria-current": "page" } : {}) }, "Add equipment"),
          el("a", { href: "#/issues", ...(state.route === "issues" ? { "aria-current": "page" } : {}) }, "Issues"),
          el("button", { type: "button", "data-action": "toggle-ai" }, state.aiOpen ? "Hide AI support" : "AI support"),
          el("a", { href: "#/welcome" }, "Mailbox"),
        ]),
      ]);
    }

    function topbar() {
      const section = NAV.find((item) => item.id === state.section);
      const title = state.route === "add" ? "Add equipment" : state.route === "issues" ? "Issues" : (section?.label || "fleetvuLIVE");
      const email = state.bundle?.account?.email || "Login not set";
      return el("div", { class: "fv-top" }, [
        el("div", {}, [
          el("p", { class: "fv-kicker" }, "fleetvuLIVE"),
          el("p", { class: "fv-top-title" }, title),
        ]),
        el("div", { class: "fv-top-tools" }, [
          el("label", { class: "fv-date" }, [
            "Day",
            el("input", { id: "work-date", type: "date", value: state.workDate || dayStamp(state) }),
          ]),
          el("p", {}, email),
        ]),
      ]);
    }

    function page() {
      const section = NAV.find((item) => item.id === state.section) || NAV[0];
      return el("div", { class: "stack" }, [
        el("header", {}, [
          el("h1", { class: "fv-title" }, section.label),
          el("div", { class: "fv-rule", role: "presentation" }),
          el("p", { class: "lede" }, section.summary),
          previewNote(),
        ]),
        renderPage(section.id, state.sub),
      ]);
    }

    function handle(action, button) {
      if (action === "pick-channel") {
        state.selectedId = button.dataset.id;
        state.channel = button.dataset.channel || "";
        deps.render();
        return true;
      }
      if (action === "review-event") {
        state.reviewed[button.dataset.id] = !state.reviewed[button.dataset.id];
        deps.render();
        return true;
      }
      if (action === "coach-event") {
        state.coached[button.dataset.id] = true;
        state.reviewed[button.dataset.id] = true;
        deps.render();
        return true;
      }
      if (action === "toggle-schedule") {
        const id = button.dataset.id;
        state.schedules[id] = !state.schedules[id];
        deps.render();
        return true;
      }
      if (action === "jump-scrub") {
        state.scrub = Number(button.dataset.value);
        deps.render();
        return true;
      }
      if (action === "request-clip") {
        const item = focusUnit();
        if (!item) return true;
        const names = channels(item);
        const channel = state.channel || names[0];
        if (!channel) {
          state.clipNote = "This unit has no cameras listed.";
          deps.render();
          return true;
        }
        const clock = clockFromScrub(state.scrub);
        state.clipRequests.unshift({
          id: `${item.id}:${channel}:${dayStamp(state)}:${clock}:${state.clipRequests.length}`,
          assetName: item.assetName,
          equipmentId: item.id,
          channel,
          day: dayStamp(state),
          clock,
        });
        state.clipNote = `Requested ${channel} at ${clock}.`;
        deps.render();
        return true;
      }
      return false;
    }

    return { rail, topbar, page, handle };
  }

  window.FleetVuProduct = { NAV, create, clock: clockFromScrub };
})();
