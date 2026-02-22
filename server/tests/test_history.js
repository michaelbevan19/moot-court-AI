const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:5000/api';
const TEST_EMAIL = 'test_history@gmail.com';

async function verifyHistory() {
    console.log('--- Verifying History Persistence ---');

    try {
        // 1. Init Session with Email
        console.log('\n[1] Initializing Session...');
        const formData = new FormData();
        // Create dummy files if not exist
        if (!fs.existsSync('dummy.pdf')) fs.writeFileSync('dummy.pdf', 'Dummy content');

        formData.append('petitioner', fs.createReadStream('dummy.pdf'));
        formData.append('respondent', fs.createReadStream('dummy.pdf'));
        formData.append('proposition', fs.createReadStream('dummy.pdf'));
        formData.append('email', TEST_EMAIL); // Crucial!

        const initRes = await axios.post(`${BASE_URL}/init-session`, formData, {
            headers: formData.getHeaders()
        });

        if (!initRes.data.success) throw new Error('Init failed');
        const sessionId = initRes.data.sessionId;
        console.log(`✅ Session Initialized: ${sessionId}`);

        // 2. Send a chat message (to have something in history)
        console.log('\n[2] Sending Chat Message...');
        await axios.post(`${BASE_URL}/chat`, {
            sessionId,
            message: "This is a test argument."
        });
        console.log('✅ Chat message sent');

        // 3. End Session (Should trigger save)
        console.log('\n[3] Ending Session...');
        const endRes = await axios.post(`${BASE_URL}/end-session`, { sessionId });
        if (!endRes.data.success) throw new Error('End session failed');
        console.log('✅ Session Ends. Report generated:', endRes.data.report.letter_grade);

        // 4. Verify History Retrieval
        console.log('\n[4] Retrieving History...');
        const histRes = await axios.get(`${BASE_URL}/history`, {
            params: { email: TEST_EMAIL }
        });

        if (!histRes.data.success) throw new Error('History fetch failed');

        const history = histRes.data.history;
        const savedSession = history.find(h => h.id === sessionId);

        if (savedSession) {
            console.log('✅ History Verified! Found saved session.');
            console.log('   Date:', savedSession.date);
            console.log('   Score:', savedSession.score);
        } else {
            console.error('❌ FAILED: Session not found in history.');
            console.log('   Current History:', JSON.stringify(history, null, 2));
        }

    } catch (error) {
        console.error('❌ Verification Failed:', error.response ? error.response.data : error.message);
    } finally {
        if (fs.existsSync('dummy.pdf')) fs.unlinkSync('dummy.pdf');
    }
}

verifyHistory();
