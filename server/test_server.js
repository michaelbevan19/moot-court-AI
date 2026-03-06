const express = require('express');
const app = express();
const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
});
setInterval(() => {
    console.log('Heartbeat...');
}, 5000);
