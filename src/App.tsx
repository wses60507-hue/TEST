import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import { Crosshair, Cpu, MousePointer2, Move, Activity, Sparkles, Target, Scissors } from 'lucide-react';
import HeartView from './components/HeartView';
import ECGMonitor from './components/ECGMonitor';
import AIModal from './components/AIModal';
import ChallengePanel from './components/ChallengePanel';
import { ANCHOR_DATABASE } from './constants';
import { LeadBeats } from './types';
import { GoogleGenAI } from '@google/genai';

export default function App() {
  const [coord, setCoord] = useState<THREE.Vector3>(new THREE.Vector3());
  const [currentBeats, setCurrentBeats] = useState<LeadBeats>(ANCHOR_DATABASE['Normal'].beats);
  const [isHovering, setIsHovering] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);
  const [ekgAnalysisData, setEkgAnalysisData] = useState<string | undefined>(undefined);
  const [clippingValue, setClippingValue] = useState(1.0); // 1.0 means no clipping, < 1.0 clips
  const [isClippingActive, setIsClippingActive] = useState(false);

  const [currentRegion, setCurrentRegion] = useState<string>('未知區域');

  const handleCoordUpdate = useCallback((newCoord: THREE.Vector3, beats: LeadBeats | null) => {
    setCoord(newCoord);
    if (beats) {
      setCurrentBeats(beats);
      
      // Find nearest region for UI feedback
      let nearest = '未知區域';
      let minDist = Infinity;
      Object.entries(ANCHOR_DATABASE).forEach(([name, data]) => {
        if (data.pos) {
          const d = newCoord.distanceTo(data.pos);
          if (d < minDist) {
            minDist = d;
            nearest = name;
          }
        }
      });
      if (minDist < 1.5) {
        setCurrentRegion(nearest);
      } else {
        setCurrentRegion('心室表面');
      }
    } else {
      setCurrentBeats(ANCHOR_DATABASE['Normal'].beats);
      setCurrentRegion('正常竇性心律');
    }
  }, []);

  const analyzeCurrentEKG = () => {
    if (!isHovering) return;
    
    const v1 = currentBeats['V1'];
    const ii = currentBeats['II'];
    const i = currentBeats['I'];
    
    const v1Morph = v1.r > Math.abs(v1.s) ? "R波主導 (RBBB pattern)" : "S波主導 (LBBB pattern)";
    const axis = ii.r > Math.abs(ii.s) ? "下軸 (Inferior Axis)" : "上軸 (Superior Axis)";
    
    const ekgDesc = `V1: ${v1Morph}, Lead II: ${axis}, Lead I 的 R波幅度: ${i.r.toFixed(2)}, S波幅度: ${i.s.toFixed(2)}`;
    setEkgAnalysisData(ekgDesc);
    setIsAIModalOpen(true);
  };

  const openGeneralAIAnalysis = () => {
    setEkgAnalysisData(undefined);
    setIsAIModalOpen(true);
  };

  const handleChallengeSubmit = async () => {
    if (!isHovering) return;
    setEkgAnalysisData("考題解答提交分析");
    setIsAIModalOpen(true);
  };

  return (
    <div className="flex h-screen w-screen flex-col md:flex-row bg-[#050810] text-[#e2e8f0] overflow-hidden font-sans">
      {/* Left Side: 3D View */}
      <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-[#03050a] border-r border-slate-700 flex flex-col shadow-2xl z-20">
        <div className="absolute top-4 left-4 z-10 pointer-events-none w-11/12 max-w-sm">
          <h1 className="text-2xl font-black text-white flex items-center gap-2 drop-shadow-lg">
            <Crosshair className="text-rose-500" />
            VPC 實時空間向量 Mapping
          </h1>
          <p className="text-slate-400 text-xs mt-1 drop-shadow-md">
            {isClippingActive ? '切面模式：可進行心內膜 (Endocardial) 標記與電生理分析' : '滑鼠在心臟表面滑動，實時運算 EKG 形變 (mm-level precision)'}
          </p>
          
          <div className="flex flex-col gap-2 mt-3 pointer-events-auto">
            <div className="flex gap-2">
              <button 
                onClick={() => setIsChallengeOpen(true)}
                className="w-fit bg-indigo-900/80 hover:bg-indigo-800 border border-indigo-500/50 text-indigo-300 text-xs font-bold py-1.5 px-3 rounded-full flex items-center gap-1 transition-all shadow-[0_0_10px_rgba(79,70,229,0.3)] backdrop-blur"
              >
                <Sparkles className="w-3 h-3" /> AI 臨床測驗模式
              </button>

              <button 
                onClick={() => setIsClippingActive(!isClippingActive)}
                className={`w-fit border text-xs font-bold py-1.5 px-3 rounded-full flex items-center gap-1 transition-all backdrop-blur ${
                  isClippingActive 
                    ? 'bg-rose-600 border-rose-400 text-white shadow-[0_0_10px_rgba(225,29,72,0.5)]' 
                    : 'bg-slate-800/80 border-slate-600 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Scissors className="w-3 h-3" /> {isClippingActive ? '關閉切面' : '開啟切面'}
              </button>
            </div>

            {isClippingActive && (
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-700 mt-1 flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <span>切面深度 (Frontal Plane)</span>
                  <span>{Math.round(clippingValue * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={clippingValue} 
                  onChange={(e) => setClippingValue(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>
            )}

            <div className={`flex gap-2 transition-all duration-300 ${isHovering ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              <button 
                onClick={openGeneralAIAnalysis}
                className="bg-slate-800/90 hover:bg-slate-700 border border-rose-500/50 text-rose-400 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all shadow-lg backdrop-blur"
              >
                <Sparkles className="w-3 h-3" /> 座標風險解析
              </button>
              
              <button 
                onClick={analyzeCurrentEKG}
                className="bg-slate-800/90 hover:bg-slate-700 border border-emerald-500/50 text-emerald-400 text-[10px] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition-all shadow-lg backdrop-blur"
              >
                <Sparkles className="w-3 h-3" /> EKG 實時解讀
              </button>
            </div>
          </div>
        </div>
        
        <HeartView 
          onCoordUpdate={handleCoordUpdate} 
          isHovering={isHovering} 
          setIsHovering={setIsHovering} 
          clippingValue={clippingValue}
          isClippingActive={isClippingActive}
        />
        
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900/90 px-4 py-2 rounded-full border border-slate-700 text-slate-400 text-[11px] flex items-center gap-4 pointer-events-none shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
              <Target className={`w-3 h-3 ${isHovering ? 'text-rose-500 animate-pulse' : 'text-slate-600'}`} />
              <span className={`font-bold transition-colors ${isHovering ? 'text-white' : 'text-slate-500'}`}>
                {currentRegion}
              </span>
            </div>
            <span className="flex items-center gap-1 font-bold text-emerald-400"><Cpu className="w-3 h-3" /> IDW: ON</span>
            <span className="flex items-center gap-1"><MousePointer2 className="w-3 h-3" /> 滑動改變波形</span>
            <span className="flex items-center gap-1"><Move className="w-3 h-3" /> Drag 旋轉</span>
          </div>
      </div>

      {/* Right Side: ECG Monitor */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col bg-[#020617] relative z-10">
        <div className="bg-black border-b border-emerald-900 text-white p-2 flex justify-between items-center shadow-lg z-10">
          <div className="font-bold text-sm tracking-widest text-emerald-400 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
            LIVE EP MONITOR (<span className="text-white">{isHovering ? 'Dynamic VPC' : 'NSR'}</span>)
          </div>
          <div className="text-xs text-emerald-600/70 flex items-center gap-3 font-mono">
            <span className="bg-emerald-900/30 px-2 py-0.5 rounded text-emerald-400 border border-emerald-800">HR: 60 bpm</span>
            <span>25 mm/s</span>
            <span>10 mm/mV</span>
          </div>
        </div>
        <ECGMonitor currentBeats={currentBeats} isVPC={isHovering} />
      </div>

      <ChallengePanel 
        isOpen={isChallengeOpen} 
        onClose={() => setIsChallengeOpen(false)} 
        onSubmit={handleChallengeSubmit}
      />

      <AIModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        coord={coord} 
        ekgData={ekgAnalysisData}
      />
    </div>
  );
}
