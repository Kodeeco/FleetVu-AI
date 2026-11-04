import { createApp } from "./lib/app.js";

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "0.0.0.0";
const app = createApp();
app.listen(port, host, () => {
  console.log(`FleetVu listening on port ${port}`);
  console.log(`On this machine: http://127.0.0.1:${port}`);
});
