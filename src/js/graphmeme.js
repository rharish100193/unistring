// $Id$
import {
    getUTF16FromCodePoint,
    getCodePointString
} from "./common-util.js"; // NO I18N

export class Grapheme {

    constructor (codePoints, rawIndex) {
        if (codePoints !== undefined) {
            this.codePoints = codePoints;
            this.updateRawString();
        }

        if (rawIndex !== undefined) {
            this.rawIndex = rawIndex;
        }
    }

    toString () {
        return this.rawString;
    }

    clone () {
        let result = new Grapheme();
        result.codePoints = this.codePoints.slice();
        result.rawString = this.rawString;
        result.rawIndex = this.rawIndex;

        return result;
    }

    updateRawString () {
        this.rawString = this.codePoints
            .reduce((result, cp) => result + getUTF16FromCodePoint(cp), '');
    }

    dump (detail) {
        if (detail) {
            let log = [];

            log.push('codePoints: [' + this.codePoints // NO I18N
                .map((cp) => getCodePointString(cp, 'unicode')) // NO I18N
                .join(', ') + ']'); // NO I18N

            log.push('  rawIndex: ' + this.rawIndex); // NO I18N
            log.push(' rawString: (' + this.rawString.length + ') "' + this.rawString + '"'); // NO I18N

            return log.join('\n'); // NO I18N
        }

        return this.codePoints
            .map(getCodePointString)
            .join(' × '); // NO I18N

    }

}