import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const source = path.join(projectRoot, "build", "icon.svg");
const pngDestination = path.join(projectRoot, "build", "icon.png");
const icoDestination = path.join(projectRoot, "build", "icon.ico");
const windowsIconSizes = [16, 24, 32, 48, 64, 128, 256];

await mkdir(path.dirname(pngDestination), { recursive: true });
await sharp(source, { density: 384 })
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toFile(pngDestination);

const windowsImages = await Promise.all(
  windowsIconSizes.map((size) =>
    sharp(source, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  ),
);
const directorySize = 6 + windowsImages.length * 16;
const directory = Buffer.alloc(directorySize);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(windowsImages.length, 4);

let imageOffset = directorySize;
for (let index = 0; index < windowsImages.length; index += 1) {
  const size = windowsIconSizes[index];
  const image = windowsImages[index];
  const entryOffset = 6 + index * 16;
  directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
  directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
  directory.writeUInt8(0, entryOffset + 2);
  directory.writeUInt8(0, entryOffset + 3);
  directory.writeUInt16LE(1, entryOffset + 4);
  directory.writeUInt16LE(32, entryOffset + 6);
  directory.writeUInt32LE(image.length, entryOffset + 8);
  directory.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += image.length;
}

await writeFile(icoDestination, Buffer.concat([directory, ...windowsImages]));
console.log(`Rendered ${pngDestination} and ${icoDestination}`);
