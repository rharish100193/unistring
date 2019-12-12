// $Id$
import {
    GRAPHEME_BREAK_PROPS,
    GRAPHEME_BREAK_PROP_UNIT_LENGTH,
    WORD_BREAK_PROPS,
    WORD_BREAK_PROP_UNIT_LENGTH,
    SENTENCE_BREAK_PROPS,
    SENTENCE_BREAK_PROP_UNIT_LENGTH,
    SCRIPTS,
    SCRIPT,
    SBP,
    WBP,
    GBP,
    SCRIPTS_PROP_UNIT_LENGTH
} from "./constants.js"; // NO I18N

const pick2 = (data, index) => {
    return data.charCodeAt(index) | data.charCodeAt(index + 1) << 8;
};

const pick3 = (data, index) => {
    return data.charCodeAt(index) |
        data.charCodeAt(index + 1) << 8 |
        data.charCodeAt(index + 2) << 16;
};

const pick4 = (data, index) => {
    return data.charCodeAt(index) | data.charCodeAt(index + 1) << 8 | data.charCodeAt(index + 2) << 16 |
    data.charCodeAt(index + 3) << 24;
};

const find = (cp, table, units, otherValue) => {
    let left = 0,
        right = ((table.length / units) >> 0) - 1;
    let middle, index, middlecp, length;

    while (left <= right) {
        middle = ((left + right) / 2) >> 0;
        index = middle * units;

        middlecp = pick4(table, index + 1);
        length = (middlecp >> 21) & 0x7ff;
        middlecp &= 0x1fffff;

        if (middlecp + length - 1 < cp) {
            left = middle + 1;
        } else if (cp < middlecp) {
            right = middle - 1;
        } else {
            return table.charCodeAt(index);
        }
    }

    return otherValue;
};

const createFinder = (table, units, otherValue) => {
    let cache = {};

    return function (cp) {
        if (cp in cache) {
            return cache[cp];
        }

        cache[cp] = find(cp, table, units, otherValue);

        return cache[cp];
    };
};

const graphemeFinder = createFinder(
    GRAPHEME_BREAK_PROPS, GRAPHEME_BREAK_PROP_UNIT_LENGTH, GBP.Other);
const wordFinder = createFinder(
    WORD_BREAK_PROPS, WORD_BREAK_PROP_UNIT_LENGTH, WBP.Other);
const sentenceFinder = createFinder(
    SENTENCE_BREAK_PROPS, SENTENCE_BREAK_PROP_UNIT_LENGTH, SBP.Other);
const scriptFinder = createFinder(
    SCRIPTS, SCRIPTS_PROP_UNIT_LENGTH, SCRIPT.Unknown);

const resolveSurrogates = (s) => {
    let result = [];

    s.replace(/[\ud800-\udb7f][\udc00-\udfff]|[\s\S]/g, (character) => {
        if (character.length === 2) {
            let hcp = character.charCodeAt(0);
            let lcp = character.charCodeAt(1);

            result.push(((hcp & 0x03c0) + 0x0040) << 10 | (hcp & 0x003f) << 10 | (lcp & 0x03ff));
        } else {
            result.push(character.charCodeAt(0));
        }
    });

    return result;
};

const canBreak = (prev, next) => {
    /*
		 * This rules are taken from:
		 * http://unicode.org/reports/tr29/, Version 9.0.0, 2016-06-20
		 * ===========================================================
		 */

    // Break at the start and end of text.
    //   GB1: sot  ÷
    if (prev === '') {
        return true;
    }

    //   GB2: ÷  eot
    if (next === 'b') { // NO I18N
        return true;
    }

    // Do not break between a CR and LF.
    // Otherwise, break before and after controls.
    //   GB3: CR  ×  LF
    if ((/d$/).test(prev) && next === 'e') { // NO I18N
        return false;
    }

    //   GB4: ( Control | CR | LF )  ÷
    if ((/[fde]$/).test(prev)) {
        return true;
    }

    //   GB5: ÷  ( Control | CR | LF )
    if ((/^[fde]/).test(next)) {
        return true;
    }

    // Do not break Hangul syllable sequences.
    //   GB6: L  ×  ( L | V | LV | LVT )
    if ((/j$/).test(prev) && (/^[jkmn]/).test(next)) {
        return false;
    }

    //   GB7: ( LV | V )  ×  ( V | T )
    if ((/[mk]$/).test(prev) && (/^[kl]/).test(next)) {
        return false;
    }

    //   GB8: ( LVT | T)  ×  T
    if ((/[nl]$/).test(prev) && next === 'l') { // NO I18N
        return false;
    }

    // Do not break before extending characters.
    //   GB9: ×  ( Extend | ZWJ )
    if ((/^[gq]/).test(next)) {
        return false;
    }

    // Only for extended grapheme clusters:
    // Do not break before SpacingMarks, or after Prepend characters.
    //   GB9a:          ×  SpacingMark
    if (next === 'i') { // NO I18N
        return false;
    }

    //   GB9b: Prepend  ×
    if ((/c$/).test(prev)) {
        return false;
    }

    // Do not break within emoji modifier sequences or emoji zwj sequences.
    //   GB10: ( E_Base | EBG ) Extend*  ×  E_Modifier
    if ((/[os]g*$/).test(prev) && next === 'p') { // NO I18N
        return false;
    }

    //   GB11:                      ZWJ  ×  (Glue_After_Zwj | EBG)
    if ((/q$/).test(prev) && (/^[rs]/).test(next)) {
        return false;
    }

    // Do not break within emoji flag sequences. That is, do not break
    // between regional indicator (RI) symbols if there is an odd number of
    // RI characters before the break point.
    //   GB12: ^ ( RI RI )* RI  ×  RI
    if ((/^(hh)*h$/).test(prev) && next === 'h') { // NO I18N
        return false;
    }

    //   GB13: [^RI] ( RI RI )* RI  ×  RI
    if ((/[^h](hh)*h$/).test(prev) && next === 'h') { // NO I18N
        return false;
    }

    // Otherwise, break everywhere.
    //   GB999: Any  ÷  Any
    return true;
};

const canBreakWord = function (prev, next) {
    /*
    * This rules are taken from:
    * http://unicode.org/reports/tr29/, Version 9.0.0, 2016-06-20
    * ===========================================================
    */

    // Break at the start and end of text.
    //  WB1: sot  ÷
    if (prev === '') {
        return true;
    }

    //  WB2:  ÷  eot
    if ((/^a/).test(next)) {
        return true;
    }

    // Do not break within CRLF.
    //  WB3: CR  ×  LF
    if ((/f$/).test(prev) && (/^g/).test(next)) {
        return false;
    }

    // Otherwise break before and after Newlines (including CR and LF)
    //  WB3a: (Newline | CR | LF)  ÷
    if ((/[hfg]$/).test(prev)) {
        return true;
    }

    //  WB3b:  ÷  (Newline | CR | LF)
    if ((/^[hfg]/).test(next)) {
        return true;
    }

    // Do not break within emoji zwj sequences.
    //  WB3c: ZWJ  ×  (Glue_After_Zwj | EBG)
    if ((/t$/).test(prev) && (/^[uv]/).test(next)) {
        return false;
    }

    // Ignore Format and Extend characters, except after sot, CR, LF, and
    // Newline. (See Section 6.2, Replacing Ignore Rules.) This also has
    // the effect of: Any × (Format | Extend | ZWJ)
    //  WB4: X (Extend | Format | ZWJ)*  →  X
    if ((/^[ikt]/).test(next)) {
        return false;
    }

    prev = prev.replace(/([^afgh])[ikt]+/g, '$1'); // NO I18N
    next = next.replace(/(^|[^afgh])[ikt]+/g, '$1'); // NO I18N

    // Do not break between most letters.
    //  WB5: AHLetter  ×  AHLetter
    //  * AHLetter represents (ALetter | Hebrew_Letter)
    if ((/[le]$/).test(prev) && (/^[le]/).test(next)) {
        return false;
    }

    // Do not break letters across certain punctuation.
    //  WB6: AHLetter  ×  (MidLetter | MidNumLetQ) AHLetter
    //  * MidNumLetQ represents (MidNumLet | Single_Quote)
    if ((/[le]$/).test(prev) && (/^[mod][le]/).test(next)) {
        return false;
    }

    //  WB7: AHLetter (MidLetter | MidNumLetQ)  ×  AHLetter
    if ((/[le][mod]$/).test(prev) && (/^[le]/).test(next)) {
        return false;
    }

    //  WB7a: Hebrew_Letter  ×  Single_Quote
    if ((/e$/).test(prev) && (/^d/).test(next)) {
        return false;
    }

    //  WB7b: Hebrew_Letter  ×  Double_Quote Hebrew_Letter
    if ((/e$/).test(prev) && (/^ce/).test(next)) {
        return false;
    }

    //  WB7c: Hebrew_Letter Double_Quote  ×  Hebrew_Letter
    if ((/ec$/).test(prev) && (/^e/).test(next)) {
        return false;
    }

    // Do not break within sequences of digits, or digits adjacent to
    // letters (“3a”, or “A3”).
    //  WB8: Numeric  ×  Numeric
    if ((/p$/).test(prev) && (/^p/).test(next)) {
        return false;
    }

    //  WB9: AHLetter  ×  Numeric
    if ((/[le]$/).test(prev) && (/^p/).test(next)) {
        return false;
    }

    //  WB10: Numeric  ×  AHLetter
    if ((/p$/).test(prev) && (/^[le]/).test(next)) {
        return false;
    }

    // Do not break within sequences, such as “3.2” or “3,456.789”.
    //  WB11: Numeric (MidNum | MidNumLetQ)  ×  Numeric
    if ((/p[nod]$/).test(prev) && (/^p/).test(next)) {
        return false;
    }

    //  WB12: Numeric  ×  (MidNum | MidNumLetQ) Numeric
    if ((/p$/).test(prev) && (/^[nod]p/).test(next)) {
        return false;
    }
    // Do not break between Katakana.
    //  WB13: Katakana  ×  Katakana
    //  [unistring extension]: do not use this rule. use WB13-unistring-1 instead of.
    // if (/w$/.test(prev) && /^w/.test(next)) return false;

    // [unistring extension]: Do not break between Katakana, Hiragana, KanaExtension
    //  WB13-unistring-1: Katakana       ×  Katakana
    //                    Hiragana       ×  Hiragana
    //                    KanaExtension  ×  KanaExtension
    if ((/[wxy]$/).test(prev) && prev.substr(-1) === next.charAt(0)) {
        return false;
    }

    // [unistring extension]: Do not break between Kana and its extension
    //  WB13-unistring-2: (Katakana | Hiragana)  ×  KanaExtension
    if ((/[wx]$/).test(prev) && (/^y/).test(next)) {
        return false;
    }

    // [unistring extension]: Do not break between Kana and its extension
    //  WB13-unistring-3: KanaExtension  ×  (Katakana | Hiragana)
    if ((/y$/).test(prev) && (/^[wx]/).test(next)) {
        return false;
    }

    // Do not break from extenders.
    //  WB13a: (AHLetter | Numeric | Katakana | Hiragana | KanaExtension | ExtendNumLet)  ×  ExtendNumLet
    //  [unistring extension]: added Hiragana and KanaExtension
    if ((/[lepwxyq]$/).test(prev) && (/^q/).test(next)) {
        return false;
    }

    //  WB13b: ExtendNumLet  ×  (AHLetter | Numeric | Katakana | Hiragana | KanaExtension)
    //  [unistring extension]: added Hiragana and KanaExtension
    if ((/q$/).test(prev) && (/^[lepwxyq]/).test(next)) {
        return false;
    }

    // Do not break within emoji modifier sequences.
    //  WB14: (E_Base | EBG)  ×  E_Modifier
    if ((/[rv]$/).test(prev) && (/^s/).test(next)) {
        return false;
    }

    // Do not break within emoji flag sequences. That is, do not break
    // between regional indicator (RI) symbols if there is an odd number of
    // RI characters before the break point.
    //  WB15: ^ (RI RI)* RI  ×  RI
    if ((/^(jj)*j$/).test(prev) && (/^j/).test(next)) {
        return false;
    }

    //  WB16: [^RI] (RI RI)* RI  ×  RI
    if ((/[^j](jj)*j$/).test(prev) && (/^j/).test(next)) {
        return false;
    }

    // Otherwise, break everywhere (including around ideographs).
    // WB999: Any  ÷  Any
    return true;
};

const isInScriptWord = (prev, next, prevcp, nextcp) => {
    prev = prev.substr(-1);
    next = next.charAt(0);

    //  Space  ×  Space
    if (prev === 'z' && next === 'z') { // NO I18N
        return true;
    }

    //  !Space  ÷   Space
    if (prev !== 'z' && next === 'z') { // NO I18N
        return false;
    }

    //  Space  ÷  !Space
    if (prev === 'z' && next !== 'z') { // NO I18N
        return false;
    }

    if ((/[ab]/).test(prev) || (/[ab]/).test(next)) {
        return false;
    }

    return scriptFinder(prevcp) === scriptFinder(nextcp);
};

const getUTF16FromCodePoint = (cp) => {
    let p = (cp & 0x1f0000) >> 16;
    let o = cp & 0xffff;

    if (p) {
        return String.fromCharCode(0xd800 | ((p - 1) << 6) | ((o & 0xfc00) >> 10)) +
            String.fromCharCode(0xdc00 | (o & 0x03ff));
    }

    return String.fromCharCode(o);
};

const getCodePointString = (cp, type) => {
    let result = '';

    if (cp < 0x10000) {
        result = ('0000' + cp.toString(16).toUpperCase()).substr(-4); // NO I18N
    } else {
        result = cp.toString(16).toUpperCase();
    }

    switch (type) {
        case 'entity': // NO I18N
            result = '&#x' + result + ';'; // NO I18N
            break;
        case 'unicode': // NO I18N
            result = 'U+' + result; // NO I18N
            break;
    }

    return result;
};

const wordIndexOf = function (index) {
    let left = 0,
        right = this.length - 1;
    let middle, rawIndex, length;

    while (left <= right) {
        middle = ((left + right) / 2) >> 0;

        rawIndex = this[middle].index;
        length = this[middle].length;

        if (rawIndex + length - 1 < index) {
            left = middle + 1;
        } else if (index < rawIndex) {
            right = middle - 1;
        } else {
            return middle;
        }
    }

    return -1;
};

export {
    pick2,
    pick3,
    graphemeFinder,
    wordFinder,
    scriptFinder,
    sentenceFinder,
    resolveSurrogates,
    canBreak,
    canBreakWord,
    isInScriptWord,
    getUTF16FromCodePoint,
    getCodePointString,
    wordIndexOf
};