"""
Download the Keio E. coli gene-fitness data, map gene scores to reactions via
gene_reaction_rule, and export data/keio_perturbations.json for visualise.html.

Usage:
    python3 fetch_keio.py
"""

import json
import math
import os
import re
import urllib.request
from collections import defaultdict

KEIO_TSV_URL = (
    "https://raw.githubusercontent.com/dbernste/E_coli_GEM_validation/"
    "main/Fitness_Data/E_coli_BW25113/fit_organism_Keio.tsv"
)
EXP_META_URL = (
    "https://raw.githubusercontent.com/dbernste/E_coli_GEM_validation/"
    "main/Fitness_Data/E_coli_BW25113/exp_organism_Keio_Mapped.txt"
)
GEM_PATH = "data/iml1515.json"
OUT_PATH = "data/keio_perturbations.json"

# Conditions to exclude (not metabolic-flux-relevant)
EXCLUDE_GROUPS = {"lb", "motility"}

# Baseline condition label (glucose minimal media)
BASELINE_LABEL = "D-Glucose (C)"


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch(url: str) -> str:
    print(f"  Downloading {url.split('/')[-1]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "geo-gem/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_rule_genes(rule: str) -> list[str]:
    """Return all b-number gene IDs mentioned in a gene_reaction_rule."""
    return re.findall(r'b\d+', rule)


def eval_rule(rule: str, gene_scores: dict[str, float]) -> float:
    """
    Evaluate a gene_reaction_rule string and return a representative fitness score.

    Scoring semantics:
      AND group  → minimum of member scores (weakest-link: any subunit knockout matters)
      OR  groups → maximum of AND-group scores (isozymes buffer each other; the
                   most-buffered knockout survives, so we take the highest/least-negative)

    Genes absent from the Keio data are treated as NaN and excluded from aggregation.
    Returns NaN if no genes in the rule have data.
    """
    rule = rule.strip()
    if not rule:
        return float("nan")

    def score_of(gene: str) -> float:
        return gene_scores.get(gene.strip(), float("nan"))

    def eval_and_group(expr: str) -> float:
        genes = [g.strip() for g in expr.split(" and ") if g.strip()]
        scores = [score_of(g) for g in genes]
        valid = [s for s in scores if not math.isnan(s)]
        return min(valid) if valid else float("nan")

    def eval_expr(expr: str) -> float:
        expr = expr.strip()
        # Strip outer parens
        while expr.startswith("(") and expr.endswith(")"):
            inner = expr[1:-1]
            # Make sure they're matching parens
            depth = 0
            matched = True
            for ch in inner:
                if ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                if depth < 0:
                    matched = False
                    break
            if matched and depth == 0:
                expr = inner
            else:
                break

        # Split by ' or ' at depth 0
        or_parts = []
        current = []
        depth = 0
        tokens = re.split(r'(\(|\))', expr)
        # Use a character-level split instead
        i = 0
        part_start = 0
        while i < len(expr):
            if expr[i] == "(":
                depth += 1
            elif expr[i] == ")":
                depth -= 1
            elif expr[i:i+4] == " or " and depth == 0:
                or_parts.append(expr[part_start:i])
                part_start = i + 4
                i += 3
            i += 1
        or_parts.append(expr[part_start:])

        if len(or_parts) > 1:
            scores = [eval_expr(p) for p in or_parts]
            valid = [s for s in scores if not math.isnan(s)]
            return max(valid) if valid else float("nan")  # OR → max
        else:
            # Single OR part — may contain AND
            return eval_and_group(expr)

    return eval_expr(rule)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    # ── 1. Download data ──────────────────────────────────────────────────────
    print("Fetching Keio fitness data...")
    tsv_raw = fetch(KEIO_TSV_URL)
    meta_raw = fetch(EXP_META_URL)

    # ── 2. Parse experiment metadata ─────────────────────────────────────────
    meta_lines = meta_raw.splitlines()
    meta_header = meta_lines[0].split("\t")
    col = {h: i for i, h in enumerate(meta_header)}

    exp_info: dict[str, dict] = {}  # expName → {label, group}
    for line in meta_lines[1:]:
        if not line.strip():
            continue
        parts = line.split("\t")
        name  = parts[col["expName"]]
        label = parts[col["expDesc"]]
        group = parts[col["expGroup"]].lower().strip()
        exp_info[name] = {"label": label, "group": group}

    # ── 3. Parse TSV ─────────────────────────────────────────────────────────
    lines = tsv_raw.splitlines()
    header = lines[0].split("\t")
    # Columns 0-4 are metadata; remainder are experiment columns
    exp_cols = header[5:]  # list of "setXITYYY Label" strings

    # Build: gene_sysname → condition_label → list of scores (for averaging replicates)
    gene_scores_raw: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split("\t")
        sys_name = parts[2]  # e.g. "b0001"
        if not sys_name:
            continue
        for i, col_header in enumerate(exp_cols):
            exp_name = col_header.split(" ")[0]  # e.g. "set1IT003"
            info = exp_info.get(exp_name)
            if info is None or info["group"] in EXCLUDE_GROUPS:
                continue
            val_str = parts[5 + i] if 5 + i < len(parts) else ""
            try:
                val = float(val_str)
                gene_scores_raw[sys_name][info["label"]].append(val)
            except ValueError:
                pass

    # Average replicates
    gene_scores: dict[str, dict[str, float]] = {}
    for gene, cond_map in gene_scores_raw.items():
        gene_scores[gene] = {
            label: sum(vals) / len(vals) for label, vals in cond_map.items()
        }

    # Collect all unique condition labels (preserve insertion order)
    all_conditions_ordered: list[str] = []
    seen_labels: set[str] = set()
    for line in lines[1:1]:  # just get order from exp_info
        pass
    # Rebuild order from exp_info (metadata order)
    for exp_name, info in exp_info.items():
        if info["group"] not in EXCLUDE_GROUPS and info["label"] not in seen_labels:
            all_conditions_ordered.append(info["label"])
            seen_labels.add(info["label"])

    # Build group lookup
    label_to_group: dict[str, str] = {}
    for info in exp_info.values():
        label_to_group[info["label"]] = info["group"]

    print(f"  Parsed {len(gene_scores)} genes × {len(all_conditions_ordered)} conditions")

    # ── 4. Load GEM ───────────────────────────────────────────────────────────
    print(f"Loading {GEM_PATH}...")
    with open(GEM_PATH) as f:
        gem = json.load(f)

    # ── 5. Map genes → reactions ──────────────────────────────────────────────
    print("Computing reaction scores per condition...")
    reaction_scores: dict[str, dict[str, float]] = {}

    for rxn in gem["reactions"]:
        rule = rxn.get("gene_reaction_rule", "")
        if not rule:
            continue
        rxn_id = rxn["id"]
        scores_by_cond: dict[str, float] = {}
        for label in all_conditions_ordered:
            # Build per-gene score dict for this condition
            per_gene = {
                gene: scores[label]
                for gene, scores in gene_scores.items()
                if label in scores
            }
            s = eval_rule(rule, per_gene)
            if not math.isnan(s):
                scores_by_cond[label] = round(s, 4)
        if scores_by_cond:
            reaction_scores[rxn_id] = scores_by_cond

    print(f"  Scored {len(reaction_scores)} reactions")

    # ── 6. Validate baseline ──────────────────────────────────────────────────
    if BASELINE_LABEL not in all_conditions_ordered:
        raise ValueError(
            f"Baseline condition '{BASELINE_LABEL}' not found. "
            f"Available: {all_conditions_ordered[:5]}"
        )

    # ── 7. Build condition list ───────────────────────────────────────────────
    conditions = [
        {"key": label, "label": label, "group": label_to_group.get(label, "")}
        for label in all_conditions_ordered
    ]

    # ── 8. Export ─────────────────────────────────────────────────────────────
    out = {
        "baseline": BASELINE_LABEL,
        "conditions": conditions,
        "reaction_scores": reaction_scores,
    }

    os.makedirs("data", exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(f"Written {OUT_PATH} ({size_kb:.0f} KB)")
    print(f"  {len(conditions)} conditions, {len(reaction_scores)} reactions scored")


if __name__ == "__main__":
    main()
