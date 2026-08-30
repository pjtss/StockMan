"use client";

import { useEffect, useState } from "react";
import { DragonThreatOverlay } from "@/components/dragon-threat-overlay";

export function ChartsEntryDragon() {
  const [trigger, setTrigger] = useState(0);
  useEffect(() => setTrigger((value) => value + 1), []);
  return <DragonThreatOverlay trigger={trigger} />;
}
