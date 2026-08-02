import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [envFile, moduleFile, imageFile] = process.argv.slice(2);
if (!envFile || !moduleFile || !imageFile) throw new Error("runtime verification paths are required");

const allowedKeys = new Set(["DASHSCOPE_API_KEY", "HERMES_VISION_API_URL", "HERMES_VISION_MODEL"]);
for (const line of (await readFile(envFile, "utf8")).split(/\r?\n/)) {
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  if (allowedKeys.has(key)) process.env[key] = line.slice(separator + 1).trim();
}

const { createHermesVisionService } = await import(pathToFileURL(moduleFile));
const service = createHermesVisionService();
if (!service.configured) throw new Error("vision service is not configured");
const description = await service.analyzeImage({
  bytes: await readFile(imageFile),
  mimeType: "image/jpeg",
  prompt: "生产只读连通性检查",
});
if (!description.trim()) throw new Error("vision provider returned an empty description");
console.log(JSON.stringify({ ok: true, integration: "hermesVision", responseLength: Array.from(description).length }));
