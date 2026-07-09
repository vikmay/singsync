const https = require('https');
const cheerio = require('cheerio');
https.get('https://pisennyk.com.ua/skryabin/spi-sobi-sama', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const $ = cheerio.load(data);
        console.log('h1 html:', $('h1').html());
    });
});
