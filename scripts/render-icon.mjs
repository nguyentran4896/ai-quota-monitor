import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const source = path.join(projectRoot, "build", "icon.svg");
const destination = path.join(projectRoot, "build", "icon.png");

await mkdir(path.dirname(destination), { recursive: true });
await sharp(source, { density: 384 }).resize(512, 512).png({ compressionLevel: 9 }).toFile(destination);
console.log(`Rendered ${destination}`);

