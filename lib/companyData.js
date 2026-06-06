// lib/companyData.js — the consumption layer. Tools call useCompanyData() to read master data
// live from the editable cfg_* collections, with the bundled lib/docgen.js arrays as the seed
// fallback so everything works from first deploy through to full population.
"use client";
import { useEffect, useState } from "react";
import { listenCfgEntities } from "./data";
import { ENTITIES } from "./docgen";

export function useCompanyData() {
  const [raw, setRaw] = useState(null); // null = still loading

  useEffect(() => listenCfgEntities(setRaw), []);

  const seeded = !!(raw && raw.length);
  // Live entities (active only) when populated; otherwise the bundled seed.
  const entities = seeded
    ? raw.filter((e) => e.status !== "archived")
    : ENTITIES.map((e) => ({ _id: e.code, code: e.code, name: e.name }));

  return { entities, seeded, loading: raw === null };
}
