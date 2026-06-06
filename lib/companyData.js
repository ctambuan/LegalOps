// lib/companyData.js — the consumption layer. Tools call useCompanyData() to read master data
// live from the editable cfg_* collections, with the bundled lib/docgen.js arrays as the seed
// fallback so everything works from first deploy through to full population.
"use client";
import { useEffect, useMemo, useState } from "react";
import { listenCfgEntities, listenCfgApprovals, listenCfgThresholds } from "./data";
import { ENTITIES, DEFAULT_THRESHOLDS } from "./docgen";

export function useCompanyData() {
  const [rawEntities, setRawEntities] = useState(null); // null = still loading
  const [rawApprovals, setRawApprovals] = useState(null);
  const [rawThresholds, setRawThresholds] = useState(null);

  useEffect(() => listenCfgEntities(setRawEntities), []);
  useEffect(() => listenCfgApprovals(setRawApprovals), []);
  useEffect(() => listenCfgThresholds(setRawThresholds), []);

  const seeded = !!(rawEntities && rawEntities.length);
  const entities = seeded
    ? rawEntities.filter((e) => e.status !== "archived")
    : ENTITIES.map((e) => ({ _id: e.code, code: e.code, name: e.name }));

  // Approval matrix keyed by department NAME → {admin, low, mid, high} (only the edited cells; the
  // pure businessApprovers() merges these over the workbook defaults). Empty until seeded → defaults apply.
  const approvals = useMemo(() => {
    const m = {};
    (rawApprovals || []).forEach((a) => {
      m[a.department] = { admin: a.admin, low: a.low, mid: a.mid, high: a.high };
    });
    return m;
  }, [rawApprovals]);

  const thresholds = rawThresholds && rawThresholds.low != null
    ? { low: Number(rawThresholds.low), high: Number(rawThresholds.high) }
    : DEFAULT_THRESHOLDS;

  return {
    entities, approvals, thresholds,
    seeded, loading: rawEntities === null,
  };
}
