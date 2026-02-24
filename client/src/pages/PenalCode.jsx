import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Search, Filter, ExternalLink, HardDrive } from 'lucide-react';

const PenalCode = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0f1014] text-white p-6 md:p-12 relative overflow-hidden font-sans">
            {/* Ambient Background */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px]"></div>

            <div className="relative z-10 max-w-6xl mx-auto">
                <header className="flex items-center gap-4 mb-12">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="p-2 rounded-lg bg-slate-900 border border-white/10 hover:bg-slate-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold">Penal Code Reference</h1>
                        <p className="text-slate-400 text-sm">Explore laws, sections, and legal articles.</p>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar Filters */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/10 backdrop-blur-sm">
                            <h3 className="font-bold mb-4 flex items-center gap-2">
                                <Filter className="w-4 h-4 text-cyan-400" />
                                Categories
                            </h3>
                            <div className="space-y-2">
                                {['Indian Penal Code (IPC)', 'CrPC', 'Evidence Act', 'Constitutional Law'].map((cat, i) => (
                                    <button key={cat} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${i === 0 ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'hover:bg-white/5 text-slate-400'}`}>
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-slate-900/50 border border-white/10 backdrop-blur-sm">
                            <h3 className="font-bold mb-4 flex items-center gap-2">
                                <HardDrive className="w-4 h-4 text-indigo-400" />
                                Statistics
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                    <div className="text-xs text-slate-500 uppercase">Sections</div>
                                    <div className="text-xl font-bold">500+</div>
                                </div>
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                                    <div className="text-xs text-slate-500 uppercase">Chapters</div>
                                    <div className="text-xl font-bold">23</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Search Bar */}
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search by section number or keyword (e.g. 'Murder', '302', 'Theft')..."
                                className="w-full pl-12 pr-4 py-4 bg-slate-900/80 border border-white/10 rounded-2xl focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all placeholder:text-slate-600"
                            />
                        </div>

                        {/* Placeholder Content */}
                        <div className="flex flex-col items-center justify-center p-20 rounded-3xl border border-dashed border-white/10 bg-white/5">
                            <BookOpen className="w-16 h-16 text-slate-700 mb-6" />
                            <h2 className="text-2xl font-bold mb-2">Legal Database Initializing</h2>
                            <p className="text-slate-400 text-center max-w-md">
                                We are currently indexing the complete penal code and statutory laws. This module will be fully operational shortly.
                            </p>
                            <button className="mt-8 flex items-center gap-2 px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-medium">
                                View Online Registry
                                <ExternalLink className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PenalCode;
