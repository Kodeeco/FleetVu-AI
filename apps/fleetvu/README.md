# FleetVu

Customers add their own video equipment and connect it to FleetVu. The wizard covers Howen, Stonkam, and any other manufacturer. FleetVu shows the server address and ports to type on the device. The customer copies the device ID from the unit.

A learning loop on the device-ID step remembers, per manufacturer, where that ID was found and whether the unit then connected. Locations that already led to a connection are listed first. The memory is stored in this app. There is no separate learning service.

AI Support is available on every screen. Issues takes a connection or device report and returns what failed, the manufacturer, and a next step.

This directory is the whole app. It does not use the repository root, and it has no GitHub Pages, Vercel, or Netlify configuration. Copy it onto a server you control.

## Copy these files

Put them in one directory on the server, keeping `lib/` and `public/` as subdirectories:

- `package.json`
- `package-lock.json`
- `server.js`
- `start.sh`
- `README.md`
- `lib/app.js`
- `lib/assistant.js`
- `lib/learning.js`
- `lib/store.js`
- `lib/targets.js`
- `lib/validate.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/favicon.svg`

Do not copy `node_modules/` or `data/`. The server creates `data/` when the first unit is saved. `test/` is only for development.

The server needs Node.js 20 or newer, which includes npm.

## Start

From the copied directory:

```sh
sh start.sh
```

That is the only start command. The first run installs the production dependency. Later runs start immediately.

FleetVu listens on port **4173**. Open `http://<your-server>:4173`. Set `PORT` to use a different port: `PORT=8080 sh start.sh`.

`npm test` runs the development checks. It is not part of starting the server.

## Placeholders

The Howen, Stonkam, and other-manufacturer addresses and ports are FleetVu's, and they are labeled placeholders. This build does not run a live ingest listener, and `.invalid` hosts are not reachable from a truck. Check connection looks for a registration of the device ID you entered. Until one arrives, the result is a miss and the learning loop records it.

On the verify step, **Post this device ID to the local FleetVu ingest** sends that same ID into the local stand-in, the way a unit would register. Then check again. It does not invent an ID and it is not a server you host.
