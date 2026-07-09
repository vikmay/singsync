const https = require('https');
const cheerio = require('cheerio');
https.get('https://pisennyk.com.ua/skryabin/spi-sobi-sama', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        const $ = cheerio.load(data);
        console.log('H4 text:', $('h4.my-auto').text().trim());
        console.log('H2 text:', $('h2').text().trim());
        console.log('H3 text:', $('h3').text().trim());
        console.log('Title text only:', $('h1').contents().first().text().trim());
    });
});
