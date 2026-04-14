"""
Parse the iML1515 E. coli genome-scale metabolic model from the BiGG JSON API
and export a clean JSON intermediate to data/iml1515.json.

The BiGG JSON format carries subsystem annotations that are absent from the
SBML/COBRApy loaded version.

Usage:
    python3 parse_model.py
"""

import json
import os
import urllib.request

BIGG_MODEL_URL = "https://raw.githubusercontent.com/SBRG/bigg_models_data/master/models/iML1515.json"
OUT_PATH = "data/iml1515.json"


def fetch_bigg_model(url: str) -> dict:
    print(f"Downloading iML1515 from BiGG ({url})...")
    req = urllib.request.Request(url, headers={"User-Agent": "geo-gem-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read()
    print(f"  Downloaded {len(raw) / 1024:.0f} KB")
    return json.loads(raw)


def main() -> None:
    raw = fetch_bigg_model(BIGG_MODEL_URL)

    data: dict = {"metabolites": [], "reactions": [], "genes": []}

    # ── Metabolites ───────────────────────────────────────────────────────────
    for met in raw.get("metabolites", []):
        data["metabolites"].append(
            {
                "id": met["id"],
                "name": met.get("name") or met["id"],
                "compartment": met.get("compartment", ""),
                "formula": met.get("formula") or "",
                "charge": int(met["charge"]) if met.get("charge") is not None else 0,
            }
        )

    # ── Reactions ─────────────────────────────────────────────────────────────
    for rxn in raw.get("reactions", []):
        # BiGG JSON stores subsystem under the key "subsystem" at the top level
        subsystem = rxn.get("subsystem") or ""

        data["reactions"].append(
            {
                "id": rxn["id"],
                "name": rxn.get("name") or rxn["id"],
                "subsystem": subsystem,
                "lower_bound": float(rxn.get("lower_bound", 0)),
                "upper_bound": float(rxn.get("upper_bound", 1000)),
                "gene_reaction_rule": rxn.get("gene_reaction_rule") or "",
                # stoich values: negative = substrate, positive = product
                "metabolites": {k: float(v) for k, v in rxn.get("metabolites", {}).items()},
            }
        )

    # ── Genes ─────────────────────────────────────────────────────────────────
    for gene in raw.get("genes", []):
        data["genes"].append(
            {
                "id": gene["id"],
                "name": gene.get("name") or gene["id"],
            }
        )

    os.makedirs("data", exist_ok=True)
    with open(OUT_PATH, "w") as fh:
        json.dump(data, fh, indent=2)

    subsystem_count = len({r["subsystem"] for r in data["reactions"] if r["subsystem"]})
    print(
        f"Exported {len(data['metabolites'])} metabolites, "
        f"{len(data['reactions'])} reactions, "
        f"{len(data['genes'])} genes, "
        f"{subsystem_count} subsystems → {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
