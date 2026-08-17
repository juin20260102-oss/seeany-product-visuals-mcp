import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const expectedTag = `v${packageJson.version}`;
const releaseTag = process.env.RELEASE_TAG;

if (releaseTag !== expectedTag) {
  throw new Error(
    `Release tag ${JSON.stringify(releaseTag)} does not match package version ${expectedTag}.`,
  );
}

console.log(`Release tag validated: ${releaseTag}`);
