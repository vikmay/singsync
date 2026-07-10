import * as cheerio from 'cheerio';

async function test() {
    const res = await fetch('https://pisennyk.com.ua/pisni-do-tancyu/plache-zahmarene-nebo');
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Mimic parser logic
    let $content = $('.interpretation-content');
    if ($content.length) {
        $content.find('code').each((i, el) => {
            $(el).replaceWith('[' + $(el).text().trim() + ']');
        });
        
        let innerHtml = $content.html();
        console.log("Original HTML inside interpretation-content:\n", innerHtml.substring(0, 1500), "\n...");
        
        innerHtml = innerHtml.replace(/\n/g, ' ').replace(/\r/g, '');
        $content.html(innerHtml);
        $content.find('br').replaceWith('\n');
        // Let's see what else might be stripping the chorus?
        // Maybe the chorus is inside a different tag like <strong> or <blockquote>?
        // Let's print out what we get:
        let rawLines = $content.text().replace(/ {2,}/g, ' ');
        console.log("\nParsed rawLines:\n", rawLines);
    } else {
        console.log("No .interpretation-content found!");
    }
}
test();
