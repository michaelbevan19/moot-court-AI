import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, Scale, Shield, User } from 'lucide-react';

const Login = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = React.useState(true);
    const [formData, setFormData] = React.useState({
        email: '',
        password: '',
        name: ''
    });
    const [error, setError] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Client-side validation
        if (!formData.email.endsWith('@gmail.com')) {
            setError('Only @gmail.com addresses are allowed.');
            setIsLoading(false);
            return;
        }

        if (formData.password.length < 8) {
            setError('Password must be at least 8 characters long.');
            setIsLoading(false);
            return;
        }

        try {
            const endpoint = isLogin ? '/api/login' : '/api/signup';
            const response = await fetch(`http://localhost:5000${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('user', JSON.stringify(data.user));
                navigate('/upload');
            } else {
                setError(data.message);
            }
        } catch (err) {
            setError('Connection failed. Please ensure the server is running.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f1014] text-white flex items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-cyan-500/30">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[120px] animate-pulse delay-1000"></div>
                <div className="absolute top-[40%] left-[40%] w-[20%] h-[20%] bg-indigo-500/10 rounded-full blur-[100px]"></div>
                {/* Grid Pattern Overlay */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
            </div>

            <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">

                {/* Branding Section */}
                <div className="hidden md:block space-y-6 slide-in-left">
                    <div className="inline-block p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 backdrop-blur-md">
                        <Scale className="w-10 h-10 text-cyan-400" />
                    </div>
                    <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-cyan-400 leading-tight">
                        Prepare Your <br /> Case Better
                    </h1>
                    <p className="text-lg text-slate-400 max-w-md leading-relaxed">
                        Study arguments, explore precedents, and refine your strategy. Built for students and advocates who take their practice seriously.
                    </p>

                    <div className="flex gap-4 pt-4">
                        <div className="flex -space-x-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-10 h-10 rounded-full border-2 border-[#0f1014] bg-slate-800 flex items-center justify-center text-xs text-slate-400">
                                    <User className="w-4 h-4" />
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col justify-center text-sm">
                            <span className="font-bold text-white">Trusted by</span>
                            <span className="text-cyan-400">Law Students & Advocates</span>
                        </div>
                    </div>
                </div>

                {/* Login Card */}
                <div className="relative">
                    {/* Glow effect behind card */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl blur opacity-20"></div>

                    <div className="glass-card rounded-2xl p-8 md:p-10 relative overflow-hidden">
                        {/* Decorative Top Line */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

                        <div className="mb-8 text-center md:text-left">
                            <h2 className="text-2xl font-bold text-white mb-2">
                                {isLogin ? 'Welcome Back' : 'Join the Registry'}
                            </h2>
                            <p className="text-slate-400 text-sm">
                                {isLogin ? 'Authenticate securely to access your dashboard.' : 'Initialize your counsel profile.'}
                            </p>
                        </div>

                        <form onSubmit={handleAuth} className="space-y-5">
                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-shake">
                                    {error}
                                </div>
                            )}

                            {!isLogin && (
                                <div className="space-y-1.5 slide-in-top">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Full Name</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <input
                                            name="name"
                                            type="text"
                                            value={formData.name}
                                            onChange={handleChange}
                                            required
                                            className="w-full pl-10 pr-4 py-3 bg-[#0b0d12]/60 border border-white/10 rounded-lg focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all text-white placeholder:text-slate-600 font-medium"
                                            placeholder="Adv. John Doe"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Identity Token (@gmail.com)</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                        <Gavel className="w-4 h-4" />
                                    </div>
                                    <input
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-[#0b0d12]/60 border border-white/10 rounded-lg focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all text-white placeholder:text-slate-600 font-medium"
                                        placeholder="counsel@gmail.com"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Access Key (8+ chars)</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                                        <Shield className="w-4 h-4" />
                                    </div>
                                    <input
                                        name="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-[#0b0d12]/60 border border-white/10 rounded-lg focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all text-white placeholder:text-slate-600 font-medium"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full py-3.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold tracking-wide transition-all shadow-lg shadow-cyan-900/20 mt-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:from-cyan-50 hover:to-blue-500'}`}
                            >
                                {isLoading ? 'Processing...' : (isLogin ? 'Initialize Session' : 'Register Credentials')}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-sm text-slate-400">
                                {isLogin ? "New user? " : "Existing counsel? "}
                                <button
                                    onClick={() => setIsLogin(!isLogin)}
                                    className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline transition-colors"
                                >
                                    {isLogin ? "Create an account" : "Log in"}
                                </button>
                            </p>
                        </div>

                        {/* Footer decoration */}
                        <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                            <div className="flex items-center gap-1.5">
                                <Shield className="w-3 h-3 text-emerald-500" />
                                <span>ENCRYPTED CONNECTION</span>
                            </div>
                            <span>VER 2.1.0-RC</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
