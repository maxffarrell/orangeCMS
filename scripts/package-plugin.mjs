import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixedFiles = ["plugin.json", ".claude-plugin/plugin.json", "LICENSE"];
const skillExtensions = /\.(?:md|ya?ml|json)$/;

async function skillFiles(root, directory = "skills") {
  const directoryStat = await lstat(resolve(root, directory));
  if (directoryStat.isSymbolicLink())
    throw new Error(`Plugin packages cannot contain symlinks: ${directory}`);
  if (!directoryStat.isDirectory())
    throw new Error(`Not a plugin resource directory: ${directory}`);
  const files = [];
  for (const entry of await readdir(resolve(root, directory), {
    withFileTypes: true,
  })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink())
      throw new Error(`Plugin packages cannot contain symlinks: ${path}`);
    if (entry.isDirectory()) files.push(...(await skillFiles(root, path)));
    else if (entry.isFile() && skillExtensions.test(entry.name))
      files.push(path);
    else throw new Error(`Unsupported skill resource: ${path}`);
  }
  return files;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a deterministic, uncompressed ZIP using only Node's standard library.
 * ZIP timestamps are fixed to 1980-01-01; sorted names and fixed permissions make
 * identical source trees produce identical bytes across machines.
 */
export async function buildPluginArchive({
  root = repositoryRoot,
  outputPath,
} = {}) {
  const claudeDirectory = await lstat(resolve(root, ".claude-plugin"));
  if (claudeDirectory.isSymbolicLink() || !claudeDirectory.isDirectory()) {
    throw new Error(
      "The Claude manifest directory must be a regular directory",
    );
  }
  const names = [...fixedFiles, ...(await skillFiles(root))].sort();
  if (
    !names.includes("skills/orangecms-setup/SKILL.md") ||
    !names.includes("skills/orangecms/SKILL.md")
  ) {
    throw new Error("Both orangeCMS setup and usage skills are required");
  }
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const name of names) {
    const sourcePath = resolve(root, name);
    if (!(await lstat(sourcePath)).isFile())
      throw new Error(`Not a regular plugin file: ${name}`);
    const data = await readFile(sourcePath);
    const filename = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // ZIP 2.0
    local.writeUInt16LE(0x0800, 6); // UTF-8 filenames
    local.writeUInt16LE(0x0021, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    localRecords.push(local, filename, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // Unix ZIP 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  const archive = Buffer.concat([...localRecords, centralDirectory, end]);
  if (outputPath) {
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, archive);
  }
  return {
    archive,
    files: names,
    sha256: createHash("sha256").update(archive).digest("hex"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const outputPath = resolve(
    process.argv[2] || resolve(repositoryRoot, "dist/orangecms-plugin.zip"),
  );
  const { files, sha256 } = await buildPluginArchive({ outputPath });
  console.log(
    `Packaged ${files.length} files: ${outputPath}\nSHA-256: ${sha256}`,
  );
}
