/**
 * Publish the E. coli iML1515 GEM to your Geo personal space.
 *
 * Steps:
 *   1. Generate all geo-sdk ops from data/iml1515.json
 *   2. Publish in batches of 100 ops, logging each tx hash
 *      (resumes automatically if a previous run was interrupted)
 *
 * Usage:
 *   npm run publish
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { chunkOps, generateOps } from "./generate_ops.js";
import { publish } from "./publish.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

interface PublishLogEntry {
    batch: number;
    totalBatches: number;
    editName: string;
    opsInBatch: number;
    txHash: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function publishWithRetry(args: Parameters<typeof publish>[0], attempts = 4): Promise<string> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await publish(args);
        } catch (err) {
            if (attempt === attempts) throw err;
            const wait = attempt * 2000; // 2s, 4s, 6s
            console.log(`\n  attempt ${attempt} failed (${(err as Error).message.slice(0, 80)}), retrying in ${wait / 1000}s...`);
            await sleep(wait);
        }
    }
    throw new Error("unreachable");
}

async function main(): Promise<void> {
    const spaceId = config.spaceId;
    console.log(`Publishing to space: ${spaceId}\n`);

    // ── Step 1: generate ops ──────────────────────────────────────────────────

    console.log("Generating geo-sdk ops...");
    const { ops } = generateOps();
    console.log(`Total ops: ${ops.length}`);

    const BATCH_SIZE = 100;
    const chunks = chunkOps(ops, BATCH_SIZE);
    console.log(`Batches: ${chunks.length} × ≤${BATCH_SIZE} ops\n`);

    // ── Step 2: publish batches ───────────────────────────────────────────────

    const publishLog: PublishLogEntry[] = [];
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // Resume from where a previous run left off
    const logPath = path.join(DATA_DIR, "publish_log.json");
    const doneBatches = new Set<number>();
    if (fs.existsSync(logPath)) {
        const prev: PublishLogEntry[] = JSON.parse(fs.readFileSync(logPath, "utf8"));
        for (const e of prev) {
            doneBatches.add(e.batch);
            publishLog.push(e);
        }
        if (doneBatches.size > 0) {
            console.log(`Resuming — ${doneBatches.size} batch(es) already published, skipping.\n`);
        }
    }

    for (let i = 0; i < chunks.length; i++) {
        const batchNum = i + 1;
        if (doneBatches.has(batchNum)) continue;

        const editName = `iML1515 import — batch ${batchNum}/${chunks.length}`;

        process.stdout.write(`[${batchNum}/${chunks.length}] ${chunks[i].length} ops... `);

        const txHash = await publishWithRetry({
            spaceId,
            editName,
            ops: chunks[i],
        });

        console.log(`tx: ${txHash}`);

        publishLog.push({ batch: batchNum, totalBatches: chunks.length, editName, opsInBatch: chunks[i].length, txHash });
        fs.writeFileSync(logPath, JSON.stringify(publishLog, null, 2));

        await sleep(500);
    }

    console.log(`\nAll ${chunks.length} batches published to space ${spaceId}`);
    console.log("Log written to data/publish_log.json");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
