type MetricDefinition = {
  taxonomy: string;
  concepts: string[];
  periodKind: "DURATION" | "INSTANT";
};

const METRICS: Record<string, MetricDefinition[]> = {
  revenue: [
    { taxonomy: "us-gaap", concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "SalesRevenueGoodsNet", "SalesRevenueServicesNet"], periodKind: "DURATION" },
    { taxonomy: "ifrs-full", concepts: ["Revenue"], periodKind: "DURATION" },
  ],
  operatingIncome: [
    { taxonomy: "us-gaap", concepts: ["OperatingIncomeLoss"], periodKind: "DURATION" },
    { taxonomy: "ifrs-full", concepts: ["OperatingProfitLoss"], periodKind: "DURATION" },
  ],
  netIncome: [
    { taxonomy: "us-gaap", concepts: ["NetIncomeLoss", "ProfitLoss"], periodKind: "DURATION" },
    { taxonomy: "ifrs-full", concepts: ["ProfitLoss"], periodKind: "DURATION" },
  ],
  cashAndCashEquivalents: [
    { taxonomy: "us-gaap", concepts: ["CashAndCashEquivalentsAtCarryingValue"], periodKind: "INSTANT" },
    { taxonomy: "ifrs-full", concepts: ["CashAndCashEquivalents"], periodKind: "INSTANT" },
  ],
  operatingCashFlow: [
    { taxonomy: "us-gaap", concepts: ["NetCashProvidedByUsedInOperatingActivities"], periodKind: "DURATION" },
    { taxonomy: "ifrs-full", concepts: ["CashFlowsFromUsedInOperatingActivities"], periodKind: "DURATION" },
  ],
};

type FactObservation = {
  val: unknown;
  end: unknown;
  start?: unknown;
  filed?: unknown;
  form?: unknown;
  accn?: unknown;
  fy?: unknown;
  fp?: unknown;
  frame?: unknown;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function dateString(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function factCurrencyUnits(units: Record<string, unknown>, preferredCurrency: string | null) {
  const keys = Object.keys(units);
  const preferred = preferredCurrency?.trim().toUpperCase();
  return keys.sort((a, b) => {
    const rank = (unit: string) => unit === preferred ? 0 : unit === "USD" ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}

function latestObservation(values: unknown, periodKind: "DURATION" | "INSTANT"): FactObservation | null {
  if (!Array.isArray(values)) return null;
  const candidates = (values as FactObservation[]).filter((item) => {
    const end = dateString(item?.end);
    const filed = dateString(item?.filed);
    const value = typeof item?.val === "number"
      ? item.val
      : typeof item?.val === "string" && item.val.trim() !== "" ? Number(item.val) : NaN;
    if (!end || !filed || !Number.isFinite(value)) return false;
    return periodKind === "INSTANT" ? !item.start : Boolean(dateString(item.start));
  });
  candidates.sort((a, b) => {
    const byPeriod = String(b.end).localeCompare(String(a.end));
    if (byPeriod) return byPeriod;
    const byFiled = String(b.filed).localeCompare(String(a.filed));
    if (byFiled) return byFiled;
    return String(b.accn ?? "").localeCompare(String(a.accn ?? ""));
  });
  return candidates[0] ?? null;
}

/** Extracts a compact set of standard, company-wide SEC facts without inferring missing values. */
export function summarizeSecCompanyFacts(payload: unknown, preferredCurrency: string | null) {
  const root = object(payload);
  const facts = object(root?.facts);
  if (!root || !facts) return null;

  const metrics: Record<string, unknown> = {};
  for (const [metric, definitions] of Object.entries(METRICS)) {
    const candidates: Array<{ fact: FactObservation; unit: string; taxonomy: string; concept: string; priority: number; unitPriority: number }> = [];
    let priority = 0;
    for (const definition of definitions) {
      const taxonomy = object(facts[definition.taxonomy]);
      for (const concept of definition.concepts) {
        const detail = object(taxonomy?.[concept]);
        const units = object(detail?.units);
        if (units) {
          for (const [unitPriority, unit] of factCurrencyUnits(units, preferredCurrency).entries()) {
            const fact = latestObservation(units[unit], definition.periodKind);
            if (fact) candidates.push({ fact, unit, taxonomy: definition.taxonomy, concept, priority, unitPriority });
          }
        }
        priority += 1;
      }
    }
    candidates.sort((a, b) => {
      const byPeriod = String(b.fact.end).localeCompare(String(a.fact.end));
      if (byPeriod) return byPeriod;
      const byFiled = String(b.fact.filed).localeCompare(String(a.fact.filed));
      if (byFiled) return byFiled;
      return a.priority - b.priority || a.unitPriority - b.unitPriority;
    });
    const selected = candidates[0];
    if (!selected) {
      metrics[metric] = null;
      continue;
    }
    const { fact, unit, taxonomy, concept } = selected;
    metrics[metric] = {
      value: String(fact.val),
      unit,
      taxonomy,
      concept,
      periodKind: dateString(fact.start) ? "DURATION" : "INSTANT",
      periodStart: dateString(fact.start),
      periodEnd: dateString(fact.end),
      filedAt: dateString(fact.filed),
      form: typeof fact.form === "string" ? fact.form : null,
      accessionNumber: typeof fact.accn === "string" ? fact.accn : null,
      fiscalYear: typeof fact.fy === "number" ? fact.fy : null,
      fiscalPeriod: typeof fact.fp === "string" ? fact.fp : null,
      frame: typeof fact.frame === "string" ? fact.frame : null,
    };
  }

  return { entityName: typeof root.entityName === "string" ? root.entityName : null, metrics };
}
