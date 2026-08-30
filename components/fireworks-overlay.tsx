"use client";

import { useEffect, useRef } from "react";

type FireworksOverlayProps = {
  /** 값이 증가할 때마다 폭죽을 한 번 실행합니다. */
  trigger: number;
  durationMs?: number;
  bursts?: number;
};

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  delay: number;
};

const palette = [168, 190, 38, 52, 285, 320];

export function FireworksOverlay({ trigger, durationMs = 3600, bursts = 5 }: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousTrigger = useRef(trigger);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trigger === previousTrigger.current) return;
    previousTrigger.current = trigger;

    const context = canvas.getContext("2d");
    if (!context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: Particle[] = [];
    const startedAt = performance.now();
    const totalBursts = reduceMotion ? 1 : Math.max(1, bursts);
    for (let burst = 0; burst < totalBursts; burst += 1) {
      const originX = width * (0.06 + Math.random() * 0.88);
      const originY = height * (0.10 + Math.random() * 0.58);
      const hue = palette[Math.floor(Math.random() * palette.length)];
      const count = reduceMotion ? 28 : 140;
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.16;
        const speed = 2.5 + Math.random() * 5.5;
        particles.push({
          x: originX + (Math.random() - 0.5) * 8,
          y: originY + (Math.random() - 0.5) * 8,
          z: Math.random() * 0.7 + 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          vz: (Math.random() - 0.5) * 0.12,
          life: 1,
          maxLife: 0.8 + Math.random() * 0.9,
          size: 1.4 + Math.random() * 2.4,
          hue: hue + (Math.random() - 0.5) * 22,
          delay: burst * 260 + Math.random() * 100,
        });
      }
    }

    canvas.dataset.active = "true";
    let frame = 0;
    const render = (now: number) => {
      const elapsed = now - startedAt;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const particle of particles) {
        if (elapsed < particle.delay) continue;
        particle.life -= 0.014;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.z += particle.vz;
        particle.vy += 0.035;
        particle.vx *= 0.988;
        particle.vy *= 0.988;
        if (particle.life <= 0) continue;
        const perspective = 0.55 + Math.max(0.15, particle.z);
        const alpha = Math.min(1, particle.life / 0.2) * 0.9;
        const radius = particle.size * perspective * (0.5 + particle.life);
        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fillStyle = `hsla(${particle.hue}, 100%, 70%, ${alpha})`;
        context.shadowBlur = 14 * perspective;
        context.shadowColor = `hsla(${particle.hue}, 100%, 60%, ${alpha})`;
        context.fill();
      }
      context.shadowBlur = 0;
      if (elapsed < durationMs && particles.some((particle) => particle.life > 0)) {
        frame = requestAnimationFrame(render);
      } else {
        canvas.dataset.active = "false";
        context.clearRect(0, 0, width, height);
      }
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [bursts, durationMs, trigger]);

  return <canvas ref={canvasRef} aria-hidden="true" className="fireworksOverlay" />;
}
