const fs = require('fs');
const https = require('https');
const pdf = require('pdf-parse');

const url = 'https://prsindia.org/files/bills_acts/bills_parliament/2023/Bharatiya_Nyaya_Second_Sanhita,_2023.pdf';

const file = fs.createWriteStream('bns.pdf');
https.get(url, (res) => {
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Downloaded bns.pdf');
        const dataBuffer = fs.readFileSync('bns.pdf');
        pdf(dataBuffer).then(data => {
            fs.writeFileSync('bns.txt', data.text);
            console.log('Extracted text to bns.txt');
        }).catch(err => {
            console.error('Error parsing PDF:', err);
        });
    });
}).on('error', (err) => {
    console.error('Error downloading:', err);
});
