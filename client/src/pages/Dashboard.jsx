import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Smartphone, ArrowRight, Scale, Shield, Users } from 'lucide-react';

const Dashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const modules = [
        {
            id: 'ai-assistant',
            title: 'AI Legal Assistant',
            description: 'AI Judge & Support Agent for case analysis and moot courtroom simulation.',
            icon: <Bot className="w-8 h-8 text-cyan-400" />,
            action: () => navigate('/upload'),
            gradient: 'from-cyan-500/20 to-blue-600/20',
            border: 'border-cyan-500/30'
        },
        {
            id: 'penal-code',
            title: 'Penal Code Reference',
            description: 'Comprehensive database of laws, sections, and articles for quick reference.',
            icon: <Smartphone className="w-8 h-8 text-indigo-400" />,
            action: () => navigate('/penal-code'),
            gradient: 'from-indigo-500/20 to-purple-600/20',
            border: 'border-indigo-500/30'
        }
    ];

    return (
        <div className="min-h-screen bg-[#0f1014] text-white p-6 md:p-12 relative overflow-hidden font-sans">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="relative z-10 max-w-6xl mx-auto">
                <header className="flex justify-between items-center mb-16">
                    <div className="flex items-center gap-3">
                        <Scale className="w-8 h-8 text-cyan-400" />
                        <span className="text-xl font-bold tracking-tight">MOOT COURT AI</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium text-white">{user.name || 'Counsel'}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                            <Users className="w-5 h-5 text-slate-400" />
                        </div>
                    </div>
                </header>

                <main>
                    <div className="mb-12">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            Select Your Workspace
                        </h1>
                        <p className="text-lg text-slate-400 max-w-2xl">
                            Choose a module to start your preparation. Our AI systems are ready to assist you in building a stronger case.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {modules.map((module) => (
                            <button
                                key={module.id}
                                onClick={module.action}
                                className={`group relative p-8 rounded-2xl border ${module.border} bg-gradient-to-br ${module.gradient} backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/10 text-left`}
                            >
                                <div className="mb-6 p-4 inline-block rounded-xl bg-slate-900/50 border border-white/5 group-hover:border-cyan-500/30 transition-colors">
                                    {module.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-3 flex items-center gap-2">
                                    {module.title}
                                    <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-cyan-400" />
                                </h3>
                                <p className="text-slate-400 leading-relaxed mb-6">
                                    {module.description}
                                </p>
                                <div className="flex items-center text-sm font-semibold text-cyan-400 uppercase tracking-widest">
                                    Initialize Module
                                </div>
                                <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Shield className="w-24 h-24" />
                                </div>
                            </button>
                        ))}
                    </div>
                </main>

                <footer className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500 font-mono">
                    <div className="flex items-center gap-6">
                        <span>SYSTEM STATUS: <span className="text-emerald-500">OPTIMAL</span></span>
                        <span>LATENCY: 24ms</span>
                    </div>
                    <div>© 2026 MOOT COURT AI - PROFESSIONAL EDITION</div>
                </footer>
            </div>
        </div>
    );
};

export default Dashboard;
