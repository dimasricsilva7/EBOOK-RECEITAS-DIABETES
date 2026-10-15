"use client";

import { useEffect, useRef, useState } from "react";

/** Vídeo que só começa a baixar quando chega perto da tela (não pesa no carregamento da página). */
export function LazyVideo({ url, title, className = "", vertical = false }: { url: string; title: string; className?: string; vertical?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setNear(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (failed) return null;
  return (
    <div ref={ref} className={`overflow-hidden bg-ink ${vertical ? "aspect-[9/16]" : "aspect-video"} ${className}`}>
      {near && <video src={url} controls playsInline preload="metadata" onError={() => setFailed(true)} className="h-full w-full object-cover" aria-label={title} />}
    </div>
  );
}
