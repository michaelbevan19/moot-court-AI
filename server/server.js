require('dotenv').config();
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

// Validate environment variables
// Initialize AI backend (detect Groq or xAI based on key prefix)
const xaiKey = process.env.XAI_API_KEY;
const isGroq = xaiKey && xaiKey.startsWith('gsk_');
const openai = new OpenAI({
    apiKey: xaiKey,
    baseURL: isGroq ? "https://api.groq.com/openai/v1" : "https://api.x.ai/v1",
});

// Use stable models: llama-3.3-70b-versatile for Groq, grok-2 for xAI
// Use stable models: llama-3.1-8b-instant for Groq (faster/efficient), grok-2 for xAI
const AI_MODEL = isGroq ? "llama-3.1-8b-instant" : "grok-2";

// Store active chat sessions (in-memory for demo purposes)
const sessions = {};
const USERS_FILE = path.join(__dirname, 'users.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Helper to read users
const readUsers = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

// Helper to write users
const writeUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// Helper to read history
const readHistory = () => {
    if (!fs.existsSync(HISTORY_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) { return {}; }
};

// Helper to write history
const writeHistory = (data) => {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
};


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

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Moot Court Assistant API (Grok Edition) is running',
        timestamp: new Date().toISOString(),
        grokConfigured: !!process.env.XAI_API_KEY
    });
});

app.post('/api/signup', (req, res) => {
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

    const users = readUsers();
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const newUser = { id: Date.now().toString(), email, password, name };
    users.push(newUser);
    writeUsers(users);

    res.json({ success: true, message: 'Account created successfully', user: { id: newUser.id, email: newUser.email, name: newUser.name } });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const users = readUsers();
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    res.json({ success: true, message: 'Login successful', user: { id: user.id, email: user.email, name: user.name } });
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

        const systemInstruction = `You are the **Hon. Chief Justice** of the High Court. You are presiding over the moot court session involving the documents provided (Petitioner's Brief, Respondent's Brief, and Moot Proposition).

**YOUR ROLE:**
You are **NOT** a mentor or a teacher. You are a **JUDGE**. Do not explain what you are doing. **ACT** as the judge.
You must simulate a real courtroom environment. You are authoritative, strict, and focused on the law and facts.

**DOCUMENTS:**
Use the provided briefs and proposition to:
1.  **Fact-Check**: If the counsel (User) deviates from the facts, correct them sternly.
2.  **Question**: Ask deep, probing questions based on the weaknesses in their brief.
3.  **Rule**: Make rulings on objections and applications based on the legal arguments presented.

**BEHAVIOR & TONE:**
- **Formal & Authoritative**: Use language appropriate for the bench ("Mr. Counsel," "Proceed," "Order in the court").
- **No Summaries**: Do NOT offer to summarize the case. Assume all parties know the facts.
- **Direct**: Stop the counsel if they are repetitive. Demand specific legal provisions and precedents.
- **STRICT LIMITATION**: Never explain legal provisions, articles, or sections. Never guide the student. Your role is solely to pressure the counsel with probing questions.

**PHASES OF INTERACTION (Adopt the appropriate phase):**

1.  **OPENING**:
    - "Court is now in session. Please be seated."
    - "In the matter of [Case Name/Parties], are both parties present? Appearances, please."

2.  **DURING ARGUMENTS**:
    - Question the counsel relentlessly.
    - "On what legal provision are you relying?"
    - "Do you have any precedent to support that argument?"
    - "Counsel, confine yourself to the facts."
    - "That argument is tenuous at best. Move on."

3.  **CONTROLLING COURTROOM**:
    - "Order! Maintain silence."
    - "Counsel, do not interrupt."

4.  **RULING/CLOSING**:
    - "Having considered the evidence..."
    - "The court finds..."
    - "The matter is adjourned."

**HANDLING INPUTS:**
- If the user sends a blank or initial message, start with the **OPENING**.
- If the user argues a point, **counter-argue** or ask for **authority**.
- If the user says "Objection", rule on it immediate ("Sustained" or "Overruled") and explain briefly why.

**CRITICAL INSTRUCTION:**
- **DO NOT** break character.
- **DO NOT** say "As an AI" or "I am simulating".
- **FORMATTING**: Use **Markdown** for emphasis but keep the structure conversational for speech (as this will be spoken via TTS). Break up long monologues.

**INITIAL OUPUT**:
Wait for the user to identify their role (Petitioner or Respondent). Once they choose, begin the **OPENING** phase immediately, addressing them by their chosen role and calling the case officially.`;

        // Initialize session history
        sessions[sessionId] = [
            { role: "system", content: systemInstruction },
            { role: "user", content: `Here is the content of the uploaded documents:\n${documentContent}\n\nPlease begin the session.` }
        ];

        // Store metadata
        sessions[sessionId].metadata = {
            userEmail,
            startTime: new Date().toISOString(),
            caseDetails: "Uploaded Case Files"
        };

        // Initial Role Selection Ask
        const initialGreeting = "Court is ready to convene. However, I must first know whom I am addressing. Counsel, are you representing the Petitioner or the Respondent?";
        sessions[sessionId].push({ role: "assistant", content: initialGreeting });

        res.status(200).json({ success: true, message: initialGreeting, sessionId });
    } catch (error) {
        console.error("Init session error:", error);
        res.status(500).json({ success: false, message: "Failed to initialize session." });
    }
});

app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body;

    if (!sessions[sessionId]) {
        return res.status(404).json({ success: false, message: 'Session not found' });
    }

    try {
        sessions[sessionId].push({ role: "user", content: message });

        // Create a temporary message history for this turn that enforces JSON output
        const messagesForTurn = [
            ...sessions[sessionId],
            {
                role: "system",
                content: `IMPORTANT: Provide your response in strict JSON format.
                Structure: { "reply": "Your verbal response as the judge...", "score": 0-100 }
                The 'score' should evaluate the user's latest argument quality (0=Terrible/Silent, 100=Perfect/Cites Law).`
            }
        ];

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: messagesForTurn,
            response_format: { type: "json_object" } // Force JSON mode if supported, or rely on prompt
        });

        const rawContent = response.choices[0].message.content;
        let replyText = rawContent;
        let score = 50; // Default

        try {
            const parsed = JSON.parse(rawContent);
            replyText = parsed.reply;
            score = parsed.score;
        } catch (e) {
            console.warn("Failed to parse JSON from AI, falling back to raw text.");
            replyText = rawContent; // Fallback
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
    const { sessionId } = req.body;
    if (!sessionId || !sessions[sessionId]) {
        return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const chatHistory = sessions[sessionId];

    try {
        const feedbackPrompt = `As a Moot Court Judge, provide a detailed performance report based on the session history.
        The report must evaluate the following specific criteria:
        1. Knowledge of Facts
        2. Knowledge of Law
        3. Application of Law
        4. Ability to answer questions thrown by the judge
        5. Etiquette and Formalities

        Return ONLY valid JSON with this structure:
        {
          "letter_grade": "A/B/C/D/F",
          "scores": {
            "knowledge_of_facts": 0-100,
            "knowledge_of_law": 0-100,
            "application_of_law": 0-100,
            "answering_questions": 0-100,
            "etiquette_formalities": 0-100,
            "overall": 0-100
          },
          "feedback": "Detailed markdown text analysis of each category above..."
        }
        
        SESSION HISTORY:
        ${chatHistory.filter(m => m.role !== 'system').map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`;

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{ role: 'system', content: 'You are a senior High Court Judge. Output strictly in JSON.' }, { role: 'user', content: feedbackPrompt }],
            response_format: { type: "json_object" }
        });

        let report = response.choices[0].message.content;
        try {
            report = JSON.parse(report);
        } catch (e) {
            console.error("Failed to parse report JSON", e);
            // Fallback object
            report = { feedback: report, scores: {}, letter_grade: 'N/A' };
        }

        // ARCHIVE SESSION
        const history = readHistory();
        const metadata = sessions[sessionId].metadata || {};
        const email = metadata.userEmail || 'guest';

        if (!history[email]) history[email] = [];

        history[email].push({
            id: sessionId,
            date: new Date().toISOString(),
            score: report.letter_grade || 'N/A',
            report: report,
            transcript: chatHistory.filter(m => m.role !== 'system')
        });

        writeHistory(history);

        // Clean up session
        delete sessions[sessionId];

        res.json({ success: true, report });
    } catch (err) {
        console.error('Feedback error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate feedback' });
    }
});

app.get('/api/history', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const history = readHistory();
    const userHistory = history[email] || [];
    res.json({ success: true, history: userHistory });
});

// Start Server
app.listen(PORT, () => {
    console.log('\n============================================');
    console.log('🔥 Moot Court Assistant API (Grok Edition)');
    console.log('============================================');
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ AI Backend: ${isGroq ? 'Groq' : 'xAI (Grok)'}`);
    console.log(`✓ Model: ${AI_MODEL}`);
    console.log(`✓ API Key: ${process.env.XAI_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
    console.log('============================================\n');
});
