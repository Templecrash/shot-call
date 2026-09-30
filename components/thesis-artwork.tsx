'use client';

import {useEffect, useRef} from 'react';

export function ThesisArtwork({src, compact}: {src: string; compact: boolean}) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const card = layer?.parentElement;
    if (!layer || !card) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    let visible = false;
    const reset = () => {
      cancelAnimationFrame(frame);
      layer.style.removeProperty('--art-x');
      layer.style.removeProperty('--art-y');
    };
    const updateMotion = () => {
      layer.classList.toggle('art-in-view', visible && !motion.matches);
      if (motion.matches) reset();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updateMotion();
      if (!visible) reset();
    }, {threshold: 0.08});
    observer.observe(card);

    const move = (event: PointerEvent) => {
      if (!visible || motion.matches || !pointer.matches || event.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = card.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
        const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
        layer.style.setProperty('--art-x', `${(-x * 9).toFixed(2)}px`);
        layer.style.setProperty('--art-y', `${(-y * 7).toFixed(2)}px`);
      });
    };
    card.addEventListener('pointermove', move, {passive: true});
    card.addEventListener('pointerleave', reset);
    motion.addEventListener('change', updateMotion);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerleave', reset);
      motion.removeEventListener('change', updateMotion);
    };
  }, [src]);

  return <div ref={layerRef} className="card-artwork" aria-hidden="true">
    <img key={src} src={src} alt="" loading={compact ? 'lazy' : 'eager'} decoding="async" draggable={false}/>
  </div>;
}
