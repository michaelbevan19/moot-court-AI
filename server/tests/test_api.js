const axios = require('./server/node_modules/axios');

async function testApi() {
    const sessionId = 'test-session-' + Date.now();

    console.log('1. Initializing Session...');
    try {
        const initRes = await axios.post('http://localhost:5000/api/init-session', {
            caseDetails: "This is a test case about potential murder.",
            petitionerBrief: "Petitioner claims self-defense.",
            respondentBrief: "Respondent claims premeditation."
        });
        console.log('Session ID:', initRes.data.sessionId);

        console.log('\n2. Testing Chat (Expecting Score)...');
        const chatRes = await axios.post('http://localhost:5000/api/chat', {
            sessionId: initRes.data.sessionId,
            message: "My client acted in self-defense because he saw a weapon."
        });
        console.log('Chat Response:', chatRes.data);
        if (chatRes.data.score !== undefined) {
            console.log('PASS: Score received:', chatRes.data.score);
        } else {
            console.error('FAIL: No score received');
        }

        console.log('\n3. Testing End Session (Expecting Report)...');
        const endRes = await axios.post('http://localhost:5000/api/end-session', {
            sessionId: initRes.data.sessionId
        });
        console.log('End Session Response Report:', JSON.stringify(endRes.data.report, null, 2));

        if (endRes.data.report && endRes.data.report.scores) {
            console.log('PASS: Report received with scores');
        } else {
            console.error('FAIL: Report missing or invalid structure');
        }

    } catch (error) {
        console.error('Test Failed:', error.response ? error.response.data : error.message);
    }
}

testApi();
