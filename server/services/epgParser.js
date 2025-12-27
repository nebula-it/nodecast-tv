/**
 * EPG (XMLTV) Parser
 * Parses XMLTV format EPG data and extracts channel/programme information
 */

const { parseString } = require('xml2js');
const { promisify } = require('util');

const parseXml = promisify(parseString);

/**
 * Parse XMLTV date format (YYYYMMDDHHmmss +ZZZZ)
 * @param {string} dateStr - XMLTV format date string
 * @returns {Date}
 */
function parseXmltvDate(dateStr) {
    if (!dateStr) return null;

    // Format: 20231225120000 +0000
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
    if (!match) {
        // Try ISO format fallback
        return new Date(dateStr);
    }

    const [, year, month, day, hour, minute, second, tz] = match;
    let isoStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    if (tz) {
        const tzHours = tz.substring(0, 3);
        const tzMins = tz.substring(3);
        isoStr += `${tzHours}:${tzMins}`;
    } else {
        isoStr += 'Z';
    }

    return new Date(isoStr);
}

/**
 * Parse XMLTV content
 * @param {string} content - Raw XMLTV content
 * @returns {Promise<{ channels: Array, programmes: Array }>}
 */
async function parse(content) {
    const result = await parseXml(content, {
        explicitArray: false,
        mergeAttrs: true
    });

    if (!result.tv) {
        throw new Error('Invalid XMLTV format: missing <tv> root element');
    }

    const tv = result.tv;
    const channels = [];
    const programmes = [];

    // Parse channels
    const channelList = Array.isArray(tv.channel) ? tv.channel : (tv.channel ? [tv.channel] : []);
    for (const ch of channelList) {
        const channel = {
            id: ch.id,
            name: extractText(ch['display-name']),
            icon: ch.icon ? (ch.icon.src || ch.icon) : null,
            url: extractText(ch.url)
        };
        channels.push(channel);
    }

    // Parse programmes
    const programmeList = Array.isArray(tv.programme) ? tv.programme : (tv.programme ? [tv.programme] : []);
    for (const prog of programmeList) {
        const programme = {
            channelId: prog.channel,
            start: parseXmltvDate(prog.start),
            stop: parseXmltvDate(prog.stop),
            title: extractText(prog.title),
            subtitle: extractText(prog['sub-title']),
            description: extractText(prog.desc),
            category: extractCategories(prog.category),
            icon: prog.icon ? (prog.icon.src || prog.icon) : null,
            date: extractText(prog.date),
            episodeNum: extractEpisodeNum(prog['episode-num'])
        };
        programmes.push(programme);
    }

    return { channels, programmes };
}

/**
 * Extract text from XMLTV element (handles both string and object formats)
 */
function extractText(element) {
    if (!element) return null;
    if (typeof element === 'string') return element;
    if (Array.isArray(element)) {
        // Prefer English or first item
        const en = element.find(e => e.lang === 'en' || !e.lang);
        return extractText(en || element[0]);
    }
    if (element._) return element._;
    if (element['#text']) return element['#text'];
    return String(element);
}

/**
 * Extract categories array
 */
function extractCategories(category) {
    if (!category) return [];
    const cats = Array.isArray(category) ? category : [category];
    return cats.map(c => extractText(c)).filter(Boolean);
}

/**
 * Extract episode number
 */
function extractEpisodeNum(episodeNum) {
    if (!episodeNum) return null;
    const nums = Array.isArray(episodeNum) ? episodeNum : [episodeNum];

    for (const num of nums) {
        if (typeof num === 'string') return num;
        if (num._ || num['#text']) {
            return num._ || num['#text'];
        }
    }
    return null;
}

/**
 * Get programmes for a specific channel
 */
function getProgrammesForChannel(programmes, channelId) {
    return programmes.filter(p => p.channelId === channelId);
}

/**
 * Get current and upcoming programmes for a channel
 */
function getCurrentAndUpcoming(programmes, channelId, count = 5) {
    const now = new Date();
    const channelProgrammes = getProgrammesForChannel(programmes, channelId);

    // Sort by start time
    channelProgrammes.sort((a, b) => a.start - b.start);

    // Find current and upcoming
    const current = channelProgrammes.find(p => p.start <= now && p.stop > now);
    const upcoming = channelProgrammes
        .filter(p => p.start > now)
        .slice(0, count);

    return { current, upcoming };
}

/**
 * Fetch and parse XMLTV from URL
 */
async function fetchAndParse(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch EPG: ${response.status} ${response.statusText}`);
    }
    const content = await response.text();
    return parse(content);
}

module.exports = {
    parse,
    parseXmltvDate,
    fetchAndParse,
    getProgrammesForChannel,
    getCurrentAndUpcoming
};
