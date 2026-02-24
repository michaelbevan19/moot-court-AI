import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Loader, Mic, Gavel, User, LayoutDashboard, Shield, Activity, ListChecks, Scale, AlertTriangle, BookOpen, Volume2, FileText, X, Clock, MessageSquare, ArrowRight } from 'lucide-react';
import axios from 'axios';
import mootBg from '../assets/moot-bg.png';

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

    // Simple Markdown-like formatter for a premium look
    const lines = text.split('\n');
    return lines.map((line, idx) => {
        let processedLine = line.trim();
        if (!processedLine) return <div key={idx} className="h-3" />;

        // Headers
        if (processedLine.startsWith('###')) {
            return (
                <div key={idx} className="mt-6 mb-3">
                    <h3 className="text-lg font-black text-cyan-400 uppercase tracking-wider border-l-2 border-cyan-500/50 pl-3">
                        {processedLine.replace('###', '').trim()}
                    </h3>
                </div>
            );
        }

        // Lists
        if (processedLine.startsWith('* ') || processedLine.startsWith('- ') || processedLine.match(/^\d+\./)) {
            const isOrdered = processedLine.match(/^\d+\./);
            const content = isOrdered ? processedLine.replace(/^\d+\.\s*/, '') : processedLine.substring(2);
            return (
                <div key={idx} className="flex gap-3 ml-4 my-2 group">
                    <span className="text-cyan-500 font-bold shrink-0">{isOrdered ? processedLine.match(/^\d+\./)[0] : '•'}</span>
                    <span className="text-slate-300 leading-relaxed group-hover:text-slate-100 transition-colors tracking-tight">{formatLine(content)}</span>
                </div>
            );
        }

        // Bold conversion using regex
        return (
            <div key={idx} className="mb-3 text-slate-300 leading-relaxed text-[13px] font-medium tracking-tight">
                {formatLine(processedLine)}
            </div>
        );
    });
};



const CourtRoom = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { sessionId, initialMessage } = location.state || {};

    const [messages, setMessages] = useState([]);
    const [userRole, setUserRole] = useState(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isLive, setIsLive] = useState(false);
    const [interimText, setInterimText] = useState('');
    const [feedbackReport, setFeedbackReport] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const recognitionRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const inputRef = useRef(''); // To keep track of input without closure issues
    const messagesEndRef = useRef(null);
    const synthRef = useRef(window.speechSynthesis);

    const speak = (text) => {
        setIsLive(false); // Stop mic when AI speaks to prevent self-listening loop
        if (!text || !synthRef.current) return;

        // Cancel any ongoing speech
        synthRef.current.cancel();

        // Remove markdown artifacts for cleaner speech
        const cleanText = text.replace(/[#*`_~]/g, '').substring(0, 500); // Limit to 500 chars for performance

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 0.9; // Slightly deeper voice for the judge

        // Find a professional sounding voice if available
        const voices = synthRef.current.getVoices();
        const googleVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha'));
        if (googleVoice) utterance.voice = googleVoice;

        synthRef.current.speak(utterance);
    };

    const stopSpeech = () => {
        if (synthRef.current) {
            synthRef.current.cancel();
        }
    };

    // Auto-scroll to bottom
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Initialize with session
    useEffect(() => {
        if (!sessionId) {
            setError('No session found. Please upload files first.');
            return;
        }

        if (initialMessage && messages.length === 0) {
            setMessages([{
                id: 'init',
                type: 'bot',
                text: initialMessage,
                timestamp: new Date()
            }]);
            // Small delay to ensure voices are loaded
            setTimeout(() => speak(initialMessage), 1000);
        }
    }, [sessionId, initialMessage, messages.length]);

    const handleEndSession = async () => {
        if (!sessionId || isLoading) return;

        setIsLoading(true);
        setError('');

        try {
            const response = await axios.post('http://localhost:5000/api/end-session', { sessionId });
            if (response.data.success) {
                // Expecting report object from backend
                setFeedbackReport(response.data.report);
                if (synthRef.current) synthRef.current.cancel();
            } else {
                setError(response.data.message || 'Failed to generate feedback');
            }
        } catch (err) {
            setError('Failed to generate session feedback.');
        } finally {
            setIsLoading(false);
        }
    };

    // Speech Recognition Setup
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Disable continuous to prevent duplication bugs
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            console.log("Mic active");
        };

        recognition.onresult = (event) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }

            if (final) {
                // Append efficiently
                const current = inputRef.current;
                // Add space only if there's text and it doesn't end in space
                const prefix = current && !current.endsWith(' ') ? ' ' : '';
                const newText = current + prefix + final;

                setInput(newText);
                inputRef.current = newText;
                setInterimText('');

                // Optional: Auto-send logic could go here, but user wants manual control/stop
            } else {
                setInterimText(interim);
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'not-allowed') {
                setIsLive(false);
                setError("Microphone access denied.");
            } else if (event.error === 'no-speech') {
                // Ignore no-speech, let it restart if live
            } else {
                console.warn("Speech error:", event.error);
            }
        };

        recognition.onend = () => {
            // STRICT ONE-SHOT: Turn off mic immediately after one session.
            // This prevents "ghost" instances from restarting or staying alive in background.
            setIsLive(false);
        };

        recognitionRef.current = recognition;

        if (isLive) {
            try {
                recognition.start();
            } catch (e) { console.warn(e); }
        }

        return () => {
            recognition.stop();
        };
    }, [isLive, isLoading]); // Re-run when toggle changes or loading state changes

    const handleSend = async (e, overrideText = null) => {
        if (e) e.preventDefault();

        const textToSend = overrideText || inputRef.current || input;
        if (!textToSend.trim() || !sessionId || isLoading) return;

        const userText = textToSend;
        setInput('');
        inputRef.current = '';
        setInterimText('');
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        setError('');

        // Add user message
        setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'user',
            text: userText,
            timestamp: new Date()
        }]);

        setIsLive(false); // Stop mic after sending
        setIsLoading(true);

        try {
            const response = await axios.post('http://localhost:5000/api/chat', {
                sessionId,
                message: userText
            }, {
                timeout: 30000
            });

            if (response.data.success) {
                const { message: reply, score } = response.data; // Expect score from backend
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    type: 'bot',
                    text: reply,
                    timestamp: new Date()
                }]);

                // Update Success Rate Gauge
                if (score !== undefined && score !== null) {
                    setSuccessRate(score);
                }

                speak(reply);
            } else {
                setError(response.data.message || 'Failed to get response');
            }
        } catch (err) {
            console.error('Chat error:', err);
            const errorMsg = err.response?.status === 429
                ? 'API rate limit exceeded. Please wait a moment and try again.'
                : err.message || 'Failed to send message';

            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleObjection = () => {
        if (isLoading || !sessionId) return;
        const objectionText = "OBJECTION! Your Honor, I object to the current line of questioning/reasoning.";
        sendAutomaticMessage(objectionText);
    };

    const handleCiteLaw = () => {
        if (isLoading || !sessionId) return;
        setInput("I would like to cite the law regarding this matter: ");
        // Small delay to ensure state update and then focus
        setTimeout(() => {
            const inputField = document.querySelector('input[type="text"]');
            if (inputField) inputField.focus();
        }, 100);
    };

    const sendAutomaticMessage = async (text) => {
        if (!sessionId || isLoading) return;

        setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'user',
            text: text,
            timestamp: new Date()
        }]);

        setIsLoading(true);
        try {
            const response = await axios.post('http://localhost:5000/api/chat', {
                sessionId,
                message: text
            });

            if (response.data.success) {
                const reply = response.data.message;
                setMessages(prev => [...prev, {
                    id: Date.now() + 1,
                    type: 'bot',
                    text: reply,
                    timestamp: new Date()
                }]);
                speak(reply);
            }
        } catch (err) {
            console.error('Action error:', err);
            setError('Failed to process action');
        } finally {
            setIsLoading(false);
        }
    };

    const [successRate, setSuccessRate] = useState(0); // Initial value

    const [evidenceList, setEvidenceList] = useState([]);

    const fetchEvidenceList = async () => {
        try {
            const response = await axios.get('http://localhost:5000/api/evidence-list');
            if (response.data.success) {
                setEvidenceList(response.data.evidence);
            } else {
                console.warn(response.data.message || 'Failed to fetch evidence list');
            }
        } catch (err) {
            console.warn('Error fetching evidence list.', err);
        }
    };

    useEffect(() => {
        fetchEvidenceList();
    }, []);

    const fetchHistory = async () => {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        const user = JSON.parse(userStr);

        setHistoryLoading(true);
        try {
            const response = await axios.get(`http://localhost:5000/api/history?email=${user.email}`);
            if (response.data.success) {
                setHistoryData(response.data.history.reverse()); // Newest first
            }
        } catch (error) {
            console.error("Failed to fetch history", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const toggleHistory = () => {
        if (!showHistory) {
            fetchHistory();
        }
        setShowHistory(!showHistory);
    };

    const loadTranscript = (session) => {
        if (!session.transcript) return;

        const historicalMessages = session.transcript.map((msg, index) => ({
            id: `hist-${index}`,
            type: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content,
            timestamp: new Date(session.date) // Use session date for all messages or parse if available
        }));

        setMessages(historicalMessages);
        setShowHistory(false);
        // enhancing UX: maybe clear input or show a notification
    };

    if (!sessionId) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="glass-card p-8 text-center max-w-md w-full border border-red-500/20">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Unauthorized Access</h2>
                    <p className="text-slate-400 mb-6">No active session detected. You must initialize a case first.</p>
                    <button
                        onClick={() => navigate('/upload')}
                        className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary/80 transition-all"
                    >
                        Return to Initialization
                    </button>
                </div>
            </div>
        );
    }

    const renderFeedbackModal = () => {
        if (!feedbackReport) return null;

        // Handle both string (legacy) and object (new) reports
        let reportData = { feedback: '', scores: {}, letter_grade: 'N/A' };

        if (typeof feedbackReport === 'string') {
            reportData.feedback = feedbackReport;
        } else {
            reportData = feedbackReport;
        }

        const { scores = {}, letter_grade = 'N/A', feedback = '' } = reportData;

        // Helper to determine color based on grade
        const getGradeColor = (grade) => {
            if (!grade) return 'text-slate-400';
            if (grade.startsWith('A')) return 'text-emerald-400';
            if (grade.startsWith('B')) return 'text-blue-400';
            if (grade.startsWith('C')) return 'text-yellow-400';
            return 'text-red-400';
        };

        return (
            <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                <div className="glass-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.2)]">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#1E293B]/50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-cyan-600/20 border border-cyan-500/30">
                                <Scale className="text-cyan-400" size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">Performance Evaluation</h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Counsel Identification: 0xB4F2</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Overall Grade</p>
                                <p className={`text-4xl font-black ${getGradeColor(letter_grade)} leading-none`}>{letter_grade}</p>
                            </div>
                            <button
                                onClick={() => navigate('/upload')}
                                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                        {/* Scores Grid */}
                        {Object.keys(scores).length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {Object.entries(scores).map(([key, score]) => (
                                    <div key={key} className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex flex-col gap-2">
                                        <div className="flex justify-between items-end">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{key.replace('_', ' ')}</span>
                                            <span className={`text-lg font-bold ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{score}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                style={{ width: `${score}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Text Feedback */}
                        <div className="prose prose-invert max-w-none prose-headings:text-cyan-400 prose-p:text-slate-300 prose-li:text-slate-300">
                            {renderMessage(feedback)}
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-800 bg-[#1E293B]/30 flex justify-center gap-4">
                        <button
                            onClick={() => navigate('/upload')}
                            className="px-8 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm transition-all shadow-lg hover:shadow-cyan-500/20 uppercase tracking-wider"
                        >
                            Start New Session
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderHistoryModal = () => {
        if (!showHistory) return null;

        return (
            <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                <div className="glass-card w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col border border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.2)]">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#1E293B]/50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-cyan-600/20 border border-cyan-500/30">
                                <Clock className="text-cyan-400" size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">Case History</h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Archived Proceedings</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowHistory(false)}
                            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                        {historyLoading ? (
                            <div className="flex justify-center p-8"><Loader className="animate-spin text-cyan-400" /></div>
                        ) : historyData.length === 0 ? (
                            <div className="text-center p-8 text-slate-500">No past sessions found.</div>
                        ) : (
                            historyData.map((session, idx) => (
                                <div key={idx} className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-cyan-500/30 transition-all">
                                    <div className="flexjustify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                {new Date(session.date).toLocaleDateString()} • {new Date(session.date).toLocaleTimeString()}
                                            </span>
                                            <span className="text-sm text-white font-medium mt-1">Session ID: {session.id.slice(-6)}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Grade</span>
                                            <span className={`text-2xl font-black ${session.score?.startsWith?.('A') ? 'text-emerald-400' :
                                                session.score?.startsWith?.('B') ? 'text-blue-400' :
                                                    session.score?.startsWith?.('C') ? 'text-yellow-400' : 'text-red-400'
                                                }`}>{session.score}</span>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end gap-3">
                                        <button
                                            onClick={() => loadTranscript(session)}
                                            className="text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider flex items-center gap-2 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
                                        >
                                            <MessageSquare size={14} />
                                            Load Chat
                                        </button>
                                        <button
                                            onClick={() => {
                                                setFeedbackReport(session.report);
                                                setShowHistory(false);
                                            }}
                                            className="text-xs font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-500/20 transition-all"
                                        >
                                            View Report <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="relative h-screen overflow-hidden font-sans text-slate-200">

            {/* ================= BACKGROUND LAYER ================= */}
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat animate-courtroom"
                style={{ backgroundImage: `url(${mootBg})` }}
            />

            {/* Dark cinematic overlay for readability */}
            <div className="absolute inset-0 bg-[#020617]/85 backdrop-blur-[2px]" />

            {/* ================= APP CONTENT ================= */}
            <div className="relative flex h-full w-full">
                
                {/* Left Sidebar - Navigation & Case Info */}
                <aside className="w-80 border-r border-slate-800/40 bg-[#070D1A]/40 backdrop-blur-2xl flex flex-col shrink-0">
                    <div className="p-6">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 flex items-center justify-center border border-cyan-500/30">
                                <Scale size={20} className="text-cyan-400" />
                            </div>
                            <div>
                                <span className="font-bold text-lg text-white block leading-none">Moot Court AI</span>
                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mt-1 block flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    System Online
                                </span>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div>
                                {/* Removed Case File section */}
                            </div>

                            <div className="space-y-3">
                                {[
                                    { icon: ListChecks, label: 'Case Summary', status: 'Verified Source' },
                                    { icon: FileText, label: 'Petitioner Brief', status: 'Verified Source' },
                                    { icon: FileText, label: 'Respondent Brief', status: 'Verified Source' },
                                ].map((item, i) => (
                                    <div key={i} className="group p-4 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-cyan-500/30 transition-all cursor-pointer">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-slate-800 text-slate-400 group-hover:text-cyan-400 transition-colors">
                                                {item.icon ? <item.icon size={18} /> : <FileText size={18} />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-white tracking-tight">{item.label}</p>
                                                <p className="text-[9px] text-slate-500 font-medium">{item.status}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={toggleHistory}
                                    className="w-full p-4 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center gap-3 group text-left"
                                >
                                    <div className="p-2 rounded-lg bg-slate-800 text-slate-400 group-hover:text-cyan-400 transition-colors">
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white tracking-tight">Past History</p>
                                        <p className="text-[9px] text-slate-500 font-medium">View Archives</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1"></div>

                    <div className="p-6 border-t border-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Model Ready</span>
                        </div>
                        <p className="text-[9px] text-slate-600 mt-2 leading-relaxed font-medium">Gemini 2.0 Flash is actively monitoring court proceedings for factual inconsistencies.</p>
                    </div>
                </aside>

                {/* Main Center Area */}
                <main className="flex-1 flex flex-col min-w-0 bg-transparent relative">
                    {/* Top Toolbar */}
                    <header className="h-16 border-b border-slate-800 bg-[#0B1120]/50 backdrop-blur-md px-6 flex items-center justify-between z-10">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">System Online</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                                <User size={12} />
                                Counsel Connected
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                                <Activity size={10} className="text-blue-500" />
                                LATENCY: 12ms
                            </div>
                            <button
                                onClick={() => {
                                    setIsLive(!isLive);
                                    setError('');
                                }}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white transition-all shadow-lg ${isLive ? 'bg-emerald-600 animate-pulse shadow-emerald-900/40' : 'bg-red-600 shadow-red-900/20 hover:bg-red-500'
                                    }`}
                            >
                                {isLive ? 'Session Live' : 'Start Live Session'}
                            </button>
                            <button
                                onClick={handleEndSession}
                                disabled={isLoading}
                                className="px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                <Activity size={12} className="text-cyan-400" />
                                End Session
                            </button>
                            <button
                                onClick={stopSpeech}
                                className="p-2 rounded-lg bg-red-900/20 text-red-400 hover:text-red-300 hover:bg-red-900/40 transition-colors border border-red-900/30"
                                title="Stop Audio"
                            >
                                <Volume2 size={18} className="line-through" />
                            </button>
                        </div>
                    </header>

                    {/* Content Container */}
                    <div className="flex-1 flex relative overflow-hidden">
                        {/* Interaction Column */}
                        <div className="flex-1 flex flex-col relative min-w-0">
                            {/* Judge's Bench Area */}
                            <div className="p-6">
                                <div className="relative p-8 rounded-2xl bg-[#0B1120]/35 backdrop-blur-2xl border border-cyan-500/20 overflow-hidden shadow-[0_0_40px_rgba(34,211,238,0.08)]">
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[30%] h-[3px] bg-cyan-400 rounded-b-full shadow-[0_0_15px_rgba(34,211,238,0.5)]"></div>

                                    <div className="flex items-center gap-8 mb-6">
                                        <div className="w-20 h-20 rounded-2xl bg-[#1E293B]/50 flex items-center justify-center border border-slate-700 shadow-xl backdrop-blur-sm">
                                            <Gavel size={40} className="text-slate-400" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.3em] mb-1.5 opacity-80">Presiding Judge</p>
                                            <h2 className="text-3xl font-bold text-white tracking-tight mb-1">Hon. Chief Justice</h2>
                                            <p className="text-xs text-slate-500 font-medium">Department 4 • High Court Simulation</p>
                                        </div>
                                        <div className="ml-auto">
                                            <div className="flex gap-1">
                                                {[...Array(10)].map((_, i) => (
                                                    <div key={i} className={`w-1 h-4 rounded-full ${i < 6 ? 'bg-cyan-500/40' : 'bg-slate-800'}`}></div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-center">
                                        <div className="px-6 py-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] backdrop-blur-sm">
                                            Court is in Session • {new Date().toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Messages Flow */}
                            <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-24 custom-scrollbar">
                                {error && (
                                    <div className="bg-red-600/10 border border-red-600/50 rounded-xl p-4 flex items-center gap-3 text-red-200 text-sm">
                                        <AlertTriangle className="shrink-0" size={18} />
                                        {error}
                                    </div>
                                )}

                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex items-start gap-3 ${msg.type === 'user' ? 'flex-row-reverse' : ''}`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${msg.type === 'user'
                                            ? 'bg-blue-600/20 border-blue-500/30'
                                            : 'bg-slate-800 border-slate-700'
                                            }`}>
                                            {msg.type === 'user' ? <span className="text-[10px] font-bold">P</span> : <span className="text-[10px] font-bold">J</span>}
                                        </div>

                                        <div className={`group relative max-w-[80%] ${msg.type === 'user' ? 'text-right' : ''}`}>
                                            <div className="flex items-baseline gap-2 mb-1 px-1">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                    {msg.type === 'user' ? 'Counsel' : 'Hon. Chief Justice'}
                                                </span>
                                                <span className="text-[8px] font-mono text-slate-600">
                                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </span>
                                            </div>

                                            <div className={`px-6 py-4 rounded-2xl text-sm leading-relaxed shadow-xl ${msg.type === 'user'
                                                ? 'bg-[#1D4ED8] text-white rounded-tr-none border border-blue-400/20'
                                                : 'bg-[#1E293B] border border-slate-800 text-slate-100 rounded-tl-none backdrop-blur-md'
                                                }`}>
                                                {msg.type === 'bot' ? renderMessage(msg.text) : msg.text}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {!userRole && messages.length > 0 && messages[0].id === 'init' && (
                                    <div className="flex justify-center gap-4 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 fill-mode-both">
                                        <button
                                            onClick={() => {
                                                setUserRole('Petitioner');
                                                handleSend(null, "I represent the Petitioner, Your Honor.");
                                            }}
                                            className="group relative px-8 py-4 rounded-xl bg-blue-600/10 border border-blue-500/30 text-blue-400 font-black hover:bg-blue-600 hover:text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.1)] hover:shadow-[0_0_30px_rgba(37,99,235,0.3)] uppercase tracking-widest text-[10px] flex items-center gap-3"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                            Identify as Petitioner
                                        </button>
                                        <button
                                            onClick={() => {
                                                setUserRole('Respondent');
                                                handleSend(null, "I represent the Respondent, Your Honor.");
                                            }}
                                            className="group relative px-8 py-4 rounded-xl bg-purple-600/10 border border-purple-500/30 text-purple-400 font-black hover:bg-purple-600 hover:text-white transition-all shadow-[0_0_20px_rgba(147,51,234,0.1)] hover:shadow-[0_0_30px_rgba(147,51,234,0.3)] uppercase tracking-widest text-[10px] flex items-center gap-3"
                                        >
                                            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
                                            Identify as Respondent
                                        </button>
                                    </div>
                                )}

                                {isLoading && (
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                                            <Loader size={14} className="animate-spin text-primary" />
                                        </div>
                                        <div className="bg-[#1e293b]/30 border border-slate-800/50 rounded-2xl rounded-tl-none px-5 py-3">
                                            <div className="flex gap-1">
                                                <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce"></div>
                                                <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                                <div className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Controls Overlay */}
                            <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#020617] via-[#020617]/90 to-transparent">
                                <form onSubmit={handleSend} className="relative group">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity"></div>
                                    <div className="relative bg-[#0B1120] border border-slate-800 rounded-2xl flex items-center gap-2 p-2 shadow-2xl">
                                        <button
                                            type="button"
                                            onClick={() => setIsLive(!isLive)}
                                            className={`p-3 rounded-xl border transition-all ${isLive
                                                ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse'
                                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                                                }`}
                                        >
                                            <Mic size={20} />
                                        </button>

                                        <input
                                            type="text"
                                            value={input + (interimText ? (input ? ' ' : '') + interimText : '')}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setInput(val);
                                                inputRef.current = val;
                                            }}
                                            placeholder={isLive ? "Listening..." : "Type your argument here..."}
                                            disabled={isLoading}
                                            className="flex-1 bg-transparent border-none outline-none py-2 px-3 text-sm text-white placeholder:text-slate-600 font-medium"
                                        />

                                        <div className="flex items-center gap-2 pr-2">
                                            <span className="hidden md:block text-[9px] font-mono text-slate-600 uppercase tracking-widest mr-2">Press Enter to send • Mic for voice input</span>
                                            <button
                                                type="submit"
                                                disabled={isLoading || !input.trim()}
                                                className="p-3 rounded-xl bg-primary text-white hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg shadow-primary/30"
                                            >
                                                <Send size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Right Sidebar - Live Analytics */}
                        <aside className="w-80 border-l border-slate-800 bg-[#070D1A]/35 backdrop-blur-2xl p-8 flex flex-col shrink-0">
                            <div className="mb-10">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Live Analytics</h3>
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                                </div>

                                <div className="relative h-56 w-56 mx-auto mb-8">
                                    <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="42" fill="none" stroke="#1E293B" strokeWidth="6" />
                                        <circle
                                            cx="50" cy="50" r="42" fill="none" stroke="#22D3EE" strokeWidth="6"
                                            strokeDasharray="263.89" strokeDashoffset="131.94"
                                            strokeLinecap="round"
                                            className="transition-all duration-1000 shadow-[0_0_15px_rgba(34,211,238,0.5)]"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-5xl font-black text-white tracking-tighter">{successRate}%</span>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Success Rate</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-8 flex-1">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Courtroom Tension</span>
                                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.2em]">Stable</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/30">
                                        <div className="h-full w-2/3 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.3)]"></div>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-3 leading-relaxed font-medium opacity-70">Real-time analysis of speech patterns and judge's sentiment. Keep tension low for better outcomes.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 pt-8 border-t border-slate-800/50">
                                    <button
                                        onClick={handleObjection}
                                        disabled={isLoading}
                                        className="flex items-center justify-center gap-3 py-4 rounded-xl bg-[#2D161B] border border-red-500/30 hover:bg-red-900/40 transition-all group shadow-lg disabled:opacity-50"
                                    >
                                        <AlertTriangle size={20} className="text-red-500 group-hover:scale-110 transition-transform" />
                                        <span className="text-[11px] font-black text-white uppercase tracking-widest">Objection</span>
                                    </button>
                                    <button
                                        onClick={handleCiteLaw}
                                        disabled={isLoading}
                                        className="flex items-center justify-center gap-3 py-4 rounded-xl bg-[#161B33] border border-blue-500/30 hover:bg-blue-900/40 transition-all group shadow-lg disabled:opacity-50"
                                    >
                                        <BookOpen size={20} className="text-blue-500 group-hover:scale-110 transition-transform" />
                                        <span className="text-[11px] font-black text-white uppercase tracking-widest">Cite Law</span>
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-slate-800/50 text-center">
                                <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest opacity-50">AI Judge Session 0x7E2 • Ver 2.1.0-RC</p>
                            </div>
                        </aside>
                    </div>
                </main>

                {/* Feedback Report Overlay */}
                {/* Feedback Report Overlay */}
                {/* Feedback Report Overlay */}
                {renderFeedbackModal()}
                {renderHistoryModal()}
            </div>
        </div> 
    );
};

export default CourtRoom;
