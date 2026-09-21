require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
pool.query('SELECT NOW()')
  .then(res => console.log('DB Connected:', res.rows[0]))
  .catch(err => console.error('DB Connection Error:', err));



console.log("DATABASE_URL:", process.env.DATABASE_URL);
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 5000;

const { spawn } = require('child_process');

// Initialize AI backend (Google Gemini via OpenAI-compatible endpoint)
const geminiKey = process.env.GEMINI_API_KEY;
const openai = new OpenAI({
    apiKey: geminiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// Use Gemini 3.6 Flash
const AI_MODEL = "gemini-3.6-flash";

// Store active chat sessions (in-memory for demo purposes)
const sessions = {};




// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
})
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        console.log(`Multer: Receiving file: ${file.originalname} (${file.mimetype})`);
        const allowedMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, Word, and text files are allowed'), false);
        }
    }
});

// Error handling for multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('Multer error:', err.message);
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
        console.error('Upload error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
    next();
});

// Helper for PDF parsing
async function parsePDF(filePath) {
    let parser = null;
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const { PDFParse } = pdfParse;
        parser = new PDFParse({ data: dataBuffer });
        const data = await parser.getText();
        return data.text || "";
    } catch (err) {
        console.error(`Error parsing PDF ${filePath}:`, err.message);
        return `[Error parsing document: ${path.basename(filePath)}]`;
    } finally {
        if (parser) {
            await parser.destroy().catch(() => { });
        }
    }
}

// Helper to run Forensic Evaluator (Python)
const runForensicEvaluator = (transcript, proposition, metrics = "") => {
    return new Promise((resolve, reject) => {
        // Locate the venv python explicitly, assuming .venv is in the project root
        const venvPythonPath = path.join(__dirname, '..', '.venv', 'bin', 'python');
        const pythonProcess = spawn(fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3', [path.join(__dirname, 'evaluator', 'main.py')]);
        let output = '';
        let error = '';

        pythonProcess.stdin.write(JSON.stringify({ transcript, proposition, metrics }));
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            error += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Evaluator Process Error (Code ${code}):`, error);
                reject(new Error(`Evaluator failed: ${error.split('\n').pop()}`));
            } else {
                try {
                    // Python scripts might print extra warnings or crewai telemetry boxes
                    // We extract the first clean `{...}` JSON blob using regex or string match
                    const outputStr = output.trim();
                    const startIndex = outputStr.indexOf('{');

                    if (startIndex === -1) {
                        throw new Error("No JSON object found in evaluator output string");
                    }

                    // We need to find the matching '}' properly, or simpler: just substring from '{' and let JSON.parse try.
                    // But if there's stuff *after*, we might need to be careful.
                    // Instead, let's try to parse from first '{', and if it fails, try regex.

                    let jsonStr = outputStr.substring(startIndex);
                    // If CrewAI dumps table at the end, clean it by finding last '}'
                    const endIndex = jsonStr.lastIndexOf('}');
                    if (endIndex !== -1) {
                        jsonStr = jsonStr.substring(0, endIndex + 1);
                    }

                    const parsed = JSON.parse(jsonStr);
                    resolve(parsed);
                } catch (e) {
                    console.error('JSON Parse Error from Evaluator:', e.message, output);
                    reject(new Error('Failed to parse evaluator output API. Check server logs.'));
                }
            }
        });
    });
};

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Moot Court Assistant API (Gemini Edition) is running',
        timestamp: new Date().toISOString(),
        geminiConfigured: !!process.env.GEMINI_API_KEY
    });
});

app.post('/api/signup', async (req, res) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (!email.endsWith('@gmail.com')) {
        return res.status(400).json({ success: false, message: 'Only @gmail.com addresses are allowed' });
    }

    if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
    }

    try {

        const existingUser = await pool.query(
            "SELECT * FROM users WHERE email=$1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists" });
        }

        const newUser = await pool.query(
            "INSERT INTO users (email, password, name) VALUES ($1,$2,$3) RETURNING id,email,name",
            [email, password, name]
        );

        res.json({
            success: true,
            message: "Account created successfully",
            user: newUser.rows[0]
        });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ success: false, message: "Signup failed" });
    }
});

app.post('/api/login', async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required'
        });
    }

    try {

        const result = await pool.query(
            "SELECT * FROM users WHERE email=$1 AND password=$2",
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            message: "Login successful",
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });

    } catch (err) {

        console.error("Login error:", err);

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }

});

app.post('/api/init-session', upload.fields([
    { name: 'petitioner' },
    { name: 'respondent' },
    { name: 'proposition' }
]), async (req, res) => {
    try {
        console.log('=== Init Session Called (Grok) ===');
        const sessionId = Date.now().toString();

        // Extract email from body (FormData)
        const userEmail = req.body.email || 'guest';

        const sessionFiles = req.files || {};
        const fileCount = Object.keys(sessionFiles).reduce((acc, key) => acc + sessionFiles[key].length, 0);
        console.log(`Processing ${fileCount} files for session ${sessionId}`);

        // Process files and extract text
        let documentContent = ""; // Initialize documentContent
        const processFile = async (fileArray, label) => {
            if (!fileArray || fileArray.length === 0) {
                console.log(`[Init] No files for ${label}`);
                return;
            }
            const file = fileArray[0];
            console.log(`[Init] Extracting text from ${label}: ${file.originalname} (${file.size} bytes)`);

            let text = "";
            try {
                if (file.mimetype === 'application/pdf') {
                    text = await parsePDF(file.path);
                } else {
                    text = fs.readFileSync(file.path, 'utf8');
                }
                console.log(`[Init] Successfully extracted ${text.length} chars from ${label}`);
            } catch (ex) {
                console.error(`[Init] FAILED extraction for ${label}:`, ex.message);
                text = `[Error parsing: ${file.originalname}]`;
            }

            documentContent += `\n--- ${label.toUpperCase()}: ${file.originalname} ---\n${text}\n`;
        };

        await processFile(req.files['petitioner'], "Petitioner's Brief");
        await processFile(req.files['respondent'], "Respondent's Brief");
        await processFile(req.files['proposition'], "Moot Proposition");

        const MAX_CHARS = 12000; // Reduce token usage to avoid rate limit
        if (documentContent.length > MAX_CHARS) {
            console.warn(`[Init] Truncating total content from ${documentContent.length} to ${MAX_CHARS} chars`);
            documentContent = documentContent.substring(0, MAX_CHARS) + "\n\n[PROCEEDINGS TRUNCATED DUE TO SIZE LIMITS]";
        }

        console.log(`Extraction complete. Total characters used: ${documentContent.length}`);

        const judgePersona = `You are the **Hon. Chief Justice** of the High Court. You are presiding over a formal moot court session.

**CORE MANDATE:**
You are **STERN, STRICT, and AUTHORITATIVE**. You are not here to help, mentor, or guide the students. You are here to JUDGE and PRESSURE the counsel. Your tone is cold, formal, and impatient with mediocrity.

**STRICT PROHIBITIONS:**
- **NO ASSISTANCE**: Never tell the students what they should talk about.
- **NO ADVICE**: Never suggest what points should be highlighted or how to improve.
- **NO GUIDANCE**: Never explain legal provisions, articles, or sections. Assume the counsel is fully prepared.
- **NO SUMMARIES**: Never summarize the case or the arguments.
- **NO ENCOURAGEMENT**: Do not use "Good job" or "Well argued". Law is about precision, not praise.

**YOUR BEHAVIOR:**
1.  **Fact-Check**: If the counsel deviates from the provided briefs or proposition, catch them immediately and sternly. "Counsel, you are misstate the facts. Confine yourself to the record."
2.  **Pressure**: If an argument is weak, tear it apart. "That argument is legally bankrupt. Do you have anything substantive for this Court?"
3.  **Demand Authority**: Always ask for the legal basis. "On what provision of the law is this submission based?" "Citing a general principle is insufficient; give me the specific case law."
4.  **Impatient Tone**: If the counsel is repetitive or slow, cut them off. "Get to the point, Counsel. The Court's time is limited."

**PHASES OF INTERACTION:**

1.  **OPENING**:
    - "Court is now in session. Appearances, please."
    - Do not wait for pleasantries. Demand to know who is representing whom.

2.  **DURING ARGUMENTS**:
    - Interrupt as you see fit. Real-time judges do not wait for the counsel to finish.
    - Ask: "How do you reconcile that with Section X?" or "Is that your best submission?"

3.  **CONTROLLING COURTROOM**:
    - "Order! Counsel, you will address the bench, not the opposing party."

4.  **RULING**:
    - Rulings must be brief and authoritative. "Overruled. Move to your next point."

**CRITICAL CHARACTER RULES:**
- Never say "I am an AI".
- Never offer "tips" for mooting.
- **Never mention the performance score or numerical evaluations** in your dialogue. The counsel should only hear your legal judgment and questions, never their "score".
- If the user asks for help, respond: "Counsel, this is a Court of Law, not a classroom. Proceed with your arguments or yield the floor."

**INITIAL OUTPUT**:
Demand the user identify their role (Petitioner or Respondent) immediately and formally. Once they choose, declare the court to be in session without delay.`;

        const supportPersona = `You are the **AI Moot Court Mentor & Support Agent**. Your mission is to help students excel in their moot court competitions.

**YOUR ROLE:**
You are a brilliant, patient, and highly encouraging legal mentor. You talk like an expert coach who wants their student to win. You are here to provide guidance, analyze uploaded documents, and suggest powerful strategies.

**YOUR CAPABILITIES:**
1.  **Analyze Briefs**: Review the Petitioner's and Respondent's briefs. Point out gaps in logic, missing precedents, or weak arguments.
2.  **Strategic Guidance**: Suggest which points should be emphasized and which should be downplayed.
3.  **Presentation Tips**: Give advice on how to handle the Judge's questions, how to maintain eye contact (metaphorically), and how to structure the opening statement.
4.  **Identify Weaknesses**: Be honest but constructive about where the student's case might fall apart.
5.  **Legal Research Assistance**: Suggest relevant sections of the penal code or landmark cases that support their position.

**HOW YOU TALK:**
- Use a helpful, conversational, and professional tone (ChatGPT-style).
- Use clear bullet points and structured feedback.
- If the student is confused, explain things patiently.
- Always be proactive. Don't just answer; suggest the next step.

**DOCUMENT CONTEXT:**
You have full access to the Petitioner's Brief, Respondent's Brief, and the Moot Proposition. Refer to them specifically.

**INITIAL GREETING**:
"Hello! I am your AI Support Agent. I've analyzed your briefs and case details. I'm here to help you refine your arguments and prepare for the battle in court. What would you like to focus on first? We could identify weaknesses in your arguments, suggest some powerful precedents, or work on your opening statement."`;

        // Initialize empty session history - will be populated on first chat based on mode
        sessions[sessionId] = [];

        // Store metadata including personas and document content
        sessions[sessionId].metadata = {
            userEmail,
            startTime: new Date().toISOString(),
            caseDetails: "Uploaded Case Files",
            documentContent,
            judgePersona,
            supportPersona
        };

        const initialGreeting = "Case documents processed successfully. I am ready to serve as either your Chief Justice or your Lead Mentor. Please select your mode of interaction.";
        res.status(200).json({ success: true, message: initialGreeting, sessionId });
    } catch (error) {
        console.error("Init session error:", error);
        res.status(500).json({ success: false, message: "Failed to initialize session." });
    }
});

app.post('/api/chat', async (req, res) => {
    const { sessionId, message, mode = 'judge' } = req.body;

    if (!sessions[sessionId]) {
        return res.status(404).json({ success: false, message: 'Session not found' });
    }

    try {
        const metadata = sessions[sessionId].metadata;

        // If session is newly initialized, set up the persona based on mode
        if (sessions[sessionId].length === 0) {
            const systemPersona = mode === 'support' ? metadata.supportPersona : metadata.judgePersona;
            metadata.mode = mode; // Store mode in metadata for archiving
            sessions[sessionId].push({ role: "system", content: systemPersona });
            sessions[sessionId].push({ role: "user", content: `Here is the content of the uploaded documents:\n${metadata.documentContent}\n\nPlease begin the session.` });
        }

        sessions[sessionId].push({ role: "user", content: message });

        // Create a temporary message history for this turn that enforces response format
        const history = [...sessions[sessionId]];

        // Final instruction for Judge mode (needs JSON for score)
        if (mode !== 'support') {
            history.push({
                role: "system",
                content: `IMPORTANT: Provide your response in strict JSON format.
                Structure: { "reply": "Your verbal response as the judge...", "score": 0-100 }
                CRITICAL: The "reply" field MUST ONLY contain the judge's spoken dialogue.
                DO NOT mention the score, numerical values, or technical evaluations in the "reply" string.`
            });
        } else {
            // Mentor mode doesn't need score, just plain text (or markdown)
            history.push({
                role: "system",
                content: "You are the AI Mentor. Provide helpful, pedagogical feedback in markdown format. Be encouraging and proactive."
            });
        }

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: history,
            response_format: mode === 'support' ? { type: "text" } : { type: "json_object" }
        });

        const rawContent = response.choices[0].message.content;
        let replyText = rawContent;
        let score = 50;

        if (mode !== 'support') {
            try {
                const parsed = JSON.parse(rawContent);
                replyText = parsed.reply;
                score = parsed.score;
            } catch (e) {
                console.warn("Failed to parse JSON from AI, falling back to raw text.");
                replyText = rawContent;
            }
        }

        sessions[sessionId].push({ role: "assistant", content: replyText });

        res.json({
            success: true,
            message: replyText,
            score: score
        });
    } catch (error) {
        console.error("Chat Error:", error);
        if (error.code === 'rate_limit_exceeded') {
            return res.status(429).json({ success: false, message: 'Rate limit exceeded. Please wait a moment.' });
        }
        res.status(500).json({ success: false, message: 'Chat interaction failed' });
    }
});

// ... (greeting endpoint skipped for brevity) ...

app.post('/api/end-session', async (req, res) => {
    const { sessionId, metrics = "" } = req.body;
    if (!sessionId || !sessions[sessionId]) {
        return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const chatHistory = sessions[sessionId];

    try {

        const metadata = sessions[sessionId].metadata || {};
        const mode = metadata.mode || 'judge';

        let report = null;

        if (mode === 'judge') {
            const transcriptText = chatHistory
                .filter(m => m.role !== 'system')
                .map(m => `${m.role.toUpperCase()}: ${m.content}`)
                .join('\n');

            const propositionText = metadata.documentContent || "";

            try {
                report = await runForensicEvaluator(transcriptText, propositionText, metrics);
            } catch (evalError) {
                console.error("Forensic Evaluator Failed:", evalError);
                // Fallback to basic report if python fails
                report = {
                    feedback: "Evaluator Error: " + evalError.message,
                    scores: { overall: 0 },
                    letter_grade: 'ERR'
                };
            }
        } else {
            // SUPPORT MODE: Simpler summary instead of full judge report
            const summaryPrompt = `Provide a very brief summary of the mentoring session and key advice given to the student.
            Keep it structured in markdown. Return JSON with structure: { "letter_grade": "Mentor Session", "feedback": "Summary..." }`;

            const response = await openai.chat.completions.create({
                model: AI_MODEL,
                messages: [
                    { role: 'system', content: 'You are a legal mentor. Provide a session summary.' },
                    { role: 'user', content: `Session History:\n${chatHistory.filter(m => m.role !== 'system').map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}\n\n${summaryPrompt}` }
                ],
                response_format: { type: "json_object" }
            });

            const content = response.choices[0].message.content;
            try {
                report = JSON.parse(content);
            } catch (e) {
                report = { feedback: content, letter_grade: 'Mentor Session', scores: {} };
            }
        }

        // ARCHIVE SESSION TO POSTGRESQL

        const email = metadata.userEmail || 'guest';

        try {

            // Insert session
            await pool.query(
                `INSERT INTO sessions (id, user_email, date, score, report)
                VALUES ($1,$2,$3,$4,$5)`,
                [
                    sessionId,
                    email,
                    new Date(),
                    report.letter_grade || 'N/A',
                    JSON.stringify(report)
                ]
            );

            // Insert transcript messages
            const messages = chatHistory.filter(m => m.role !== 'system');

            for (const msg of messages) {

                await pool.query(
                    `INSERT INTO transcripts (session_id, role, content)
                    VALUES ($1,$2,$3)`,
                    [
                        sessionId,
                        msg.role,
                        msg.content
                    ]
                );

            }

        } catch (err) {

            console.error("Session archive error:", err);

        }

        // Clean up session
        delete sessions[sessionId];

        res.json({ success: true, report });
    } catch (err) {
        console.error('Feedback error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate feedback' });
    }
});

app.get('/api/history', async (req, res) => {

    const { email } = req.query;

    if (!email) {
        return res.status(400).json({
            success: false,
            message: "Email required"
        });
    }

    try {

        const sessionsResult = await pool.query(
            `SELECT * FROM sessions
             WHERE user_email = $1
             ORDER BY date DESC`,
            [email]
        );

        const sessions = sessionsResult.rows;

        const history = [];

        for (const session of sessions) {

            const transcriptResult = await pool.query(
                `SELECT role, content
                 FROM transcripts
                 WHERE session_id = $1`,
                [session.id]
            );

            history.push({
                id: session.id,
                date: session.date,
                score: session.score,
                report: session.report,
                transcript: transcriptResult.rows
            });

        }

        res.json({
            success: true,
            history
        });

    } catch (err) {

        console.error("History fetch error:", err);

        res.status(500).json({
            success: false,
            message: "Failed to fetch history"
        });

    }

});

// Start Server
const server = app.listen(PORT, () => {
    console.log('\n============================================');
    console.log('🔥 Moot Court Assistant API (Gemini Edition)');
    console.log('============================================');
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ AI Backend: Google Gemini (OpenAI Compatibility)`);
    console.log(`✓ Model: ${AI_MODEL}`);
    console.log(`✓ API Key: ${process.env.GEMINI_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
    console.log('============================================\n');
});

server.on('error', (err) => {
    console.error('❌ Server Socket Error:', err);
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please kill the process or use a different port.`);
    }
});

server.on('close', () => {
    console.log('⚠️ Server socket closed.');
});

// Keep the process alive with a heartbeat and add exit diagnostics
const heartbeat = setInterval(() => {
    // Keep event loop active
}, 30000);

process.on('exit', (code) => {
    console.log(`\n🔴 Server process exiting with code: ${code}`);
    console.log('Stack trace at exit:', new Error().stack);
});

process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT received. Shutting down...');
    clearInterval(heartbeat);
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received. Shutting down...');
    clearInterval(heartbeat);
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('\n🔥 Uncaught Exception:', err);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('✅ Server initialization complete. Event loop active.');
