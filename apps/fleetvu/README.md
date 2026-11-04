# FleetVu

Customers add their own video equipment and connect it to FleetVu. Add equipment is one instruction at a time, then Click here. It covers Howen, Stonkam, and any other manufacturer. FleetVu shows the server address and ports to type on the device. The customer copies the device ID from the unit.

FleetVu remembers, for each manufacturer, where that ID was found and whether the unit then connected. Places that already connected are mentioned first. The memory is stored in this app.

After a unit connects, the screen names that unit and the next step is Click here to add another unit. Issues takes a connection or device report and returns what failed, the manufacturer, and what to do next.

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

The Howen, Stonkam, and other-manufacturer addresses and ports are FleetVu's. This build is not the live server, and `.invalid` hosts are not reachable from a truck. The check looks for a registration of the device ID you entered. Until one arrives, the result is a miss, and FleetVu remembers the place you found the ID.

If you are trying the steps on this computer, Click here records a practice connection for the device ID already entered, then checks again. It does not invent an ID and it is not a server you host.
