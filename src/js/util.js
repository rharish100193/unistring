// $Id$
import {
    GBP,
    WBP,
    SBP
} from "./constants.js"; // NO I18N
import {
    graphemeFinder,
    canBreak,
    wordFinder,
    canBreakWord,
    isInScriptWord,
    sentenceFinder,
    resolveSurrogates,
    wordIndexOf,
    getUTF16FromCodePoint
} from "./common-util.js"; // NO I18N
import { Grapheme } from "./graphmeme.js"; // NO I18N

const buildGraphemeClusters = (codePoints) => {
    const CODE_OFFSET = 96;

    let result = [];
    let propString = '';
    let prevIndex = 0;
    let i;
    let goal = codePoints.length;
    let rawIndex = 0;

    for (i = 0; i < goal; i++) {
        let nextProp = String.fromCharCode(CODE_OFFSET + graphemeFinder(codePoints[i]));

        if (canBreak(propString, nextProp)) {
            if (prevIndex < i) {
                let grapheme = new Grapheme(codePoints.slice(prevIndex, i), rawIndex);
                result.push(grapheme);
                rawIndex += grapheme.rawString.length;
            }

            prevIndex = i;
        }

        propString += nextProp;
    }

    if (canBreak(propString, String.fromCharCode(CODE_OFFSET + GBP.EOT))) {
        if (prevIndex < i) {
            result.push(
                new Grapheme(codePoints.slice(prevIndex, i), rawIndex)
            );
        }
    }

    return result;
};

const buildWordClusters = (codePoints, useScripts) => {
    const CODE_OFFSET = 96;

    let result = [];
    let prevIndex = 0;
    let prevProps = '';
    let nextProps = codePoints.map((cp) => String
        .fromCharCode(CODE_OFFSET + wordFinder(cp)))
        .join('') + String.fromCharCode(CODE_OFFSET + WBP.EOT);

    for (
        let i = 0, goal = nextProps.length;
        i < goal;
        i++, prevProps += nextProps.charAt(0), nextProps = nextProps.substring(1)
    ) {
        if (!canBreakWord(prevProps, nextProps)) {
            continue;
        }

        if (useScripts && i > 0 && isInScriptWord(prevProps, nextProps, codePoints[i - 1], codePoints[i])) {
            continue;
        }

        if (prevIndex < i) {
            result.push({
                text: codePoints.slice(prevIndex, i).map(getUTF16FromCodePoint).join(''),
                index: prevIndex,
                length: i - prevIndex,
                type: prevProps.substr(-1).charCodeAt(0) - CODE_OFFSET
            });
        }

        prevIndex = i;
    }

    return result;
};

const canBreakSentence = (prev, next) => {
    /*
		 * This rules are taken from:
		 * http://unicode.org/reports/tr29/, Version 9.0.0, 2016-06-20
		 * ===========================================================
		 */

    // Break at the start and end of text, unless the text is empty.
    //  SB1  sot  ÷  Any
    if (prev === '' && next !== '') {
        return true;
    }

    //  SB2  Any  ÷  eot
    if (prev !== '' && (/^b/).test(next)) {
        return true;
    }

    // Do not break within CRLF.
    //  SB3  CR  ×  LF
    if ((/c$/).test(prev) && (/^d/).test(next)) {
        return false;
    }

    // Break after paragraph separators.
    //  SB4  ParaSep  ÷
    if ((/[fcd]$/).test(prev)) {
        return true;
    }

    // Ignore Format and Extend characters, except after sot, ParaSep, and
    // within CRLF. (See Section 6.2, Replacing Ignore Rules.) This also
    // has the effect of: Any × (Format | Extend)
    //  SB5  X (Extend | Format)*  →  X
    if ((/^[ge]/).test(next)) {
        return false;
    }

    prev = prev.replace(/([^afcd])[ge]+/g, '$1'); // NO I18N
    next = next.replace(/(^|[^afcd])[ge]+/g, '$1'); // NO I18N

    // Do not break after full stop in certain contexts. [See note below.]
    //  SB6  ATerm  ×  Numeric
    if ((/m$/).test(prev) && (/^l/).test(next)) {
        return false;
    }

    //  SB7  (Upper | Lower) ATerm  ×  Upper
    if ((/[ij]m$/).test(prev) && (/^j/).test(next)) {
        return false;
    }

    //  SB8  ATerm Close* Sp*  ×  ( ¬(OLetter | Upper | Lower | ParaSep | SATerm) )* Lower
    if ((/mo*h*$/).test(prev) && (/^[^kjifcdmn]*i/).test(next)) {
        return false;
    }

    //  SB8a  SATerm Close* Sp*  ×  (SContinue | SATerm)
    if ((/[mn]o*h*$/).test(prev) && (/^[pmn]/).test(next)) {
        return false;
    }

    // Break after sentence terminators, but include closing punctuation,
    // trailing spaces, and any paragraph separator. [See note below.]
    //  SB9  SATerm Close*  ×  (Close | Sp | ParaSep)
    if ((/[mn]o*$/).test(prev) && (/^[ohfcd]/).test(next)) {
        return false;
    }

    //  SB10  SATerm Close* Sp*  ×  (Sp | ParaSep)
    if ((/[mn]o*h*$/).test(prev) && (/^[hfcd]/).test(next)) {
        return false;
    }

    //  SB11  SATerm Close* Sp* ParaSep?  ÷
    if ((/[mn]o*h*[fcd]?$/).test(prev)) {
        return true;
    }

    // Otherwise, do not break.
    //  SB998  Any  ×  Any
    return false;
};

const buildSentenceClusters = (codePoints) => {
    const CODE_OFFSET = 96;

    let result = [];
    let prevIndex = 0;
    let prevProps = '';
    let nextProps = codePoints.map((cp) => String
        .fromCharCode(CODE_OFFSET + sentenceFinder(cp)))
        .join('') + String.fromCharCode(CODE_OFFSET + SBP.EOT);

    for (
        let i = 0, goal = nextProps.length;
        i < goal;
        i++, prevProps += nextProps.charAt(0), nextProps = nextProps.substring(1)
    ) {
        if (!canBreakSentence(prevProps, nextProps)) {
            continue;
        }

        if (prevIndex < i) {
            result.push({
                text: codePoints.slice(prevIndex, i).map(getUTF16FromCodePoint).join(''),
                index: prevIndex,
                length: i - prevIndex,
                type: prevProps.substr(-1).charCodeAt(0) - CODE_OFFSET
            });
        }

        prevIndex = i;
    }

    return result;
};

const getWords = function (s, useScripts) {
    let result = buildWordClusters(resolveSurrogates(s), useScripts);

    Object.defineProperty(result, 'wordIndexOf', { // NO I18N
        value: wordIndexOf
    });

    return result;
};

const getSentences = (s) => buildSentenceClusters(resolveSurrogates(s));

export {
    buildGraphemeClusters,
    buildSentenceClusters,
    buildWordClusters,
    getWords,
    getSentences
};