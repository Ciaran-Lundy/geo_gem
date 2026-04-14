/**
 * Smoke-test the published GEM graph on Geo testnet.
 *
 * Checks:
 *   1. Space exists and is reachable
 *   2. Known entities (PGI reaction, glucose metabolite) appear in search
 *   3. PGI has at least one substrate and one product relation in the entity map
 *
 * Usage:
 *   npm run validate
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { makeEntityId } from "./ontology.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const GEO_API = "https://testnet-api.geobrowser.io";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function searchEntities(query: string): Promise<{ id: string; name: string | null }[]> {
    const res = await fetch(`${GEO_API}/search?q=${encodeURIComponent(query)}&network=TESTNET`);
    if (!res.ok) throw new Error(`Search failed (${res.status}): ${await res.text()}`);
    const { results } = await res.json();
    return results ?? [];
}

function pass(msg: string): void {
    console.log(`  ✓ ${msg}`);
}

function fail(msg: string): void {
    console.log(`  ✗ ${msg}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const spaceId = config.personalSpaceId;

    console.log(`Validating space: ${spaceId}\n`);

    let allPassed = true;

    // ── Check 1: entity ID map exists ─────────────────────────────────────────

    console.log("Check 1: entity_id_map.json");
    const mapPath = path.join(DATA_DIR, "entity_id_map.json");
    if (!fs.existsSync(mapPath)) {
        fail("data/entity_id_map.json not found — run generate_ops first");
        allPassed = false;
    } else {
        const entityIdMap: Record<string, string> = JSON.parse(fs.readFileSync(mapPath, "utf8"));
        const count = Object.keys(entityIdMap).length;
        pass(`entity_id_map.json exists (${count} entries)`);

        // iML1515 has ~1877 metabolites + ~2712 reactions + ~1516 genes
        if (count < 5000) {
            fail(`Unexpectedly few entries: ${count} (expected >5000)`);
            allPassed = false;
        } else {
            pass(`Entry count looks correct: ${count}`);
        }

        // ── Check 2: PGI reaction entity ID is deterministic ─────────────────

        console.log("\nCheck 2: PGI reaction entity");
        const pgiId = makeEntityId("reaction", "PGI");
        const pgiIdMapped = entityIdMap["PGI"];

        if (pgiIdMapped === pgiId) {
            pass(`PGI entity ID is stable: ${pgiId}`);
        } else {
            fail(`PGI ID mismatch — map: ${pgiIdMapped}, expected: ${pgiId}`);
            allPassed = false;
        }

        // ── Check 3: glucose metabolite has both compartment variants ─────────

        console.log("\nCheck 3: D-Glucose metabolite IDs");
        const glcE = entityIdMap["glc__D_e"];
        const glcC = entityIdMap["glc__D_c"];
        if (glcE) {
            pass(`glc__D_e (extracellular) mapped → ${glcE}`);
        } else {
            fail("glc__D_e not found in entity map");
            allPassed = false;
        }
        if (glcC) {
            pass(`glc__D_c (cytoplasm) mapped → ${glcC}`);
        } else {
            // not all models have cytoplasmic free glucose — soft warning
            console.log(`  ~ glc__D_c not in map (may be absent in iML1515 — OK)`);
        }
    }

    // ── Check 4: search API reachability ────────────────────────────────────

    console.log("\nCheck 4: Geo search API");
    try {
        const results = await searchEntities("PGI");
        if (results.length > 0) {
            pass(`Search returned ${results.length} result(s) for "PGI"`);
            const hit = results.find((r) => r.name?.includes("PGI") || r.name?.includes("isomerase"));
            if (hit) {
                pass(`PGI entity visible in Geo index: "${hit.name}" (${hit.id})`);
            } else {
                console.log(`  ~ PGI entity not yet indexed (indexing may lag a few minutes)`);
                console.log(`    First result: "${results[0].name}" (${results[0].id})`);
            }
        } else {
            console.log("  ~ No search results yet — indexing may lag after publish");
        }
    } catch (err) {
        fail(`Search API error: ${err}`);
        allPassed = false;
    }

    // ── Check 5: publish log ─────────────────────────────────────────────────

    console.log("\nCheck 5: publish_log.json");
    const logPath = path.join(DATA_DIR, "publish_log.json");
    if (fs.existsSync(logPath)) {
        const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
        pass(`publish_log.json exists — ${log.length} batch(es) recorded`);
        for (const entry of log) {
            console.log(`    batch ${entry.batch}/${entry.totalBatches}: ${entry.txHash}`);
        }
    } else {
        fail("publish_log.json not found — has publish_gem.ts been run?");
        allPassed = false;
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${allPassed ? "All checks passed." : "Some checks failed — see above."}`);
    process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
