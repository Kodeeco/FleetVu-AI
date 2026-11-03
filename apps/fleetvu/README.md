# FleetVu

Customers add their own video equipment and connect it to FleetVu. The wizard covers Howen, Stonkam, and any other manufacturer. FleetVu shows the server address and ports to type on the device. The customer copies the device ID from the unit.

A learning loop on the device-ID step remembers, per manufacturer, where that ID was found and whether the unit then connected. Locations that already led to a connection are listed first. The memory is stored in this app. There is no separate learning service.

AI Support is available on every screen. Issues takes a connection or device report and returns what failed, the manufacturer, and a next step.

## Run

```bash
cd apps/fleetvu
npm install
npm start
```

Open http://127.0.0.1:4173

```bash
npm test
```

## Placeholders

The Howen, Stonkam, and other-manufacturer addresses and ports are FleetVu's, and they are labeled placeholders. This build does not run a live ingest listener, and `.invalid` hosts are not reachable from a truck. Check connection looks for a registration of the device ID you entered. Until one arrives, the result is a miss and the learning loop records it.

On the verify step, **Post this device ID to the local FleetVu ingest** sends that same ID into the local stand-in, the way a unit would register. Then check again. It does not invent an ID and it is not a server you host.
