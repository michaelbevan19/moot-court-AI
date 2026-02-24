import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Bot, User, LayoutDashboard, Shield, AlertTriangle, MessageSquare, ListCheck, FileSearch, Clock, X, Loader2, ArrowRight, Save, History as HistoryIcon, CheckCircle } from 'lucide-react';
import axios from 'axios';
import courtroomBg from '../assets/courtroom.jpg';

const formatLine = (line) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part && part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-white shadow-sm">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const renderMessage = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    return lines.map((line, idx) => {
        let processedLine = line.trim();
        if (!processedLine) return <div key={idx} className="h-3" />;

        if (processedLine.startsWith('###')) {
            return (
                <div key={idx} className="mt-6 mb-3">
                    <h3 className="text-lg font-black text-indigo-400 uppercase tracking-wider border-l-2 border-indigo-500/50 pl-3">
                        {processedLine.replace('###', '').trim()}
                    </h3>
                </div>
            );
        }

        if (processedLine.startsWith('* ') || processedLine.startsWith('- ') || processedLine.match(/^\d+\./)) {
            const isOrdered = processedLine.match(/^\d+\./);
            const content = isOrdered ? processedLine.replace(/^\d+\.\s*/, '') : processedLine.substring(2);
            return (
                <div key={idx} className="flex gap-3 ml-4 my-2 group">
                    <span className="text-indigo-500 font-bold shrink-0">{isOrdered ? processedLine.match(/^\d+\./)[0] : '•'}</span>
                    <span className="text-slate-300 leading-relaxed group-hover:text-slate-100 transition-colors tracking-tight text-sm">{formatLine(content)}</span>
                </div>
            );
        }

        return (
            <div key={idx} className="mb-3 text-slate-300 leading-relaxed text-sm font-medium tracking-tight">
                {formatLine(processedLine)}
            </div>
        );
    });
};

const AISupport = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { sessionId } = location.state || {};

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [mentorReport, setMentorReport] = useState(null);
    const [archiving, setArchiving] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!sessionId) {
            setError('No session found. Please upload case documents first.');
            return;
        }

        setMessages([{
            id: 'init',
            type: 'bot',
            text: "Hello! I am your AI Support Agent. I've analyzed your briefs and case details. I'm here to help you refine your arguments and prepare for the battle in court. What would you like to focus on first? We could identify weaknesses in your arguments, suggest some powerful precedents, or work on your opening statement.",
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
                mode: 'support'
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

    const fetchHistory = async () => {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        const user = JSON.parse(userStr);

        setHistoryLoading(true);
        try {
            const response = await axios.get(`http://localhost:5000/api/history?email=${user.email}`);
            if (response.data.success) {
                const supportHistory = response.data.history.filter(s => s.mode === 'support');
                setHistoryData(supportHistory.reverse());
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const toggleHistory = () => {
        if (!showHistory) fetchHistory();
        setShowHistory(!showHistory);
    };

    const loadTranscript = (session) => {
        if (!session.transcript) return;
        const historicalMessages = session.transcript.map((msg, index) => ({
            id: `hist-${index}`,
            type: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content,
            timestamp: new Date(session.date)
        }));
        setMessages(historicalMessages);
        setShowHistory(false);
        setMentorReport(null);
    };

    const saveSession = async () => {
        if (messages.length < 2 || archiving) return;
        setArchiving(true);
        try {
            const response = await axios.post('http://localhost:5000/api/end-session', { sessionId });
            if (response.data.success) {
                setMentorReport(response.data.report);
            }
        } catch (err) {
            setError('Failed to archive session.');
        } finally {
            setArchiving(false);
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

                    <div className="mt-10 space-y-3">
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-1">Session</h3>
                        <button
                            onClick={toggleHistory}
                            className="w-full text-left p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-indigo-500/40 transition-all text-sm flex items-center gap-3 group"
                        >
                            <HistoryIcon size={18} className="text-slate-400 group-hover:text-indigo-400" />
                            <span className="text-slate-300 group-hover:text-white font-medium">View History</span>
                        </button>
                        <button
                            onClick={saveSession}
                            disabled={archiving || messages.length < 2}
                            className="w-full text-left p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-emerald-500/40 transition-all text-sm flex items-center gap-3 group disabled:opacity-50"
                        >
                            {archiving ? <Loader2 size={18} className="animate-spin text-emerald-400" /> : <Save size={18} className="text-slate-400 group-hover:text-emerald-400" />}
                            <span className="text-slate-300 group-hover:text-white font-medium">Save Session</span>
                        </button>
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
                            <div className={`max-w-[85%] rounded-2xl p-5 shadow-2xl ${msg.type === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-[#1E293B] border border-slate-800 text-slate-200 rounded-tl-none'}`}>
                                {msg.type === 'bot' ? (
                                    <div className="prose prose-invert max-w-none">
                                        {renderMessage(msg.text)}
                                    </div>
                                ) : (
                                    <p className="text-sm leading-relaxed">{msg.text}</p>
                                )}
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

            {/* History Modal */}
            {showHistory && (
                <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <div className="glass-card w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col border border-indigo-500/30 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#1E293B]/50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-indigo-600/20 border border-indigo-500/30">
                                    <Clock className="text-indigo-400" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Mentor History</h2>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Archived Guidance Sessions</p>
                                </div>
                            </div>
                            <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                            {historyLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-400" /></div>
                            ) : historyData.length === 0 ? (
                                <div className="text-center p-8 text-slate-500">No past mentor sessions found.</div>
                            ) : (
                                historyData.map((session, idx) => (
                                    <div key={idx} className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-indigo-500/30 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                    {new Date(session.date).toLocaleDateString()} • {new Date(session.date).toLocaleTimeString()}
                                                </span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${session.mode === 'support' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                                                        {session.mode === 'support' ? 'MENTOR' : 'JUDGE'}
                                                    </span>
                                                    <span className="text-sm text-white font-medium">Session ID: {session.id.slice(-6)}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => loadTranscript(session)}
                                                className="text-xs font-bold text-indigo-400 hover:text-white uppercase tracking-wider flex items-center gap-2 transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-600/20"
                                            >
                                                <MessageSquare size={14} />
                                                Load Chat
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Mentor Report Modal */}
            {mentorReport && (
                <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                    <div className="glass-card w-full max-w-2xl overflow-hidden flex flex-col border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
                        <div className="p-8 text-center bg-emerald-500/10 border-b border-emerald-500/20">
                            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-bounce">
                                <CheckCircle size={40} className="text-emerald-400" />
                            </div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Mentor Session Saved</h2>
                            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Procedural Record Archived Successfully</p>
                        </div>
                        <div className="p-8 overflow-y-auto max-h-[50vh] custom-scrollbar bg-[#0F172A]/80">
                            <div className="prose prose-invert max-w-none">
                                {renderMessage(mentorReport.feedback)}
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-center">
                            <button
                                onClick={() => setMentorReport(null)}
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/40 uppercase text-xs tracking-widest"
                            >
                                Continue Preparation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AISupport;
