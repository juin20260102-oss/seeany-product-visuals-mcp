import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function readJson(relativePath) {
  const source = await readFile(resolve(root, relativePath), "utf8");
  return JSON.parse(source);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const packageJson = await readJson("package.json");
const pluginJson = await readJson(".codex-plugin/plugin.json");
const mcpJson = await readJson(".mcp.json");
const marketplaceJson = await readJson(".agents/plugins/marketplace.json");
const workbuddyGuide = await readFile(resolve(root, "docs/workbuddy.md"), "utf8");
const skill = (
  await readFile(
    resolve(root, "skills/seeany-product-visuals/SKILL.md"),
    "utf8",
  )
).replace(/\r\n/g, "\n");

assert(pluginJson.name === packageJson.name, "Plugin and npm package names must match.");
assert(pluginJson.version === packageJson.version, "Plugin and npm package versions must match.");
assert(pluginJson.skills === "./skills/", "Plugin must expose the bundled skills directory.");
assert(pluginJson.mcpServers === "./.mcp.json", "Plugin must reference .mcp.json.");
assert(Array.isArray(pluginJson.interface?.defaultPrompt), "Plugin defaultPrompt must be an array.");

const server = mcpJson.mcpServers?.[packageJson.name];
assert(server?.command === "npx", "MCP server must launch through npx.");
assert(
  Array.isArray(server?.args) && server.args.includes(packageJson.name),
  "MCP server args must reference the published package.",
);

const marketplaceEntry = marketplaceJson.plugins?.find(
  (entry) => entry.name === packageJson.name,
);
assert(marketplaceEntry, "Marketplace must include the SeeAny plugin.");
assert(
  marketplaceEntry.source?.url === packageJson.repository.url.replace(/^git\+/, ""),
  "Marketplace and package repository URLs must match.",
);
assert(
  marketplaceEntry.policy?.installation === "AVAILABLE",
  "Marketplace plugin must be available for installation.",
);

assert(skill.startsWith("---\n"), "Skill must start with YAML frontmatter.");
assert(
  /\nname:\s*seeany-product-visuals\s*\n/.test(skill),
  "Skill frontmatter must declare the expected name.",
);
assert(
  /\ndescription:\s*\S+/.test(skill),
  "Skill frontmatter must include a description.",
);
assert(
  skill.includes("seeany_plan_product_visual") && skill.includes("seeany_create_product_visual"),
  "Skill must document the two-stage product visual workflow.",
);
assert(
  workbuddyGuide.includes("seeany-product-visuals-mcp@latest"),
  "WorkBuddy guide must include the published npm package.",
);

console.log(
  `Plugin validation passed: ${packageJson.name}@${packageJson.version}`,
);
