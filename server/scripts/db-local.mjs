/**
 * A local MongoDB replica set, for development without Atlas (NFR6).
 *
 * A replica set rather than a standalone mongod because KITOS uses multi-
 * document transactions (parent adds a child; payment confirmation in Batch 3)
 * and MongoDB only offers those on a replica set. One node is enough.
 *
 * Data lives in `server/.local/mongo` so it survives a restart — a seeded
 * demo world should not evaporate between `npm run db:local` runs.
 *
 * Usage:
 *   npm run db:local     # leave running
 *   npm run seed         # in another terminal
 *   npm run dev
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = 27027;
const DATA_DIR = path.resolve("server/.local/mongo");

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log("Starting a local MongoDB replica set…");

  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: "kitos-local", storageEngine: "wiredTiger" },
    instanceOpts: [{ port: PORT, dbPath: DATA_DIR, storageEngine: "wiredTiger" }],
  });

  const uri = replSet.getUri();

  console.log("");
  console.log("  MongoDB is ready.");
  console.log("");
  console.log(`  URI:  ${uri}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Data: ${DATA_DIR}`);
  console.log("");
  console.log("  Put this in server/.env:");
  console.log("");
  console.log(`    MONGODB_URI=mongodb://127.0.0.1:${PORT}/?directConnection=true`);
  console.log("    MONGODB_DB_NAME=kitos");
  console.log("");
  console.log("  Leave this running. Ctrl+C to stop.");
  console.log("");

  const stop = async (signal) => {
    console.log(`\nStopping MongoDB (${signal})…`);
    // Keep the data directory: `cleanup: false` is what makes the seeded
    // world persist between runs.
    await replSet.stop({ doCleanup: false, force: false });
    process.exit(0);
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

main().catch((err) => {
  console.error("Could not start the local MongoDB replica set:");
  console.error(err.message);
  console.error(
    "\nOn a first run this downloads a MongoDB binary, which needs a network connection."
  );
  process.exit(1);
});
