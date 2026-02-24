import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Bot, User, LayoutDashboard, Shield, AlertTriangle, MessageSquare, ListCheck, FileSearch } from 'lucide-react';
import axios from 'axios';

const AISupport = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { sessionId } = location.state || {};

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!sessionId) {
            setError('No session found. Please upload case documents first.');
            return;
        }

        setMessages([{
            id: 'init',
            type: 'bot',
            text: "Hello! I am your AI Support Agent. I've analyzed your briefs and case details. Ask me anything about your case, or click on a suggestion below to refine your strategy.",
            timestamp: new Date()
        }]);
    }, [sessionId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e, overrideText = null) => {
        if (e) e.preventDefault();
        const text = overrideText || input;
        if (!text.trim() || !sessionId || isLoading) return;

        setInput('');
        setMessages(prev => [...prev, { id: Date.now(), type: 'user', text, timestamp: new Date() }]);
        setIsLoading(true);

        try {
            const response = await axios.post('http://localhost:5000/api/chat', {
                sessionId,
                message: text,
                mode: 'support' // Optional: Indicate support mode to backend if needed
            });

            if (response.data.success) {
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    type: 'bot',
                    text: response.data.message,
                    timestamp: new Date()
                }]);
            } else {
                setError(response.data.message);
            }
        } catch (err) {
            setError('Failed to get response from AI Support Agent.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!sessionId) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="glass-card p-8 text-center max-w-md w-full border border-red-500/20">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Unauthorized Access</h2>
                    <p className="text-slate-400 mb-6">No active session detected. You must initialize a case first.</p>
                    <button onClick={() => navigate('/upload')} className="w-full py-3 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-500 transition-all">Return to Initialization</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#020617] text-slate-200 overflow-hidden font-sans">
            <aside className="w-80 border-r border-slate-800 bg-[#070D1A] flex flex-col shrink-0">
                <div className="p-6">
                    <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
                        <ArrowLeft size={16} />
                        <span className="text-sm font-medium">Back to Dashboard</span>
                    </button>
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30 shadow-lg shadow-indigo-900/20">
                            <Bot size={24} className="text-indigo-400" />
                        </div>
                        <div>
                            <span className="font-bold text-lg text-white block leading-none">AI Support</span>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-1.5 block">Advisor Mode Active</span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-1">Case Tools</h3>
                        <div className="space-y-2">
                            {[
                                { icon: ListCheck, label: 'Identify Weaknesses' },
                                { icon: FileSearch, label: 'Suggest Precedents' },
                                { icon: MessageSquare, label: 'Presentation Tips' }
                            ].map((tool, i) => (
                                <button key={i} onClick={() => handleSend(null, tool.label)} className="w-full text-left p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-sm group flex items-center gap-3">
                                    <tool.icon size={18} className="text-slate-400 group-hover:text-indigo-400" />
                                    <span className="text-slate-300 group-hover:text-white font-medium">{tool.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-[#020617] relative">
                <header className="h-16 border-b border-slate-800 bg-[#0B1120]/50 backdrop-blur-md px-8 flex items-center justify-between z-10">
                    <div className="flex items-center gap-2">
                        <Shield size={16} className="text-indigo-500" />
                        <span className="text-sm font-bold tracking-tight text-white uppercase opacity-70">Counsel Support Portal</span>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar pb-32">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`max-w-[75%] rounded-2xl p-5 shadow-2xl ${msg.type === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-[#1E293B] border border-slate-800 text-slate-200 rounded-tl-none'}`}>
                                <p className="text-sm leading-relaxed">{msg.text}</p>
                                <p className="text-[10px] opacity-40 mt-3 font-mono">
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-4 flex gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-75"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-150"></div>
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce delay-300"></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent">
                    <form onSubmit={handleSend} className="max-w-4xl mx-auto relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity"></div>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask for feedback or guidance on your case..."
                            className="w-full pl-6 pr-16 py-4 bg-[#0B1120]/80 border border-slate-700/50 rounded-2xl focus:outline-none focus:border-indigo-500/50 backdrop-blur-md text-sm transition-all"
                        />
                        <button type="submit" disabled={isLoading} className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-all disabled:opacity-50">
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
};

export default AISupport;
