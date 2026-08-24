"use client";
import { useState } from "react";
export function MultiTimeframeReboundCopy({ text }: { text: string }) { const [label, setLabel] = useState("결과 복사"); return <button type="button" onClick={async () => { await navigator.clipboard.writeText(text); setLabel("복사 완료"); setTimeout(() => setLabel("결과 복사"), 1500); }} style={{padding:"10px 16px",borderRadius:8,cursor:"pointer"}}>{label}</button>; }
