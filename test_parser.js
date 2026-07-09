const ts = require('typescript');
const fs = require('fs');

const chordParserCode = fs.readFileSync('d:/IT/SingSync/singsync/src/lib/chordParser.ts', 'utf8');

// A minimal version of the parser logic from chordParser.ts
const line = "Вступ: [A#] [A7] [Dm] [C] [A#] [A] [A7]";
const placements = [];
let text = '';
let chordsStr = '';

const parts = line.split(/(\[[^\]]+\])/);

for (const part of parts) {
    if (part.startsWith('[') && part.endsWith(']')) {
        const chord = part.slice(1, -1);
        placements.push({ i: text.length, c: chord });
        chordsStr += chord + '   ';
    } else {
        text += part;
    }
}

console.log({ text, chordsStr, placements });
