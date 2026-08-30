"use client";

import { useEffect, useState } from "react";
import { DragonThreatOverlay } from "@/components/dragon-threat-overlay";
import { FireworksOverlay } from "@/components/fireworks-overlay";

type Effect = "dragon" | "fireworks" | "meteor" | "pulse";

export function ChartsEntryEffects() {
  const [effect, setEffect] = useState<Effect | null>(null);
  const [trigger, setTrigger] = useState(0);
  useEffect(() => { setEffect(["dragon", "fireworks", "meteor", "pulse"][Math.floor(Math.random() * 4)] as Effect); setTrigger(1); }, []);
  if (!effect) return null;
  if (effect === "dragon") return <DragonThreatOverlay trigger={trigger} />;
  if (effect === "fireworks") return <FireworksOverlay trigger={trigger} />;
  return <div className={`chartsEntryEffect chartsEntryEffect-${effect}`} aria-hidden="true"><span /><span /><span /><span /><span /></div>;
}
