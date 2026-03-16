import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { marked } from 'marked';
import { X, Send, Cpu, User, HeartPulse, Crosshair, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  coord: { x: number; y: number; z: number };
  ekgData?: string;
}

const AIModal: React.FC<AIModalProps> = ({ isOpen, onClose, coord, ekgData }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      handleInitialAnalysis();
    }
  }, [isOpen]);

  const handleInitialAnalysis = async () => {
    setIsLoading(true);
    const coordStr = `X: ${(coord.x * 10).toFixed(1)}, Y: ${(coord.y * 10).toFixed(1)}, Z: ${(coord.z * 10).toFixed(1)}`;
    const systemInstruction = "你是頂尖心臟電生理醫師。使用者標記了心臟表面的具體 3D 座標，請分析該座標周圍的冠狀動脈與傳導系統風險。特別注意 RVOT (右心室流出道) 與 LVOT (左心室流出道) 的 VPC 特徵。使用繁體中文，善用 Markdown。";
    const prompt = ekgData 
      ? `我游標停在心臟座標 [${coordStr}]。模擬器運算出的心電圖特徵為：${ekgData}。請向我解析這個空間向量是如何形成此 EKG 形態的，並分析該位置的解剖風險。`
      : `我現在準備針對空間座標 [${coordStr}] 的源頭進行電燒。請分析這個精確位置的解剖風險。`;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction },
      });

      const aiText = response.text || "無法獲取 AI 回應。";
      setMessages([{ role: 'model', text: aiText }]);
    } catch (error) {
      console.error('AI Error:', error);
      setMessages([{ role: 'model', text: "**[系統提示]** 由於 API 錯誤或未提供 API Key，無法連接 AI。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction: "你是頂尖心臟電生理醫師。請簡短回答使用者的問題。" }
      });
      
      // Reconstruct history for chat
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...history, { role: 'user', parts: [{ text: userText }] }],
      });

      const aiText = response.text || "無法獲取 AI 回應。";
      setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { role: 'model', text: "對不起，發生了錯誤。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex justify-center items-center p-4 md:p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-800 border border-slate-600 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.8)] w-full max-w-4xl max-h-full flex flex-col"
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-800/50 rounded-t-2xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-xl">✨</span> Gemini 臨床電生理導師
            <span className="ml-2 font-mono text-xs bg-rose-900/50 text-rose-300 px-2 py-1 rounded-full border border-rose-700">
              X: {(coord.x * 10).toFixed(1)}, Y: {(coord.y * 10).toFixed(1)}, Z: {(coord.z * 10).toFixed(1)}
            </span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-6 text-slate-300 text-sm md:text-base">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-4 rounded-xl border ${
                msg.role === 'user' 
                  ? 'bg-slate-800 border-slate-700 text-slate-200' 
                  : 'bg-blue-900/20 border-rose-800/50 shadow-inner'
              }`}>
                <div className={`font-bold mb-2 flex items-center gap-2 ${msg.role === 'user' ? 'text-blue-400' : 'text-rose-400'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <span className="text-lg">✨</span>}
                  {msg.role === 'user' ? '您' : '座標解析'}
                </div>
                <div className="prose prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) }} />
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-center items-center gap-4 text-blue-400 py-4">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
              <span className="text-sm tracking-widest font-bold">Gemini 正在分析中...</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50 rounded-b-2xl">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="向 AI 導師追問 (例如：這個座標附近有沒有重要的冠狀靜脈分支？)..."
              disabled={isLoading}
              className="flex-grow bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default AIModal;
