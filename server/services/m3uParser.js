/**
 * M3U Playlist Parser
 * Parses EXTM3U format playlists and extracts channel information
 */

/**
 * Generate a simple stable ID from name and group
 * @param {string} name - Channel name
 * @param {string} group - Group title
 * @returns {string} Stable ID
 */
function generateStableId(name, group) {
    const str = `${name || 'unknown'}:${group || 'unknown'}`;
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `m3u_${Math.abs(hash).toString(36)}`;
}

/**
 * Parse M3U playlist content
 * @param {string} content - Raw M3U playlist content
 * @returns {{ channels: Array, groups: Array }}
 */
function parse(content) {
    const lines = content.split('\n').map(line => line.trim());
    const channels = [];
    const groupsSet = new Set();

    // Verify it's a valid M3U file
    if (!lines[0] || !lines[0].startsWith('#EXTM3U')) {
        throw new Error('Invalid M3U format: missing #EXTM3U header');
    }

    let currentInfo = null;
    let currentGroup = null;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('#EXTINF:')) {
            // Parse EXTINF line
            currentInfo = parseExtinf(line);
            if (currentInfo.groupTitle) {
                groupsSet.add(currentInfo.groupTitle);
                currentGroup = currentInfo.groupTitle;
            }
        } else if (line.startsWith('#EXTGRP:')) {
            // Parse EXTGRP line (alternative group specification)
            currentGroup = line.substring(8).trim();
            groupsSet.add(currentGroup);
            if (currentInfo) {
                currentInfo.groupTitle = currentGroup;
            }
        } else if (line && !line.startsWith('#')) {
            // This is a stream URL
            if (currentInfo) {
                const groupTitle = currentInfo.groupTitle || currentGroup || 'Uncategorized';
                // Generate a stable ID: use tvgId if present, otherwise hash name+group
                const stableId = currentInfo.tvgId || generateStableId(currentInfo.name, groupTitle);

                channels.push({
                    ...currentInfo,
                    id: stableId,
                    url: line,
                    groupTitle: groupTitle
                });
                currentInfo = null;
            }
        }
    }

    // Convert groups to array of objects
    const groups = Array.from(groupsSet).map((name, index) => ({
        id: `group_${index}`,
        name,
        channelCount: channels.filter(c => c.groupTitle === name).length
    }));

    return { channels, groups };
}

/**
 * Parse EXTINF line and extract attributes
 * @param {string} line - EXTINF line
 * @returns {Object} Parsed channel info
 */
function parseExtinf(line) {
    const info = {
        duration: -1,
        tvgId: null,
        tvgName: null,
        tvgLogo: null,
        groupTitle: null,
        name: null
    };

    // Extract duration and rest
    const match = line.match(/#EXTINF:(-?\d+\.?\d*)\s*(.*)/);
    if (!match) return info;

    info.duration = parseFloat(match[1]);
    const rest = match[2];

    // Extract attributes using regex
    const attrPatterns = {
        tvgId: /tvg-id="([^"]*)"/i,
        tvgName: /tvg-name="([^"]*)"/i,
        tvgLogo: /tvg-logo="([^"]*)"/i,
        groupTitle: /group-title="([^"]*)"/i
    };

    for (const [key, pattern] of Object.entries(attrPatterns)) {
        const attrMatch = rest.match(pattern);
        if (attrMatch) {
            info[key] = attrMatch[1];
        }
    }

    // Extract channel name (after the comma)
    const commaIndex = rest.lastIndexOf(',');
    if (commaIndex !== -1) {
        info.name = rest.substring(commaIndex + 1).trim();
    } else {
        // Fallback: use tvg-name or the whole rest
        info.name = info.tvgName || rest.trim();
    }

    // Generate ID if not present
    if (!info.tvgId) {
        info.tvgId = info.name ? info.name.toLowerCase().replace(/\s+/g, '_') : `channel_${Date.now()}`;
    }

    return info;
}

/**
 * Fetch and parse M3U from URL
 * @param {string} url - M3U playlist URL
 * @returns {Promise<{ channels: Array, groups: Array }>}
 */
async function fetchAndParse(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch M3U: ${response.status} ${response.statusText}`);
    }
    const content = await response.text();
    return parse(content);
}

module.exports = { parse, parseExtinf, fetchAndParse };
