/**
 * Read data/iml1515.json and generate all geo-sdk ops for the E. coli GEM.
 *
 * Schema created:
 *   - Properties:      one per PROPERTY_IDS entry (TEXT or FLOAT)
 *   - Relation props:  one per RELATION_TYPE_IDS entry (RELATION data type)
 *   - Types:           one per ENTITY_TYPE_IDS entry, linked to relevant properties
 *
 * Data created:
 *   - Compartment, Subsystem, Gene, Metabolite, Reaction entities
 *
 * Relations created:
 *   - PART_OF:      Metabolite → Compartment, Reaction → Subsystem  (inline on entity)
 *   - CATALYSED_BY: Reaction → Gene(s)                               (inline on entity)
 *   - SUBSTRATE_OF: Metabolite → Reaction  (+stoichiometry value)    (Graph.createRelation)
 *   - PRODUCT_OF:   Metabolite → Reaction  (+stoichiometry value)    (Graph.createRelation)
 */

import { Graph, type Op } from "@geoprotocol/geo-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    ENTITY_TYPE_IDS,
    ORGANISM_NAME,
    PROPERTY_IDS,
    RELATION_TYPE_IDS,
    makeEntityId,
} from "./ontology.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

// ── JSON shape ───────────────────────────────────────────────────────────────

interface Metabolite {
    id: string;
    name: string;
    compartment: string;
    formula: string;
    charge: number;
}

interface Reaction {
    id: string;
    name: string;
    subsystem: string;
    lower_bound: number;
    upper_bound: number;
    gene_reaction_rule: string;
    metabolites: Record<string, number>;
}

interface Gene {
    id: string;
    name: string;
}

interface GemData {
    metabolites: Metabolite[];
    reactions: Reaction[];
    genes: Gene[];
}

// ── Schema labels ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<keyof typeof ENTITY_TYPE_IDS, string> = {
    METABOLITE: "Metabolite",
    REACTION: "Reaction",
    GENE: "Gene",
    COMPARTMENT: "Compartment",
    SUBSYSTEM: "Subsystem",
};

const PROPERTY_LABELS: Record<keyof typeof PROPERTY_IDS, string> = {
    BIGG_ID: "BiGG ID",
    COMMON_NAME: "Common Name",
    FORMULA: "Formula",
    CHARGE: "Charge",
    COMPARTMENT_CODE: "Compartment Code",
    LOWER_BOUND: "Lower Bound",
    UPPER_BOUND: "Upper Bound",
    GENE_REACTION_RULE: "Gene Reaction Rule",
    STOICHIOMETRY: "Stoichiometry",
    ORGANISM: "Organism",
};

const PROPERTY_DATATYPES: Record<keyof typeof PROPERTY_IDS, "TEXT" | "FLOAT"> = {
    BIGG_ID: "TEXT",
    COMMON_NAME: "TEXT",
    FORMULA: "TEXT",
    CHARGE: "FLOAT",
    COMPARTMENT_CODE: "TEXT",
    LOWER_BOUND: "FLOAT",
    UPPER_BOUND: "FLOAT",
    GENE_REACTION_RULE: "TEXT",
    STOICHIOMETRY: "FLOAT",
    ORGANISM: "TEXT",
};

const RELATION_LABELS: Record<keyof typeof RELATION_TYPE_IDS, string> = {
    SUBSTRATE_OF: "substrate of",
    PRODUCT_OF: "product of",
    CATALYSED_BY: "catalysed by",
    PART_OF: "part of",
};

// Properties attached to each entity type in the schema
const TYPE_PROPERTIES: Record<keyof typeof ENTITY_TYPE_IDS, string[]> = {
    METABOLITE: [
        PROPERTY_IDS.BIGG_ID,
        PROPERTY_IDS.COMMON_NAME,
        PROPERTY_IDS.FORMULA,
        PROPERTY_IDS.CHARGE,
        PROPERTY_IDS.ORGANISM,
    ],
    REACTION: [
        PROPERTY_IDS.BIGG_ID,
        PROPERTY_IDS.LOWER_BOUND,
        PROPERTY_IDS.UPPER_BOUND,
        PROPERTY_IDS.GENE_REACTION_RULE,
        PROPERTY_IDS.ORGANISM,
    ],
    GENE: [PROPERTY_IDS.BIGG_ID, PROPERTY_IDS.ORGANISM],
    COMPARTMENT: [PROPERTY_IDS.BIGG_ID, PROPERTY_IDS.COMPARTMENT_CODE, PROPERTY_IDS.ORGANISM],
    SUBSYSTEM: [PROPERTY_IDS.BIGG_ID, PROPERTY_IDS.ORGANISM],
};

// ── Gene rule parser ─────────────────────────────────────────────────────────

function parseGeneIds(rule: string): string[] {
    if (!rule.trim()) return [];
    return rule
        .replace(/[()]/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t && t !== "and" && t !== "or");
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface GenerateResult {
    ops: Op[];
    entityIdMap: Record<string, string>;
}

export function generateOps(): GenerateResult {
    const gemPath = path.join(DATA_DIR, "iml1515.json");
    if (!fs.existsSync(gemPath)) {
        throw new Error("data/iml1515.json not found — run `npm run parse` first");
    }
    const gem: GemData = JSON.parse(fs.readFileSync(gemPath, "utf8"));

    const allOps: Op[] = [];
    const entityIdMap: Record<string, string> = {};

    // ── 1. Schema: value properties ───────────────────────────────────────────

    for (const key of Object.keys(PROPERTY_IDS) as (keyof typeof PROPERTY_IDS)[]) {
        const { ops } = Graph.createProperty({
            id: PROPERTY_IDS[key],
            name: PROPERTY_LABELS[key],
            dataType: PROPERTY_DATATYPES[key],
        });
        allOps.push(...ops);
    }

    // ── 2. Schema: relation-type properties ───────────────────────────────────

    for (const key of Object.keys(RELATION_TYPE_IDS) as (keyof typeof RELATION_TYPE_IDS)[]) {
        const { ops } = Graph.createProperty({
            id: RELATION_TYPE_IDS[key],
            name: RELATION_LABELS[key],
            dataType: "RELATION",
        });
        allOps.push(...ops);
    }

    // ── 3. Schema: entity types ───────────────────────────────────────────────

    for (const key of Object.keys(ENTITY_TYPE_IDS) as (keyof typeof ENTITY_TYPE_IDS)[]) {
        const { ops } = Graph.createType({
            id: ENTITY_TYPE_IDS[key],
            name: TYPE_LABELS[key],
            properties: TYPE_PROPERTIES[key],
        });
        allOps.push(...ops);
    }

    // ── 4. Compartments ───────────────────────────────────────────────────────

    const COMPARTMENT_NAMES: Record<string, string> = {
        c: "Cytoplasm",
        e: "Extracellular",
        p: "Periplasm",
        m: "Mitochondria",
        x: "Peroxisome",
        n: "Nucleus",
    };

    const compartmentCodes = [...new Set(gem.metabolites.map((m) => m.compartment))];
    for (const code of compartmentCodes) {
        const entityId = makeEntityId("compartment", code);
        entityIdMap[`compartment:${code}`] = entityId;

        const { ops } = Graph.createEntity({
            id: entityId,
            name: COMPARTMENT_NAMES[code] ?? code,
            types: [ENTITY_TYPE_IDS.COMPARTMENT],
            values: [
                { property: PROPERTY_IDS.BIGG_ID, type: "text", value: code },
                { property: PROPERTY_IDS.COMPARTMENT_CODE, type: "text", value: code },
                { property: PROPERTY_IDS.ORGANISM, type: "text", value: ORGANISM_NAME },
            ],
        });
        allOps.push(...ops);
    }

    // ── 5. Subsystems ─────────────────────────────────────────────────────────

    const subsystems = [...new Set(gem.reactions.map((r) => r.subsystem).filter(Boolean))];
    for (const name of subsystems) {
        const entityId = makeEntityId("subsystem", name);
        entityIdMap[`subsystem:${name}`] = entityId;

        const { ops } = Graph.createEntity({
            id: entityId,
            name,
            types: [ENTITY_TYPE_IDS.SUBSYSTEM],
            values: [
                { property: PROPERTY_IDS.BIGG_ID, type: "text", value: name },
                { property: PROPERTY_IDS.ORGANISM, type: "text", value: ORGANISM_NAME },
            ],
        });
        allOps.push(...ops);
    }

    // ── 6. Genes ──────────────────────────────────────────────────────────────

    for (const gene of gem.genes) {
        const entityId = makeEntityId("gene", gene.id);
        entityIdMap[gene.id] = entityId;

        const { ops } = Graph.createEntity({
            id: entityId,
            name: gene.name || gene.id,
            types: [ENTITY_TYPE_IDS.GENE],
            values: [
                { property: PROPERTY_IDS.BIGG_ID, type: "text", value: gene.id },
                { property: PROPERTY_IDS.ORGANISM, type: "text", value: ORGANISM_NAME },
            ],
        });
        allOps.push(...ops);
    }

    // ── 7. Metabolites ────────────────────────────────────────────────────────

    for (const met of gem.metabolites) {
        const entityId = makeEntityId("metabolite", met.id);
        entityIdMap[met.id] = entityId;

        const compartmentEntityId = entityIdMap[`compartment:${met.compartment}`];

        const values: Parameters<typeof Graph.createEntity>[0]["values"] = [
            { property: PROPERTY_IDS.BIGG_ID, type: "text", value: met.id },
            { property: PROPERTY_IDS.COMMON_NAME, type: "text", value: met.name || met.id },
            { property: PROPERTY_IDS.CHARGE, type: "float", value: met.charge },
            { property: PROPERTY_IDS.ORGANISM, type: "text", value: ORGANISM_NAME },
        ];
        if (met.formula) {
            values.push({ property: PROPERTY_IDS.FORMULA, type: "text", value: met.formula });
        }

        const { ops } = Graph.createEntity({
            id: entityId,
            name: met.name || met.id,
            types: [ENTITY_TYPE_IDS.METABOLITE],
            values,
            relations: compartmentEntityId
                ? { [RELATION_TYPE_IDS.PART_OF]: { toEntity: compartmentEntityId } }
                : undefined,
        });
        allOps.push(...ops);
    }

    // ── 8. Reactions ──────────────────────────────────────────────────────────

    for (const rxn of gem.reactions) {
        const entityId = makeEntityId("reaction", rxn.id);
        entityIdMap[rxn.id] = entityId;

        const values: Parameters<typeof Graph.createEntity>[0]["values"] = [
            { property: PROPERTY_IDS.BIGG_ID, type: "text", value: rxn.id },
            { property: PROPERTY_IDS.LOWER_BOUND, type: "float", value: rxn.lower_bound },
            { property: PROPERTY_IDS.UPPER_BOUND, type: "float", value: rxn.upper_bound },
            { property: PROPERTY_IDS.ORGANISM, type: "text", value: ORGANISM_NAME },
        ];
        if (rxn.gene_reaction_rule) {
            values.push({ property: PROPERTY_IDS.GENE_REACTION_RULE, type: "text", value: rxn.gene_reaction_rule });
        }

        // Build inline relations: PART_OF subsystem + CATALYSED_BY gene(s)
        const relations: Parameters<typeof Graph.createEntity>[0]["relations"] = {};

        if (rxn.subsystem) {
            const subsystemEntityId = entityIdMap[`subsystem:${rxn.subsystem}`];
            if (subsystemEntityId) {
                relations[RELATION_TYPE_IDS.PART_OF] = { toEntity: subsystemEntityId };
            }
        }

        const catalysts = parseGeneIds(rxn.gene_reaction_rule)
            .map((geneId) => entityIdMap[geneId])
            .filter(Boolean)
            .map((geneEntityId) => ({ toEntity: geneEntityId }));

        if (catalysts.length > 0) {
            relations[RELATION_TYPE_IDS.CATALYSED_BY] = catalysts;
        }

        const { ops } = Graph.createEntity({
            id: entityId,
            name: rxn.name || rxn.id,
            types: [ENTITY_TYPE_IDS.REACTION],
            values,
            relations,
        });
        allOps.push(...ops);
    }

    // ── 9. Stoichiometry relations ────────────────────────────────────────────
    // Created separately so stoichiometry can be set on the relation entity itself.

    for (const rxn of gem.reactions) {
        const rxnEntityId = entityIdMap[rxn.id];
        if (!rxnEntityId) continue;

        for (const [metBiggId, stoich] of Object.entries(rxn.metabolites)) {
            const metEntityId = entityIdMap[metBiggId];
            if (!metEntityId) continue;

            const relTypeId = stoich < 0 ? RELATION_TYPE_IDS.SUBSTRATE_OF : RELATION_TYPE_IDS.PRODUCT_OF;

            const { ops } = Graph.createRelation({
                fromEntity: metEntityId,
                toEntity: rxnEntityId,
                type: relTypeId,
                entityValues: [
                    { property: PROPERTY_IDS.STOICHIOMETRY, type: "float", value: Math.abs(stoich) },
                ],
            });
            allOps.push(...ops);
        }
    }

    // ── Write entity ID map ───────────────────────────────────────────────────

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "entity_id_map.json"), JSON.stringify(entityIdMap, null, 2));
    console.log(`Entity ID map written — ${Object.keys(entityIdMap).length} entries`);

    return { ops: allOps, entityIdMap };
}

/** Split ops into chunks of `size` for batched publishing. */
export function chunkOps(ops: Op[], size = 500): Op[][] {
    const chunks: Op[][] = [];
    for (let i = 0; i < ops.length; i += size) {
        chunks.push(ops.slice(i, i + size));
    }
    return chunks;
}

// Allow running directly: npx tsx src/generate_ops.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { ops } = generateOps();
    console.log(`Total ops generated: ${ops.length}`);
}
