import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildPluginArchive } from "./package-plugin.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));

test("portable and Claude plugins share identity and discover the packaged skills", async () => {
  const portable = await json("plugin.json");
  const claude = await json(".claude-plugin/plugin.json");
  assert.equal(
    portable.$schema,
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  );
  for (const field of [
    "name",
    "version",
    "description",
    "license",
    "repository",
  ]) {
    assert.equal(
      portable[field],
      claude[field],
      `Plugin identity differs: ${field}`,
    );
  }
  assert.equal(portable.name, "orangecms");
  assert.equal(portable.license, "MIT");
  assert.equal(portable.extensions["com.openai"].requires_local_executor, true);
  assert.equal(
    portable.extensions["com.openai"].onboardingSkill,
    "./skills/orangecms-setup/SKILL.md",
  );
  assert.ok(
    await readFile(
      resolve(root, portable.extensions["com.openai"].onboardingSkill),
      "utf8",
    ),
  );
  for (const manifest of [portable, claude]) {
    assert.equal(
      manifest.mcpServers,
      undefined,
      "Plugin must not connect to an implicit CMS instance",
    );
    assert.equal(
      manifest.hooks,
      undefined,
      "Installing the plugin must not execute lifecycle hooks",
    );
  }
});

test("both marketplaces install the same root plugin without automatic installation", async () => {
  const claude = await json(".claude-plugin/marketplace.json");
  const openai = await json(".agents/plugins/marketplace.json");
  assert.equal(claude.name, "orangecms");
  assert.equal(openai.name, claude.name);
  assert.equal(claude.plugins.length, 1);
  assert.equal(openai.plugins.length, 1);
  assert.equal(claude.plugins[0].name, "orangecms");
  assert.equal(claude.plugins[0].source, "./");
  assert.equal(openai.plugins[0].name, "orangecms");
  assert.deepEqual(openai.plugins[0].source, { source: "local", path: "./" });
  assert.deepEqual(openai.plugins[0].policy, {
    installation: "AVAILABLE",
    authentication: "ON_INSTALL",
  });
  assert.equal(openai.plugins[0].category, "Productivity");
});

test("release ZIP is deterministic, minimal, and readable by a standard unzip implementation", async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), "orangecms-plugin-test-"));
  try {
    const outputPath = resolve(temporary, "plugin.zip");
    const first = await buildPluginArchive({ outputPath });
    const second = await buildPluginArchive();
    assert.deepEqual(first.archive, second.archive);
    assert.match(first.sha256, /^[a-f0-9]{64}$/);
    assert.equal(first.sha256, second.sha256);
    execFileSync("unzip", ["-t", outputPath], { encoding: "utf8" });
    const names = execFileSync("unzip", ["-Z1", outputPath], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    assert.deepEqual(names, first.files);
    assert.deepEqual(
      names.filter((name) => !name.startsWith("skills/")),
      [".claude-plugin/plugin.json", "LICENSE", "plugin.json"],
    );
    for (const skill of ["orangecms", "orangecms-setup"]) {
      assert.ok(names.includes(`skills/${skill}/SKILL.md`));
      assert.ok(names.includes(`skills/${skill}/agents/openai.yaml`));
    }
    for (const name of names) {
      assert.match(
        name,
        /^(?:plugin\.json|LICENSE|\.claude-plugin\/plugin\.json|skills\/[a-z0-9_/-]+\.(?:md|ya?ml|json))$/i,
      );
      assert.doesNotMatch(
        name,
        /(?:^|\/)(?:\.env|\.mcp\.json|migrations|src|node_modules|wrangler|marketplace\.json)(?:$|[/.])/,
      );
      assert.deepEqual(
        execFileSync("unzip", ["-p", outputPath, name]),
        await readFile(resolve(root, name)),
      );
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("packager rejects symlink resources and unexpected skill file types", async () => {
  const temporary = await mkdtemp(
    resolve(tmpdir(), "orangecms-plugin-invalid-"),
  );
  try {
    await mkdir(resolve(temporary, "skills"), { recursive: true });
    await mkdir(resolve(temporary, ".claude-plugin"));
    await symlink(
      resolve(root, "LICENSE"),
      resolve(temporary, "skills/leak.md"),
    );
    await assert.rejects(
      buildPluginArchive({ root: temporary }),
      /cannot contain symlinks/,
    );
    await rm(resolve(temporary, "skills/leak.md"));
    await writeFile(resolve(temporary, "skills/.env"), "SECRET=never-package");
    await assert.rejects(
      buildPluginArchive({ root: temporary }),
      /Unsupported skill resource/,
    );
    await rm(resolve(temporary, "skills"), { recursive: true });
    await symlink(resolve(root, "skills"), resolve(temporary, "skills"));
    await assert.rejects(
      buildPluginArchive({ root: temporary }),
      /cannot contain symlinks/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
