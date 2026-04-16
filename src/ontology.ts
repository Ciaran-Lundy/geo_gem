import { v5 as uuidv5 } from "uuid";

// Fixed namespace UUID (RFC 4122 DNS namespace) — do not change or all IDs will shift
const GEM_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function makeId(name: string): string {
    // UUIDv5 without dashes = 32 hex chars, compatible with geo-sdk's Id type
    return uuidv5(name, GEM_NAMESPACE).replace(/-/g, "");
}

// ── Entity Type IDs ──────────────────────────────────────────────────────────

export const ENTITY_TYPE_IDS = {
    METABOLITE: makeId("type:Metabolite"),
    REACTION: makeId("type:Reaction"),
    GENE: makeId("type:Gene"),
    COMPARTMENT: makeId("type:Compartment"),
    SUBSYSTEM: makeId("type:Subsystem"),
} as const;

// ── Property IDs ─────────────────────────────────────────────────────────────

export const PROPERTY_IDS = {
    BIGG_ID: makeId("attr:bigg_id"),
    COMMON_NAME: makeId("attr:common_name"),
    FORMULA: makeId("attr:formula"),
    CHARGE: makeId("attr:charge"),
    COMPARTMENT_CODE: makeId("attr:compartment_code"),
    LOWER_BOUND: makeId("attr:lower_bound"),
    UPPER_BOUND: makeId("attr:upper_bound"),
    GENE_REACTION_RULE: makeId("attr:gene_reaction_rule"),
    STOICHIOMETRY: makeId("attr:stoichiometry"),
    ORGANISM: makeId("attr:organism"),
    SUBSYSTEM_NAME: makeId("attr:subsystem_name"),
} as const;

// ── Relation Type IDs (defined as RELATION-typed properties in geo-sdk) ──────

export const RELATION_TYPE_IDS = {
    SUBSTRATE_OF: makeId("rel:substrate_of"),
    PRODUCT_OF: makeId("rel:product_of"),
    CATALYSED_BY: makeId("rel:catalysed_by"),
    PART_OF: makeId("rel:part_of"),
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

export const ORGANISM_NAME = "Escherichia coli K-12 MG1655";

/** Deterministic entity ID for any bigg-namespaced entity (stable across runs). */
export function makeEntityId(category: string, biggId: string): string {
    return makeId(`entity:${category}:${biggId}`);
}
