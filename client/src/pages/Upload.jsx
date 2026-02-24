import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const UploadPage = () => {
    const navigate = useNavigate();
    const [files, setFiles] = useState({
        petitioner: null,
        respondent: null,
        proposition: null
    });
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e, type) => {
        const file = e.target.files[0];
        setFiles(prev => ({ ...prev, [type]: file }));
    };

    const handleUpload = async () => {
        if (!files.petitioner || !files.respondent || !files.proposition) {
            alert("Please upload all three documents to proceed.");
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('petitioner', files.petitioner);
        formData.append('respondent', files.respondent);
        formData.append('proposition', files.proposition);

        // Append user email for history tracking
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            formData.append('email', user.email);
        }

        try {
            // Call the new init-session endpoint
            const response = await axios.post('http://localhost:5000/api/init-session', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.data.success) {
                // Navigate to CourtRoom with session data
                navigate('/courtroom', {
                    state: {
                        sessionId: response.data.sessionId,
                        initialMessage: response.data.message
                    }
                });
            } else {
                throw new Error(response.data.message || 'Initialization failed');
            }
        } catch (error) {
            console.error("Upload failed", error);
            alert("Upload failed. Please ensure the server is running and configured correctly.");
        } finally {
            setUploading(false);
        }
    };

    const UploadCard = ({ title, type, file }) => (
        <div className={`relative group p-6 rounded-xl border transition-all duration-300 ${file ? 'bg-primary/5 border-primary/50' : 'bg-slate-900/50 border-white/10 hover:border-white/20'}`}>
            <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-lg bg-slate-800 text-primary">
                    {file ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <FileText className="w-6 h-6" />}
                </div>
                {file && <span className="text-xs text-green-400 border border-green-400/20 px-2 py-1 rounded-full bg-green-400/10">Ready</span>}
            </div>

            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground mb-4">
                {type === 'petitioner' && 'Upload PDF with the petitioner\'s legal arguments.'}
                {type === 'respondent' && 'Upload PDF with the respondent\'s legal arguments.'}
                {type === 'proposition' && 'Upload PDF with the moot proposition or case statement.'}
            </p>

            <div className="relative">
                <input
                    type="file"
                    onChange={(e) => handleFileChange(e, type)}
                    accept=".pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-full py-2 px-4 rounded-lg border border-dashed border-white/20 flex items-center justify-center gap-2 text-sm text-muted-foreground group-hover:border-primary/50 group-hover:text-primary transition-colors">
                    <Upload className="w-4 h-4" />
                    {file ? file.name : "Select Document"}
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground p-8 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="max-w-5xl w-full relative z-10">
                <div className="text-center mb-12 space-y-4">
                    <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Upload Case Documents
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Upload the petitioner's brief, respondent's brief, and moot proposition to begin the simulation. All documents will be analyzed together to provide comprehensive case preparation.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-4xl mx-auto">
                    <UploadCard title="Petitioner's Brief" type="petitioner" file={files.petitioner} />
                    <UploadCard title="Respondent's Brief" type="respondent" file={files.respondent} />
                    <UploadCard title="Moot Proposition" type="proposition" file={files.proposition} />
                </div>

                <div className="flex justify-center">
                    <button
                        onClick={handleUpload}
                        disabled={uploading || !files.petitioner || !files.respondent || !files.proposition}
                        className="group relative px-8 py-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_40px_rgba(59,130,246,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                        <div className="flex items-center gap-3">
                            {uploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Synthesizing Case Data...</span>
                                </>
                            ) : (
                                <>
                                    <span>Enter Courtroom</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UploadPage;
