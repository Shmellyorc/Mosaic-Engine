import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { root } from "./bundles.mjs";

const run = promisify(execFile);
const platform = process.platform;
const arch = process.arch;
const dist = resolve(root, "dist");
const bundleName = `Mosaic Engine-${platform}-${arch}`;
const archiveName = `mosaic-engine-${platform}-${arch}.tar.gz`;
const packageDir = resolve(dist, "packages");
const executable =
  platform === "darwin"
    ? "Mosaic Engine.app/Contents/MacOS/mosaic-engine"
    : platform === "win32"
      ? "mosaic-engine.exe"
      : "mosaic-engine";
const release = JSON.parse(
  await readFile(resolve(dist, "desktop/package.json"), "utf8"),
);
if (!(await stat(resolve(packageDir, bundleName, executable))).isFile()) {
  throw new Error("The packaged executable is missing.");
}
const archive = resolve(dist, archiveName);
const temporary = archive + "." + process.pid + ".tmp";
try {
  await run("tar", ["-czf", temporary, "-C", packageDir, bundleName], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(temporary)) hash.update(bytes);
  const sha256 = hash.digest("hex");
  const { size } = await stat(temporary);
  await rename(temporary, archive);
  const commit = (
    await run("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  await Promise.all([
    writeFile(archive + ".sha256", sha256 + "  " + basename(archive) + "\n"),
    writeFile(
      resolve(dist, `release-${platform}-${arch}.json`),
      JSON.stringify(
        {
          version: release.version,
          commit,
          platform,
          arch,
          archive: archiveName,
          size,
          sha256,
        },
        null,
        2,
      ) + "\n",
    ),
  ]);
  console.log(archiveName + " " + sha256);
} finally {
  await unlink(temporary).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
