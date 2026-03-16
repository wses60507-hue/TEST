import React, { useEffect, useRef } from 'react';
import { LEAD_LAYOUT, ANCHOR_DATABASE } from '../constants';
import { LeadBeats } from '../types';

interface ECGMonitorProps {
  currentBeats: LeadBeats;
  isVPC: boolean;
}

const ECGMonitor: React.FC<ECGMonitorProps> = ({ currentBeats, isVPC }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveCanvasesRef = useRef<{ [lead: string]: HTMLCanvasElement }>({});
  const offscreenCanvasesRef = useRef<{ [lead: string]: HTMLCanvasElement }>({});
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const leads = LEAD_LAYOUT;
    leads.forEach((lead) => {
      offscreenCanvasesRef.current[lead] = document.createElement('canvas');
    });

    const resize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth / 4;
      const h = containerRef.current.clientHeight / 3;
      leads.forEach((lead) => {
        const live = liveCanvasesRef.current[lead];
        const off = offscreenCanvasesRef.current[lead];
        if (live) {
          live.width = w;
          live.height = h;
        }
        if (off) {
          off.width = w;
          off.height = h;
        }
      });
    };

    window.addEventListener('resize', resize);
    resize();

    return () => window.removeEventListener('resize', resize);
  }, []);

  const preRenderAllBeats = () => {
    LEAD_LAYOUT.forEach((lead) => {
      const canvas = offscreenCanvasesRef.current[lead];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const leadData = currentBeats[lead];
      if (!leadData) return;

      ctx.clearRect(0, 0, w, h);
      const baselineY = h * 0.6;
      const scaleY = h * 0.25;
      ctx.beginPath();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#10b981';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.moveTo(0, baselineY);
      const centerBeatX = w * 0.35;

      if (isVPC) {
        ctx.lineTo(centerBeatX - 30, baselineY);
        ctx.lineTo(centerBeatX - 15, baselineY - (leadData.q * scaleY));
        ctx.lineTo(centerBeatX, baselineY - (leadData.r * scaleY));
        ctx.lineTo(centerBeatX + 15, baselineY - (leadData.s * scaleY));
        ctx.lineTo(centerBeatX + 25, baselineY);
        ctx.quadraticCurveTo(centerBeatX + 50, baselineY - (leadData.t * scaleY * 1.5), centerBeatX + 80, baselineY);
      } else {
        ctx.lineTo(centerBeatX - 40, baselineY);
        ctx.quadraticCurveTo(centerBeatX - 30, baselineY - (leadData.p! * scaleY * 2), centerBeatX - 20, baselineY);
        ctx.lineTo(centerBeatX - 10, baselineY);
        ctx.lineTo(centerBeatX - 5, baselineY - (leadData.q * scaleY));
        ctx.lineTo(centerBeatX, baselineY - (leadData.r * scaleY));
        ctx.lineTo(centerBeatX + 5, baselineY - (leadData.s * scaleY));
        ctx.lineTo(centerBeatX + 15, baselineY);
        ctx.quadraticCurveTo(centerBeatX + 40, baselineY - (leadData.t * scaleY * 2), centerBeatX + 70, baselineY);
      }
      ctx.lineTo(w, baselineY);
      ctx.stroke();
    });
  };

  const updateLiveECG = (progress: number) => {
    LEAD_LAYOUT.forEach((lead) => {
      const liveCanvas = liveCanvasesRef.current[lead];
      const offCanvas = offscreenCanvasesRef.current[lead];
      if (!liveCanvas || !offCanvas) return;
      const ctx = liveCanvas.getContext('2d');
      if (!ctx) return;
      const w = liveCanvas.width;
      const h = liveCanvas.height;
      const sweepX = progress * w;
      const eraserWidth = 15;

      ctx.fillStyle = '#020617';
      ctx.fillRect(sweepX, 0, eraserWidth, h);
      if (sweepX > 1) {
        ctx.drawImage(offCanvas, sweepX - 2, 0, 3, h, sweepX - 2, 0, 3, h);
      }
      ctx.fillStyle = '#34d399';
      ctx.fillRect(sweepX, 0, 1, h);
    });
  };

  useEffect(() => {
    const animate = () => {
      const timeNow = Date.now();
      const progress = (timeNow % 1000) / 1000;
      preRenderAllBeats();
      updateLiveECG(progress);
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [currentBeats, isVPC]);

  return (
    <div id="ecg-container" ref={containerRef} className="flex-grow grid grid-cols-4 grid-rows-3 relative bg-[#020617]">
      {LEAD_LAYOUT.map((lead) => (
        <div key={lead} className="ecg-cell relative border border-emerald-900/10 overflow-hidden">
          <div className="lead-label absolute top-2 left-2 font-black text-emerald-400 text-[0.75rem] z-20 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-500/20 backdrop-blur-sm">
            {lead}
          </div>
          <canvas
            ref={(el) => {
              if (el) liveCanvasesRef.current[lead] = el;
            }}
            className="ecg-canvas w-full h-full block absolute top-0 left-0 z-10"
          />
        </div>
      ))}
    </div>
  );
};

export default ECGMonitor;
