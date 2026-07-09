const cheerio = require('cheerio');
const $ = cheerio.load('<div class="interpretation-content">Вступ: <code>A#</code> <code>A7</code> <code>Dm</code> <code>C</code> <code>A#</code> <code>A</code> <code>A7</code></div>');
let $content = $('.interpretation-content');
$content.find('code').each((i, el) => {
    $(el).replaceWith('[' + $(el).text().trim() + ']');
});
console.log('rawLines:', $content.text());
