import { spawn, spawnSync } from "node:child_process";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const frontend = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const interfaces = Object.entries(networkInterfaces()).sort(([a], [b]) => {
  const preferred = (name) => (/^(en0|eth0|wlan0)$/.test(name) ? 0 : 1);
  return preferred(a) - preferred(b);
});
const lanHost =
  process.env.LAN_HOST ??
  interfaces
    .flatMap(([, addresses]) => addresses ?? [])
    .find(
      ({ family, internal, address }) =>
        family === "IPv4" &&
        !internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address),
    )?.address;

if (!lanHost || isIP(lanHost) !== 4) {
  throw new Error("Set LAN_HOST to this computer's LAN IPv4 address.");
}

const environment = {
  ...process.env,
  CONVEX_CLOUD_ORIGIN: `http://${lanHost}:3210`,
  CONVEX_SITE_ORIGIN: `http://${lanHost}:3211`,
  NEXT_PUBLIC_DEPLOYMENT_URL: `http://${lanHost}:3210`,
  EXPO_PUBLIC_CONVEX_URL: `http://${lanHost}:3210`,
  EXPO_PUBLIC_CONVEX_SITE_URL: `http://${lanHost}:3211`,
  REACT_NATIVE_PACKAGER_HOSTNAME: lanHost,
  WEB_HOST: "0.0.0.0",
  BROWSER: "none",
};

const docker = spawnSync("docker", ["compose", "up", "-d"], {
  cwd: root,
  env: environment,
  stdio: "inherit",
});
if (docker.error) throw docker.error;
if (docker.status !== 0) process.exit(docker.status ?? 1);

console.log(`Open http://${lanHost}:8081 on your iPad.`);
const expo = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/expo/bin/cli", import.meta.url)),
    "start",
    "--web",
    "--lan",
    "--port",
    "8081",
  ],
  { cwd: frontend, env: environment, stdio: "inherit" },
);

expo.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
expo.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    expo.kill(signal);
  });
}
