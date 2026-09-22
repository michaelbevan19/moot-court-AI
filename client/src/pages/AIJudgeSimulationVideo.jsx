import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Send, Loader, Mic, User, Activity, ListChecks, Scale, AlertTriangle,
    BookOpen, VolumeX, FileText, X, Clock, MessageSquare, ArrowRight
} from 'lucide-react';
import axios from 'axios';

// ─── Markdown Formatter ───────────────────────────────────────────────────────

const formatLine = (line) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (part && part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const renderMessage = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
        const p = line.trim();
        if (!p) return <div key={idx} className="h-2" />;
        if (p.startsWith('###')) return <h3 key={idx} className="text-base font-black text-cyan-400 uppercase tracking-wider border-l-2 border-cyan-500/50 pl-3 mt-4 mb-2">{p.replace('###', '').trim()}</h3>;
        if (p.startsWith('* ') || p.startsWith('- ') || p.match(/^\d+\./)) {
            const ordered = p.match(/^\d+\./);
            const content = ordered ? p.replace(/^\d+\.\s*/, '') : p.substring(2);
            return <div key={idx} className="flex gap-3 ml-4 my-1"><span className="text-cyan-500 font-bold shrink-0">{ordered ? p.match(/^\d+\./)[0] : '•'}</span><span className="text-slate-300 leading-relaxed">{formatLine(content)}</span></div>;
        }
        return <div key={idx} className="mb-2 text-slate-300 leading-relaxed text-[13px] font-medium">{formatLine(p)}</div>;
    });
};

// ─── Courtroom Background (two muted looping videos) ─────────────────────────

const CourtroomBackground = ({ isJudgeSpeaking }) => {
    const idleRef = useRef(null);
    const talkRef = useRef(null);

    useEffect(() => {
        if (isJudgeSpeaking) {
            if (talkRef.current) { talkRef.current.currentTime = 0; talkRef.current.play().catch(() => { }); }
        } else {
            if (idleRef.current) { idleRef.current.play().catch(() => { }); }
        }
    }, [isJudgeSpeaking]);

    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
            <video ref={idleRef} src="/assets/judge/judge-idle.mp4"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isJudgeSpeaking ? 'opacity-0' : 'opacity-100'}`}
                muted playsInline loop autoPlay />
            <video ref={talkRef} src="/assets/judge/judge-talking.mp4"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isJudgeSpeaking ? 'opacity-100' : 'opacity-0'}`}
                muted playsInline loop />

            {/* Keep the Judge video bright and unobstructed. UI panels provide their own readability. */}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AIJudgeSimulationVideo = () => {
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
    const [micStatus, setMicStatus] = useState('idle');
    const [feedbackReport, setFeedbackReport] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [successRate, setSuccessRate] = useState(0);
    const [isJudgeSpeaking, setIsJudgeSpeaking] = useState(false);

    const recognitionRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const inputRef = useRef('');
    const synthRef = useRef(window.speechSynthesis);
    const utteranceRef = useRef(null);
    const isLiveRef = useRef(isLive);
    isLiveRef.current = isLive;
    const shouldRestartRef = useRef(true);

    // ── Mic Status UI Helper ──────────────────────────────────────────────────

    const renderMicStatusIndicator = () => {
        switch (micStatus) {
            case 'starting':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        <span>STARTING MICROPHONE</span>
                    </div>
                );
            case 'listening':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                        <span>MICROPHONE LISTENING</span>
                    </div>
                );
            case 'processing':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                        <span>PROCESSING SPEECH</span>
                    </div>
                );
            case 'permission-denied':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-950/40 border border-red-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>MICROPHONE DENIED</span>
                    </div>
                );
            case 'no-speech':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>NO SPEECH DETECTED</span>
                    </div>
                );
            case 'unsupported':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-950/40 border border-red-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>SPEECH INPUT UNSUPPORTED</span>
                    </div>
                );
            case 'audio-capture-error':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-950/40 border border-red-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>AUDIO CAPTURE ERROR</span>
                    </div>
                );
            case 'network-error':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        <span>NETWORK ERROR</span>
                    </div>
                );
            case 'stopped':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-900/60 border border-slate-700/40 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span>MICROPHONE STOPPED</span>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-950/40 border border-red-500/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        <span>SPEECH ERROR</span>
                    </div>
                );
            default:
                return null;
        }
    };

    // ── Initial Browser Support Check ─────────────────────────────────────────

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setMicStatus('unsupported');
            setError('Speech recognition is not supported in this browser.');
            console.warn('MIC: SpeechRecognition is not supported in this browser.');
        }
    }, []);

    // ── TTS ──────────────────────────────────────────────────────────────────

    const primeAudio = () => {
        if (synthRef.current) {
            const u = new SpeechSynthesisUtterance('');
            u.volume = 0;
            synthRef.current.speak(u);
        }
    };

    const speak = (text) => {
        if (!text || !synthRef.current) return;
        synthRef.current.cancel();
        const clean = text.replace(/[#*`_~]/g, '').substring(0, 1000);
        const utterance = new SpeechSynthesisUtterance(clean);
        utteranceRef.current = utterance;
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 0.9;
        utterance.volume = 1.0;

        // VIDEO SYNC: onstart → talking video; onend → idle video
        utterance.onstart = () => setIsJudgeSpeaking(true);
        utterance.onend = () => { setIsJudgeSpeaking(false); utteranceRef.current = null; };
        utterance.onerror = () => { setIsJudgeSpeaking(false); utteranceRef.current = null; };

        const go = () => {
            const voices = synthRef.current.getVoices();
            const v = voices.find(v => v.name.includes('Google US English')) ||
                voices.find(v => v.name.includes('Daniel')) ||
                voices.find(v => v.lang.startsWith('en-'));
            if (v) utterance.voice = v;
            synthRef.current.speak(utterance);
        };

        if (synthRef.current.getVoices().length > 0) { go(); }
        else { synthRef.current.onvoiceschanged = () => { go(); synthRef.current.onvoiceschanged = null; }; synthRef.current.getVoices(); }
    };

    const stopSpeech = () => {
        if (synthRef.current) { synthRef.current.cancel(); setIsJudgeSpeaking(false); }
    };

    // ── Session init ─────────────────────────────────────────────────────────

    useEffect(() => {
        if (!sessionId) { setError('No session found. Please upload files first.'); return; }
        if (initialMessage && messages.length === 0) {
            setMessages([{ id: 'init', type: 'bot', text: initialMessage, timestamp: new Date() }]);
            setTimeout(() => speak(initialMessage), 1000);
        }
    }, [sessionId, initialMessage, messages.length]);

    // ── End session ───────────────────────────────────────────────────────────

    const handleEndSession = async () => {
        if (!sessionId || isLoading) return;
        setIsLoading(true); setError('');
        try {
            const res = await axios.post('http://localhost:5000/api/end-session', { sessionId });
            if (res.data.success) { setFeedbackReport(res.data.report); stopSpeech(); }
            else setError(res.data.message || 'Failed to generate feedback');
        } catch { setError('Failed to generate session feedback.'); }
        finally { setIsLoading(false); }
    };

    // ── Speech Recognition ────────────────────────────────────────────────────

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setMicStatus('unsupported');
            setError('Speech recognition is not supported in this browser.');
            return;
        }

        if (!isLive) {
            shouldRestartRef.current = false;
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) { }
            }
            setMicStatus('stopped');
            console.log('MIC: live session stopped');
            return;
        }

        let isCancelled = false;
        setMicStatus('starting');
        console.log('MIC: starting');

        const initAndStart = async () => {
            // Diagnostic microphone permission check
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log('MIC: microphone permission granted');
                    stream.getTracks().forEach(track => track.stop());
                }
            } catch (err) {
                console.error('MIC ERROR: permission-denied', err);
                if (!isCancelled) {
                    setMicStatus('permission-denied');
                    setError('Microphone permission denied. Allow microphone access for localhost.');
                    setIsLive(false);
                }
                return;
            }

            if (isCancelled || !isLiveRef.current) return;

            if (!recognitionRef.current) {
                const recognition = new SR();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'en-US';
                console.log('MIC: recognition initialized');

                recognition.onstart = () => {
                    console.log('MIC: listening');
                    setMicStatus('listening');
                };

                recognition.onaudiostart = () => {
                    console.log('MIC: audio started');
                };

                recognition.onsoundstart = () => {
                    console.log('MIC: sound started');
                };

                recognition.onspeechstart = () => {
                    console.log('MIC: speech started');
                };

                recognition.onspeechend = () => {
                    console.log('MIC: speech ended');
                };

                recognition.onsoundend = () => {
                    console.log('MIC: sound ended');
                };

                recognition.onaudioend = () => {
                    console.log('MIC: audio ended');
                };

                recognition.onend = () => {
                    console.log('MIC: recognition ended');
                    if (isLiveRef.current && shouldRestartRef.current) {
                        try {
                            console.log('MIC: restarting recognition...');
                            recognition.start();
                        } catch (e) {
                            console.warn('MIC: restart failed', e);
                        }
                    } else {
                        setMicStatus('stopped');
                    }
                };

                recognition.onerror = (event) => {
                    console.error(`MIC ERROR: ${event.error}`);
                    let errorMsg = `Speech recognition error: ${event.error}`;
                    shouldRestartRef.current = true;

                    switch (event.error) {
                        case 'not-allowed':
                            errorMsg = 'Microphone permission denied. Allow microphone access for localhost.';
                            setMicStatus('permission-denied');
                            shouldRestartRef.current = false;
                            setIsLive(false);
                            break;
                        case 'service-not-allowed':
                            errorMsg = 'Speech recognition service is not allowed in this browser.';
                            setMicStatus('error');
                            shouldRestartRef.current = false;
                            setIsLive(false);
                            break;
                        case 'audio-capture':
                            errorMsg = 'No microphone was detected or the microphone could not be accessed.';
                            setMicStatus('audio-capture-error');
                            shouldRestartRef.current = false;
                            setIsLive(false);
                            break;
                        case 'no-speech':
                            errorMsg = 'No speech detected. Please speak clearly into the microphone.';
                            setMicStatus('no-speech');
                            break;
                        case 'network':
                            errorMsg = 'Speech recognition network service failed.';
                            setMicStatus('network-error');
                            break;
                        case 'aborted':
                            errorMsg = 'Speech recognition was stopped.';
                            setMicStatus('stopped');
                            break;
                        default:
                            setMicStatus('error');
                            break;
                    }
                    setError(errorMsg);
                };

                recognition.onresult = (event) => {
                    let interim = '', final = '';
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        const transcriptText = event.results[i][0].transcript;
                        const isFinal = event.results[i].isFinal;
                        console.log(`MIC RESULT: type = ${isFinal ? 'final' : 'interim'}, text = ${transcriptText}`);
                        if (isFinal) {
                            final += transcriptText;
                        } else {
                            interim += transcriptText;
                        }
                    }
                    if (final) {
                        setMicStatus('processing');
                        const cur = inputRef.current;
                        const newText = cur + (cur && !cur.endsWith(' ') ? ' ' : '') + final;
                        setInput(newText);
                        inputRef.current = newText;
                        setInterimText('');
                        setTimeout(() => {
                            if (isLiveRef.current) setMicStatus('listening');
                        }, 300);
                    } else {
                        setInterimText(interim);
                    }
                };

                recognitionRef.current = recognition;
            }

            shouldRestartRef.current = true;
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.warn('MIC: start exception (likely already active):', e);
            }
        };

        initAndStart();

        return () => {
            isCancelled = true;
        };
    }, [isLive]);

    // ── Send message ──────────────────────────────────────────────────────────

    const handleSend = async (e, overrideText = null) => {
        if (e) e.preventDefault();
        const textToSend = overrideText || inputRef.current || input;
        if (!textToSend.trim() || !sessionId || isLoading) return;

        const userText = textToSend;
        setInput(''); inputRef.current = ''; setInterimText('');
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        setError('');
        setMessages(prev => [...prev, { id: Date.now(), type: 'user', text: userText, timestamp: new Date() }]);
        setIsLive(false); setIsLoading(true);

        try {
            const res = await axios.post('http://localhost:5000/api/chat', { sessionId, message: userText }, { timeout: 30000 });
            if (res.data.success) {
                const { message: reply, score } = res.data;
                setMessages(prev => [...prev, { id: Date.now() + 1, type: 'bot', text: reply, timestamp: new Date() }]);
                if (score !== undefined && score !== null) setSuccessRate(score);
                speak(reply);
            } else { setError(res.data.message || 'Failed to get response'); }
        } catch (err) {
            console.error('Chat error:', err);
            let msg = err.message || 'Failed to send message';
            if (err.response?.status === 404) msg = 'Session expired. Please start a new session.';
            else if (err.response?.status === 429) msg = 'Rate limit exceeded. Please wait and try again.';
            setError(msg);
        } finally { setIsLoading(false); }
    };

    // ── Quick actions ──────────────────────────────────────────────────────────

    const handleObjection = () => {
        if (isLoading || !sessionId) return;
        sendAuto('OBJECTION! Your Honor, I object to the current line of questioning/reasoning.');
    };
    const handleCiteLaw = () => {
        if (isLoading || !sessionId) return;
        setInput('I would like to cite the law regarding this matter: ');
        setTimeout(() => { const f = document.getElementById('arg-input'); if (f) f.focus(); }, 100);
    };

    const sendAuto = async (text) => {
        if (!sessionId || isLoading) return;
        setMessages(prev => [...prev, { id: Date.now(), type: 'user', text, timestamp: new Date() }]);
        setIsLoading(true);
        try {
            const res = await axios.post('http://localhost:5000/api/chat', { sessionId, message: text });
            if (res.data.success) {
                const { message: reply, score } = res.data;
                setMessages(prev => [...prev, { id: Date.now() + 1, type: 'bot', text: reply, timestamp: new Date() }]);
                if (score !== undefined && score !== null) setSuccessRate(score);
                speak(reply);
            }
        } catch (err) { console.error(err); setError('Failed to process action'); }
        finally { setIsLoading(false); }
    };

    // ── History ────────────────────────────────────────────────────────────────

    const fetchHistory = async () => {
        const userStr = localStorage.getItem('user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        setHistoryLoading(true);
        try {
            const res = await axios.get(`http://localhost:5000/api/history?email=${user.email}`);
            if (res.data.success) setHistoryData(res.data.history.filter(s => s.mode === 'judge' || !s.mode).reverse());
        } catch (e) { console.error(e); }
        finally { setHistoryLoading(false); }
    };

    const toggleHistory = () => { if (!showHistory) fetchHistory(); setShowHistory(p => !p); };
    const loadTranscript = (session) => {
        if (!session.transcript) return;
        setMessages(session.transcript.map((m, i) => ({ id: `hist-${i}`, type: m.role === 'user' ? 'user' : 'bot', text: m.content, timestamp: new Date(session.date) })));
        setShowHistory(false);
    };

    // ── Guard ─────────────────────────────────────────────────────────────────

    if (!sessionId) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className="p-8 text-center max-w-md w-full border border-red-500/20 rounded-2xl bg-slate-900/80 backdrop-blur-xl">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Unauthorized Access</h2>
                <p className="text-slate-400 mb-6">No active session detected. Please initialize a case first.</p>
                <button onClick={() => navigate('/upload')} className="w-full py-3 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-500 transition-all">Return to Initialization</button>
            </div>
        </div>
    );

    // ── Derived data ───────────────────────────────────────────────────────────
    const lastBot = [...messages].reverse().find(m => m.type === 'bot');
    const lastUser = [...messages].reverse().find(m => m.type === 'user');

    // ── Grade helper ───────────────────────────────────────────────────────────
    const gradeColor = (g) => !g ? 'text-slate-400' : g.startsWith('A') ? 'text-emerald-400' : g.startsWith('B') ? 'text-blue-400' : g.startsWith('C') ? 'text-yellow-400' : 'text-red-400';

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex h-screen text-slate-200 overflow-hidden font-sans relative bg-slate-950">

            {/* ═══ LAYER 0: Full-screen judge video background ═══ */}
            <div className="fixed inset-0 z-0">
                <CourtroomBackground isJudgeSpeaking={isJudgeSpeaking} />
            </div>

            {/* ═══ LAYER 10: UI content ═══ */}
            <div className="flex w-full h-full relative z-10">

                {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
                <aside className="w-72 border-r border-white/5 bg-[#070D1A]/85 backdrop-blur-xl flex flex-col shrink-0">
                    <div className="p-5 space-y-6">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-cyan-600/20 flex items-center justify-center border border-cyan-500/30">
                                <Scale size={18} className="text-cyan-400" />
                            </div>
                            <div>
                                <span className="font-bold text-base text-white block leading-none">Moot Court AI</span>
                                <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Video Session
                                </span>
                            </div>
                        </div>

                        {/* Nav items */}
                        <div className="space-y-2">
                            {[{ icon: ListChecks, label: 'Case Summary', sub: 'Verified Source' }, { icon: FileText, label: 'Petitioner Brief', sub: 'Verified Source' }, { icon: FileText, label: 'Respondent Brief', sub: 'Verified Source' }].map((item, i) => (
                                <div key={i} className="group p-3 rounded-xl bg-[#0F172A]/80 border border-slate-800 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-slate-800 text-slate-400 group-hover:text-cyan-400 transition-colors"><item.icon size={15} /></div>
                                    <div><p className="text-xs font-bold text-white">{item.label}</p><p className="text-[9px] text-slate-500">{item.sub}</p></div>
                                </div>
                            ))}
                            <button onClick={toggleHistory} className="w-full p-3 rounded-xl bg-[#0F172A]/80 border border-slate-800 hover:border-cyan-500/30 transition-all flex items-center gap-3 group text-left">
                                <div className="p-2 rounded-lg bg-slate-800 text-slate-400 group-hover:text-cyan-400 transition-colors"><Clock size={15} /></div>
                                <div><p className="text-xs font-bold text-white">Past History</p><p className="text-[9px] text-slate-500">View Archives</p></div>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1" />

                    {/* Judge state indicator */}
                    <div className="px-5 pb-3">
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 ${isJudgeSpeaking ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-slate-900/40 border border-slate-800/40'}`}>
                            <div className={`w-2 h-2 rounded-full transition-all ${isJudgeSpeaking ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.7)]' : 'bg-slate-600'}`} />
                            <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${isJudgeSpeaking ? 'text-cyan-400' : 'text-slate-500'}`}>
                                {isJudgeSpeaking ? 'Judge Speaking' : 'Judge Idle'}
                            </span>
                        </div>
                    </div>

                    <div className="p-5 border-t border-slate-800/50">
                        <p className="text-[9px] text-slate-600 leading-relaxed">Gemini AI monitors proceedings for factual inconsistencies.</p>
                    </div>
                </aside>

                {/* ── MAIN CENTER ──────────────────────────────────────────── */}
                <main className="flex-1 flex flex-col min-w-0 bg-transparent relative">

                    {/* Top toolbar */}
                    <header className="h-14 border-b border-slate-800/50 bg-[#0B1120]/60 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-10">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">Online</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-[9px] uppercase font-bold tracking-widest">
                                <User size={10} /> Counsel Connected
                            </div>
                            {userRole && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${userRole === 'Petitioner' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}`}>{userRole}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { primeAudio(); setIsLive(p => !p); setError(''); }}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider text-white transition-all ${isLive ? 'bg-emerald-600 animate-pulse' : 'bg-red-600/80 hover:bg-red-600'}`}>
                                {isLive ? 'Session Live' : 'Start Live Session'}
                            </button>
                            <button onClick={handleEndSession} disabled={isLoading}
                                className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition-all">
                                <Activity size={10} className="text-cyan-400" />End Session
                            </button>
                            <button onClick={stopSpeech} title="Stop Judge Audio"
                                className="p-2 rounded-lg bg-red-900/20 text-red-400 hover:text-red-300 hover:bg-red-900/40 border border-red-900/30 transition-colors">
                                <VolumeX size={15} />
                            </button>
                        </div>
                    </header>

                    {/* Center video area — no chat bubbles */}
                    <div className="flex-1 relative overflow-hidden flex flex-col">

                        {/* Christ University branding placed over the source-video watermark.
                            Positioned relative to the visible courtroom area so it is not hidden
                            behind the left navigation sidebar. */}
                        <div className="absolute top-1 left-1 z-30 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800/50 shadow-md pointer-events-none">
                            <img
                                src="/assets/branding/christ-logo.png"
                                alt="Christ University"
                                className="w-24 md:w-28 h-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
                            />
                        </div>

                        {/* Court banner */}
                        <div className="relative z-10 flex justify-center pt-5 pointer-events-none">
                            <div className="px-5 py-2 rounded-full bg-slate-950/60 border border-slate-700/40 backdrop-blur-sm text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                                Court is in Session • {new Date().toLocaleDateString()}
                            </div>
                        </div>

                        {/* Error banner */}
                        {error && (
                            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-lg w-full px-4">
                                <div className="bg-red-600/10 border border-red-600/50 rounded-xl p-3 flex items-center gap-3 text-red-200 text-xs backdrop-blur-md">
                                    <AlertTriangle size={15} className="shrink-0" />{error}
                                </div>
                            </div>
                        )}

                        {/* Role selection — centered overlay */}
                        {!userRole && messages.length > 0 && messages[0].id === 'init' && (
                            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                <div className="flex gap-4 pointer-events-auto">
                                    <button onClick={() => { primeAudio(); setUserRole('Petitioner'); handleSend(null, 'I represent the Petitioner, Your Honor.'); }}
                                        className="px-8 py-4 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 font-black hover:bg-blue-600 hover:text-white transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] uppercase tracking-widest text-[10px] flex items-center gap-3 backdrop-blur-sm">
                                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />Identify as Petitioner
                                    </button>
                                    <button onClick={() => { primeAudio(); setUserRole('Respondent'); handleSend(null, 'I represent the Respondent, Your Honor.'); }}
                                        className="px-8 py-4 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 font-black hover:bg-purple-600 hover:text-white transition-all shadow-[0_0_20px_rgba(147,51,234,0.2)] uppercase tracking-widest text-[10px] flex items-center gap-3 backdrop-blur-sm">
                                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />Identify as Respondent
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Judge name plate + speaking indicator — floats above input */}
                        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 pointer-events-none">
                            {isJudgeSpeaking && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/40 backdrop-blur-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                                    <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Judge Speaking</span>
                                    <span className="flex gap-0.5 ml-1">
                                        {[0, 150, 300].map(d => <span key={d} className="w-0.5 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                                    </span>
                                </div>
                            )}
                            {isLoading && !isJudgeSpeaking && (
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/30 backdrop-blur-sm">
                                    <Loader size={10} className="text-amber-400 animate-spin" />
                                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Judge Thinking...</span>
                                </div>
                            )}
                            <div className="px-5 py-2 rounded-xl bg-slate-950/75 border border-slate-700/50 backdrop-blur-md text-center">
                                <p className="text-[8px] font-bold text-cyan-400 uppercase tracking-[0.3em]">Presiding Judge</p>
                                <h2 className="text-lg font-black text-white tracking-tight leading-tight">Hon. Chief Justice</h2>
                                <p className="text-[8px] text-slate-500">Department 4 • High Court Simulation</p>
                            </div>
                        </div>

                        {/* ── BOTTOM INPUT BAR ── */}
                        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-[#020617]/65 via-[#020617]/20 to-transparent">

                            {/* Compact last-response subtitle (not full chat history) */}
                            {lastBot && (
                                <div className="mb-3 max-w-2xl mx-auto">
                                    {lastUser && (
                                        <p className="text-center mb-1 text-[9px] text-slate-500">
                                            <span className="text-blue-400 font-bold">You: </span>
                                            <span className="italic">{lastUser.text.substring(0, 80)}{lastUser.text.length > 80 ? '…' : ''}</span>
                                        </p>
                                    )}
                                    <div className={`px-4 py-2.5 rounded-xl bg-slate-900/15 border backdrop-blur-md text-center transition-all duration-300 ${isJudgeSpeaking ? 'border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.15)]' : 'border-slate-700/30'}`}>
                                        <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">
                                            {isJudgeSpeaking ? '🔊 Hon. Chief Justice' : 'Hon. Chief Justice'}
                                        </p>
                                        <p className="text-xs text-slate-200 leading-relaxed line-clamp-2">
                                            {lastBot.text.replace(/[#*`_~]/g, '').substring(0, 200)}{lastBot.text.length > 200 ? '…' : ''}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Small mic status indicator */}
                            {micStatus !== 'idle' && (
                                <div className="mb-2 flex justify-center">
                                    {renderMicStatusIndicator()}
                                </div>
                            )}

                            {/* Input form */}
                            <form onSubmit={handleSend} className="relative group max-w-3xl mx-auto">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600/30 to-blue-600/30 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                                <div className="relative bg-[#0B1120]/90 border border-slate-700/60 rounded-2xl flex items-center gap-2 p-2 shadow-2xl backdrop-blur-md">
                                    <button type="button" onClick={() => { primeAudio(); setIsLive(p => !p); }}
                                        className={`p-2.5 rounded-xl border transition-all ${isLive ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                                        <Mic size={18} />
                                    </button>
                                    <input id="arg-input" type="text"
                                        value={input + (interimText ? (input ? ' ' : '') + interimText : '')}
                                        onChange={e => { setInput(e.target.value); inputRef.current = e.target.value; }}
                                        placeholder={isLive ? 'Listening… speak your argument' : 'Type your argument, Your Honor…'}
                                        disabled={isLoading}
                                        className="flex-1 bg-transparent border-none outline-none py-2 px-2 text-sm text-white placeholder:text-slate-600 font-medium" />
                                    {isLoading && <Loader size={15} className="animate-spin text-cyan-400 shrink-0" />}
                                    <button type="submit" disabled={isLoading || !input.trim()}
                                        className="p-2.5 rounded-xl bg-cyan-600 text-white hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all shadow-lg shadow-cyan-600/30">
                                        <Send size={18} />
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </main>

                {/* ── RIGHT SIDEBAR — Analytics ─────────────────────────── */}
                <aside className="w-72 border-l border-slate-800/50 bg-[#070D1A]/85 backdrop-blur-xl p-6 flex flex-col shrink-0">
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Live Analytics</h3>
                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        </div>

                        {/* Success Rate Gauge */}
                        <div className="relative h-44 w-44 mx-auto mb-5">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#1E293B" strokeWidth="6" />
                                <circle cx="50" cy="50" r="42" fill="none" stroke="#22D3EE" strokeWidth="6"
                                    strokeDasharray="263.89"
                                    strokeDashoffset={263.89 - (263.89 * (successRate / 100))}
                                    strokeLinecap="round" className="transition-all duration-1000" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-black text-white tracking-tighter">{successRate}%</span>
                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Success Rate</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 flex-1">
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Courtroom Tension</span>
                                <span className="text-[9px] font-bold text-emerald-500 uppercase">Stable</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/30">
                                <div className="h-full w-2/3 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 rounded-full" />
                            </div>
                            <p className="text-[9px] text-slate-500 mt-2 leading-relaxed opacity-70">Real-time analysis of speech patterns and judge sentiment.</p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 pt-5 border-t border-slate-800/50">
                            <button onClick={handleObjection} disabled={isLoading}
                                className="flex items-center justify-center gap-3 py-3 rounded-xl bg-[#2D161B] border border-red-500/30 hover:bg-red-900/40 transition-all group shadow-lg disabled:opacity-50">
                                <AlertTriangle size={18} className="text-red-500 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Objection</span>
                            </button>
                            <button onClick={handleCiteLaw} disabled={isLoading}
                                className="flex items-center justify-center gap-3 py-3 rounded-xl bg-[#161B33] border border-blue-500/30 hover:bg-blue-900/40 transition-all group shadow-lg disabled:opacity-50">
                                <BookOpen size={18} className="text-blue-500 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Cite Law</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-5 pt-5 border-t border-slate-800/50 text-center">
                        <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest opacity-50">AI Judge Video Session • Ver 3.0</p>
                    </div>
                </aside>

                {/* ── FEEDBACK MODAL ─────────────────────────────────────── */}
                {feedbackReport && (() => {
                    const rd = typeof feedbackReport === 'string' ? { feedback: feedbackReport, scores: {}, letter_grade: 'N/A' } : feedbackReport;
                    const { scores = {}, letter_grade = 'N/A', feedback = '' } = rd;
                    return (
                        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6">
                            <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-cyan-500/30 rounded-2xl bg-slate-900/95 shadow-[0_0_50px_rgba(34,211,238,0.2)]">
                                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#1E293B]/50">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-xl bg-cyan-600/20 border border-cyan-500/30"><Scale className="text-cyan-400" size={22} /></div>
                                        <div>
                                            <h2 className="text-xl font-black text-white uppercase">Performance Evaluation</h2>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Counsel Identification: 0xB4F2</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <div className="text-right">
                                            <p className="text-[10px] text-slate-500 font-bold uppercase">Overall Grade</p>
                                            <p className={`text-4xl font-black ${gradeColor(letter_grade)} leading-none`}>{letter_grade}</p>
                                        </div>
                                        <button onClick={() => navigate('/upload')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"><X size={22} /></button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                                    {Object.keys(scores).length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            {Object.entries(scores).map(([k, s]) => (
                                                <div key={k} className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex flex-col gap-2">
                                                    <div className="flex justify-between items-end">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">{k.replace('_', ' ')}</span>
                                                        <span className={`text-lg font-bold ${s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{s}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${s}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="prose prose-invert max-w-none">{renderMessage(feedback)}</div>
                                </div>
                                <div className="p-6 border-t border-slate-800 bg-[#1E293B]/30 flex justify-center">
                                    <button onClick={() => navigate('/upload')} className="px-8 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm transition-all uppercase tracking-wider">Start New Session</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ── HISTORY MODAL ──────────────────────────────────────── */}
                {showHistory && (
                    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6">
                        <div className="w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col border border-cyan-500/30 rounded-2xl bg-slate-900/95 shadow-[0_0_50px_rgba(34,211,238,0.2)]">
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#1E293B]/50">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-xl bg-cyan-600/20 border border-cyan-500/30"><Clock className="text-cyan-400" size={22} /></div>
                                    <div><h2 className="text-xl font-black text-white uppercase">Case History</h2><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Archived Proceedings</p></div>
                                </div>
                                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"><X size={22} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {historyLoading ? <div className="flex justify-center p-8"><Loader className="animate-spin text-cyan-400" /></div>
                                    : historyData.length === 0 ? <div className="text-center p-8 text-slate-500">No past sessions found.</div>
                                        : historyData.map((s, i) => (
                                            <div key={i} className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-cyan-500/30 transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <span className="text-xs font-bold text-slate-400 uppercase block">{new Date(s.date).toLocaleDateString()} • {new Date(s.date).toLocaleTimeString()}</span>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.mode === 'support' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-cyan-500/20 text-cyan-400'}`}>{s.mode === 'support' ? 'MENTOR' : 'JUDGE'}</span>
                                                            <span className="text-sm text-white font-medium">Session ID: {s.id.slice(-6)}</span>
                                                        </div>
                                                    </div>
                                                    <span className={`text-2xl font-black ${gradeColor(s.score)}`}>{s.score}</span>
                                                </div>
                                                <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end gap-3">
                                                    <button onClick={() => loadTranscript(s)} className="text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"><MessageSquare size={13} /> Load Chat</button>
                                                    <button onClick={() => { setFeedbackReport(s.report); setShowHistory(false); }} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-500/20 transition-all">View Report <ArrowRight size={13} /></button>
                                                </div>
                                            </div>
                                        ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIJudgeSimulationVideo;
