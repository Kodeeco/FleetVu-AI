export const PLACEHOLDER_NOTICE =
  "Placeholder. FleetVu owns this address and these ports. This local build is not a live ingest host, so a unit on a truck cannot reach it yet. Type the values below on the device exactly as shown. Do not substitute a server of your own.";

const HOWEN_STEPS = [
  "On the MDVR, open the network, center, or platform server page.",
  "In the server address field, enter the FleetVu address below. Clear any previous host.",
  "Enter the registration port and the media port in the matching port fields.",
  "Save. Reboot the unit if that page applies settings only after a restart.",
  "Leave the device ID on the unit as the value you copied into FleetVu.",
];

const STONKAM_STEPS = [
  "Open the unit's server or CMS settings.",
  "Replace the factory server with the FleetVu address and ports below.",
  "Save and let the unit reconnect.",
  "Leave the device ID unchanged so FleetVu can match the registration.",
];

const OTHER_STEPS = [
  "Open the server or platform page in that manufacturer's menu or setup tool.",
  "Enter the FleetVu address and both ports below. Clear any previous host.",
  "If it asks for a protocol, keep the one that unit uses to register to a platform.",
  "Save. Leave the device ID unchanged.",
];

export const CONNECT_TARGETS = {
  howen: {
    manufacturer: "howen",
    label: "Howen",
    address: "howen.ingest.fleetvu.invalid",
    placeholder: true,
    notice: PLACEHOLDER_NOTICE,
    menuSteps: HOWEN_STEPS,
    ports: [
      { id: "registration", label: "Registration port", number: 8900, deviceField: "Server port or center port" },
      { id: "media", label: "Media port", number: 8901, deviceField: "Media or stream port" },
    ],
  },
  stonkam: {
    manufacturer: "stonkam",
    label: "Stonkam",
    address: "stonkam.ingest.fleetvu.invalid",
    placeholder: true,
    notice: PLACEHOLDER_NOTICE,
    menuSteps: STONKAM_STEPS,
    ports: [
      { id: "registration", label: "Registration port", number: 9100, deviceField: "Server port" },
      { id: "media", label: "Media port", number: 9101, deviceField: "Stream or media port" },
    ],
  },
  other: {
    manufacturer: "other",
    label: "Other manufacturer",
    address: "ingest.fleetvu.invalid",
    placeholder: true,
    notice: PLACEHOLDER_NOTICE,
    menuSteps: OTHER_STEPS,
    ports: [
      { id: "registration", label: "Registration port", number: 9200, deviceField: "Server port" },
      { id: "media", label: "Media port", number: 9201, deviceField: "Media port" },
    ],
  },
};

export function targetFor(manufacturer) {
  const target = CONNECT_TARGETS[manufacturer];
  if (!target) {
    const error = new Error("Choose Howen, Stonkam, or another manufacturer.");
    error.status = 400;
    throw error;
  }
  return structuredClone(target);
}

export function publicTargets() {
  return structuredClone(CONNECT_TARGETS);
}
