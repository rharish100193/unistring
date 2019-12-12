// $Id$
import {
    GBP,
    GBP_NAMES,
    WBP,
    WBP_NAMES,
    SBP,
    SBP_NAMES,
    SCRIPT,
    SCRIPT_NAMES
} from "./constants.js"; // NO I18N
import {
    resolveSurrogates,
    graphemeFinder,
    wordFinder,
    sentenceFinder,
    scriptFinder,
    getUTF16FromCodePoint,
    getCodePointString
} from "./common-util.js"; // NO I18N
import { Grapheme } from "./graphmeme.js"; // NO I18N
import {
    buildGraphemeClusters,
    getWords,
    getSentences
} from "./util.js"; // NO I18N

class Unistring {

    constructor (s) {
        if (!(this instanceof Unistring)) {
            return new Unistring(s);
        }

        if (typeof s === 'string') { // NO I18N
            this.clusters = buildGraphemeClusters(resolveSurrogates(s));
        } else if (s instanceof Array) {
            this.clusters = [];
            let rawIndex = 0;

            for (let i = 0, goal = s.length; i < goal; i++) {
                if (!(s[i] instanceof Grapheme)) {
                    throw new Error(
                        'Unistring: invalid cluster class: ' + Object.prototype.toString.call(s[i])); // NO I18N
                }

                this.clusters[i] = s[i].clone();
                this.clusters[i].rawIndex = rawIndex;
                rawIndex += this.clusters[i].rawString.length;
            }
        } else {
            throw new Error('Unistring: invalid argument'); // NO I18N
        }
    }

    _ensureIndex (index, isEnd) {
        if (index === undefined) {
            index = isEnd ? this.clusters.length : 0;
        }

        if (index < 0) {
            index = this.clusters.length + index;
        }

        return Math.max(0, Math.min(index, this.clusters.length));
    }

    _toUnistring (s, caller) {
        if (typeof s === 'string') { // NO I18N
            return new Unistring(s);
        } else if (s instanceof Unistring) {
            return s;
        }

        throw new Error(
            'Unistring#' + (caller || '') + ': invalid argument'); // NO I18N

    }

    clone () {
        return new Unistring(this.clusters.slice());
    }

    dump (detail) {
        let log = [];

        if (detail) {
            this.clusters.forEach((g, index) => {
                log.push('*** Grapheme Cluster #' + index + ' ***'); // NO I18N
                log.push(g.dump(detail));
            });

            return log.join('\n'); // NO I18N
        }

        return '÷ ' + this.clusters // NO I18N
            .map((g) => g.dump(detail))
            .join(' ÷ ') + ' ÷'; // NO I18N

    }

    toString () {
        return this.clusters.reduce((result, g) => result + g.toString(), ''); // NO I18N
    }

    delete (start, length) {
        start = this._ensureIndex(start);

        if (length === undefined || start + length > this.clusters.length) {
            length = this.clusters.length - start;
        }

        length = Math.max(0, length);

        let delta = 0;

        for (let i = start, goal = start + length; i < goal; i++) {
            delta += this.clusters[i].rawString.length;
        }

        for (let i = start + length, goal = this.clusters.length; i < goal; i++) {
            this.clusters[i].rawIndex -= delta;
        }

        this.clusters.splice(start, length);

        return this;
    }

    insert (s, start) {
        start = this._ensureIndex(start);
        s = this._toUnistring(s, 'insert').clusters.slice(); // NO I18N

        let srcDelta = 0;
        let dstDelta = 0;

        if (start === this.clusters.length) {
            if (this.clusters.length) {
                let last = this.clusters.length - 1;

                srcDelta = this.clusters[last].rawIndex +
                    this.clusters[last].rawString.length;
            }
        } else {
            srcDelta = this.clusters[start].rawIndex;
        }

        for (let i = 0, goal = s.length; i < goal; i++) {
            s[i].rawIndex += srcDelta;
            dstDelta += s[i].rawString.length;
        }

        for (let i = start, goal = this.clusters.length; i < goal; i++) {
            this.clusters[i].rawIndex += dstDelta;
        }

        s.unshift(start, 0);
        this.clusters.splice.apply(this.clusters, s);

        return this;
    }

    append (s) {
        return this.insert(s, this.clusters.length);
    }

    codePointsAt (index) {
        index = this._ensureIndex(index);

        if (index < 0 || index >= this.clusters.length) {
            return undefined;
        }

        return this.clusters[index].codePoints;
    }

    clusterAt (index) {
        return this.rawStringAt.apply(this, arguments);
    }

    rawStringAt (index) {
        index = this._ensureIndex(index);

        if (index < 0 || index >= this.clusters.length) {
            return '';
        }

        return this.clusters[index].rawString;
    }

    rawIndexAt (index) {
        index = this._ensureIndex(index);

        if (index < 0 || this.clusters.length === 0 || index > this.clusters.length) {
            return NaN;
        }

        if (index === this.clusters.length) {
            return this.clusters[index - 1].rawIndex +
                this.clusters[index - 1].rawString.length;
        }

        return this.clusters[index].rawIndex;
    }

    forEach () {
        this.clusters.forEach.apply(this.clusters, arguments);
    }

    getClusterIndexFromUTF16Index (index) {
        let left = 0,
            right = this.clusters.length - 1;
        let middle, rawIndex, length;

        if (right >= 0 && index === this.clusters[right].rawIndex + this.clusters[right].rawString.length) {
            return right + 1;
        }

        while (left <= right) {
            middle = ((left + right) / 2) >> 0;

            rawIndex = this.clusters[middle].rawIndex;
            length = this.clusters[middle].rawString.length;

            if (rawIndex + length - 1 < index) {
                left = middle + 1;
            } else if (index < rawIndex) {
                right = middle - 1;
            } else {
                return middle;
            }
        }

        return -1;
    }

    /*
		 * string like properties and methods
		 */

    get length () {
        return this.clusters.length;
    }

    charAt (index) {
        if (index < 0 || index >= this.clusters.length) {
            return '';
        }

        return this.clusters[index].rawString.charAt(0);
    }

    charCodeAt (index) {
        if (index < 0 || index >= this.clusters.length) {
            return NaN;
        }

        return this.clusters[index].codePoints[0];
    }

    substring (start, end) {
        if (start === undefined) {
            start = 0;
        }

        if (end === undefined) {
            end = this.clusters.length;
        }

        start = Math.max(0, Math.min(start, this.clusters.length));
        end = Math.max(0, Math.min(end, this.clusters.length));

        if (start > end) {
            let tmp = start;
            start = end;
            end = tmp;
        }

        return new Unistring(this.clusters.slice(start, end));
    }

    substr (start, length) {
        start = this._ensureIndex(start);

        if (length === undefined || start + length > this.clusters.length) {
            length = this.clusters.length - start;
        }

        if (length < 0) {
            length = 0;
        }

        return new Unistring(this.clusters.slice(start, start + length));
    }

    slice (start, end) {
        start = this._ensureIndex(start);
        end = this._ensureIndex(end, true);

        return new Unistring(this.clusters.slice(start, end));
    }

    concat (s) {
        return this.insert(s, this.clusters.length);
    }

    indexOf (s) {
        s = this._toUnistring(s, 'indexOf'); // NO I18N

        let whole = this.toString();
        let part = s.toString();
        let rawIndex = 0;
        let clusterIndex = 0;

        while ((rawIndex = whole.indexOf(part, rawIndex)) >= 0) {
            while (clusterIndex < this.clusters.length && this.clusters[clusterIndex].rawIndex < rawIndex) {
                clusterIndex++;
            }

            if (clusterIndex >= this.clusters.length) {
                return -1;
            }

            if (this.substr(clusterIndex, s.length).toString() === part) {
                return clusterIndex;
            }

            rawIndex++;
        }

        return -1;
    }

    lastIndexOf (s) {
        s = this._toUnistring(s, 'lastIndexOf'); // NO I18N

        let whole = this.toString();
        let part = s.toString();
        let rawIndex = whole.length - 1;
        let clusterIndex = this.clusters.length - 1;

        while (rawIndex >= 0 && (rawIndex = whole.lastIndexOf(part, rawIndex)) >= 0) {
            /* eslint-disable indent */
            while (clusterIndex >= 0 && this.clusters[clusterIndex].rawIndex > rawIndex) {
                clusterIndex--;
            }

            if (clusterIndex < 0) {
                return -1;
            }

            if (this.substr(clusterIndex, s.length).toString() === part) {
                return clusterIndex;
            }

            rawIndex--;
            /* eslint-enable indent */
        }

        return -1;
    }

    toLowerCase (useLocale) {
        /* eslint-disable indent */
        let method = useLocale && 'toLocaleLowerCase' in String.prototype ? // NO I18N
            'toLocaleLowerCase' : 'toLowerCase'; // NO I18N

        return new Unistring(this.toString()[method]());
        /* eslint-enable indent */
    }

    toUpperCase (useLocale) {
        /* eslint-disable indent */
        let method = useLocale && 'toLocaleUpperCase' in String.prototype ? // NO I18N
            'toLocaleUpperCase' : 'toUpperCase'; // NO I18N

        return new Unistring(this.toString()[method]());
        /* eslint-enable indent */
    }

}

Unistring.getCodePointArray = resolveSurrogates;
Unistring.getGraphemeBreakProp = graphemeFinder;
Unistring.getWordBreakProp = wordFinder;
Unistring.getSentenceBreakProp = sentenceFinder;
Unistring.getScriptProp = scriptFinder;
Unistring.getUTF16FromCodePoint = getUTF16FromCodePoint;
Unistring.getCodePointString = getCodePointString;
Unistring.getWords = getWords;
Unistring.getSentences = getSentences;
Unistring.GBP = GBP;
Unistring.WBP = WBP;
Unistring.SBP = SBP;
Unistring.SCRIPT = SCRIPT;
Unistring.GBP_NAMES = GBP_NAMES;
Unistring.WBP_NAMES = WBP_NAMES;
Unistring.SBP_NAMES = SBP_NAMES;
Unistring.SCRIPT_NAMES = SCRIPT_NAMES;

export { Unistring };