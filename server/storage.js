import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function createStorage(filePath) {
  function ensureStore() {
    mkdirSync(path.dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) writeFileSync(filePath, "[]\n", "utf8");
  }

  function list() {
    ensureStore();
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("The ad store must contain a JSON array.");
    return parsed;
  }

  function save(ads) {
    ensureStore();
    const temporaryPath = `${filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(ads, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, filePath);
  }

  return {
    list,
    find(id) {
      return list().find((ad) => ad.id === id);
    },
    create(fields) {
      const ads = list();
      const ad = {
        id: randomBytes(5).toString("hex"),
        ...fields,
        createdAt: new Date().toISOString()
      };
      ads.unshift(ad);
      save(ads);
      return ad;
    }
  };
}
