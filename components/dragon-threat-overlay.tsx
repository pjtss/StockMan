"use client";

import { useEffect, useRef } from "react";

export function DragonThreatOverlay({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousTrigger = useRef(trigger);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trigger === previousTrigger.current) return;
    previousTrigger.current = trigger;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.dataset.active = "true";
    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 1300 : 3300;
    let frame = 0;
    const polygon = (points: [number, number][]) => {
      context.beginPath();
      points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
      context.closePath(); context.fill();
    };
    const render = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const entrance = Math.min(1, progress / 0.28);
      const exit = progress > 0.68 ? 1 - (progress - 0.68) / 0.32 : 1;
      const threat = Math.min(1, Math.max(0, (progress - 0.25) / 0.25));
      const breath = 1 + Math.sin(progress * Math.PI * 9) * 0.018 * threat;
      const unit = Math.min(width, height) / 620 * entrance * breath;
      context.clearRect(0, 0, width, height);
      context.save(); context.globalAlpha = Math.max(0, exit) * 0.97;
      context.translate(width / 2, height * 0.49 + (1 - entrance) * height * 0.16); context.scale(unit, unit);
      context.shadowColor = "rgba(2, 8, 7, .9)"; context.shadowBlur = 30;
      const skin = context.createLinearGradient(-180, -260, 180, 240);
      skin.addColorStop(0, "#1c3a35"); skin.addColorStop(0.5, "#071613"); skin.addColorStop(1, "#010504");
      context.fillStyle = skin;
      polygon([[-165,-205],[-105,-270],[-48,-228],[0,-258],[48,-228],[105,-270],[165,-205],[142,5],[112,172],[0,236],[-112,172],[-142,5]]);
      context.fillStyle = "#0b241f";
      polygon([[-142,-174],[-224,-300],[-108,-244],[-70,-174]]); polygon([[142,-174],[224,-300],[108,-244],[70,-174]]);
      context.fillStyle = "#b7eee0"; context.shadowColor = "rgba(75,255,195,.9)"; context.shadowBlur = 20;
      context.beginPath(); context.ellipse(-67,-92,28,38,-0.2,0,Math.PI*2); context.fill();
      context.beginPath(); context.ellipse(67,-92,28,38,0.2,0,Math.PI*2); context.fill();
      context.fillStyle = "#030706"; context.shadowBlur = 0;
      context.beginPath(); context.ellipse(-67,-89,6,27,0,0,Math.PI*2); context.fill();
      context.beginPath(); context.ellipse(67,-89,6,27,0,0,Math.PI*2); context.fill();
      const jaw = 92 + threat * 58;
      context.fillStyle = "#020504";
      polygon([[-120,28],[-72,58+jaw*.2],[0,76+jaw],[72,58+jaw*.2],[120,28],[85,178],[0,218],[-85,178]]);
      context.fillStyle = "#68181f"; polygon([[-88,83],[0,102+jaw],[88,83],[48,157],[0,174],[-48,157]]);
      context.fillStyle = "#f2d9a5";
      for (let tooth=-4; tooth<=4; tooth += 1) { const x=tooth*18; polygon([[x-7,63],[x,94+Math.abs(tooth)*2],[x+7,63]]); polygon([[x-7,174],[x,145-Math.abs(tooth)*2],[x+7,174]]); }
      context.restore();
      if (progress < 1) frame = requestAnimationFrame(render); else { canvas.dataset.active="false"; context.clearRect(0,0,width,height); }
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [trigger]);
  return <canvas ref={canvasRef} aria-hidden="true" className="dragonThreatOverlay" />;
}
