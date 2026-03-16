import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import { X, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChallengePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

const ChallengePanel: React.FC<ChallengePanelProps> = ({ isOpen, onClose, onSubmit }) => {
  const [challengeText, setChallengeText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const startChallenge = async () => {
    setIsLoading(true);
    setChallengeText('');
    const systemInstruction = "你是一位電生理學教授。請出一個特發性心室頻脈(VPC)的找點考題。描述病患症狀與 12 導程心電圖特徵 (例如 LBBB, inferior axis, late transition 等)，絕對不要直接給出解答座標或解剖名稱。字數限制 100 字以內，繁體中文。";
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: "請給我一個新的 VPC 定位臨床考題。" }] }],
        config: { systemInstruction },
      });
      setChallengeText(response.text || "無法生成考題。");
    } catch (error) {
      console.error('Challenge Error:', error);
      setChallengeText("【離線測試考題】一名 45 歲男性有頻繁心悸。EKG 顯示 VPC 呈現 LBBB 形態，且下壁導程 (II, III, aVF) 呈現高聳正向波，Lead I 為負向波，移行區在 V4。請在模型上找出該靶點。");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (isOpen) startChallenge();
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute top-4 right-4 z-40 w-80 bg-slate-900/95 backdrop-blur border border-indigo-500/50 rounded-xl shadow-[0_0_30px_rgba(79,70,229,0.3)] p-4 flex flex-col"
        >
          <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
            <h3 className="text-indigo-400 font-bold flex items-center gap-1">
              <span className="text-lg">✨</span> 臨床考題
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-slate-200 text-sm leading-relaxed mb-4 min-h-[60px]">
            {isLoading ? (
              <div className="flex gap-2 items-center text-indigo-400">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.4s]" />
                </div>
                正在構建臨床考題...
              </div>
            ) : (
              <div className="prose prose-invert prose-sm" dangerouslySetInnerHTML={{ __html: marked.parse(challengeText) }} />
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSubmit}
              className="flex-grow bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              <Target className="w-4 h-4" /> 提交當前座標為解答
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChallengePanel;
