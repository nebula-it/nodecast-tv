const express = require('express');
const router = express.Router();
const { sources } = require('../db');
const xtreamApi = require('../services/xtreamApi');
const m3uParser = require('../services/m3uParser');
const epgParser = require('../services/epgParser');

/**
 * Proxy Xtream API calls
 * GET /api/proxy/xtream/:sourceId/:action
 */
router.get('/xtream/:sourceId/:action', async (req, res) => {
    try {
        const source = sources.getById(req.params.sourceId);
        if (!source || source.type !== 'xtream') {
            return res.status(404).json({ error: 'Xtream source not found' });
        }

        const api = xtreamApi.createFromSource(source);
        const { action } = req.params;
        const { category_id, stream_id, vod_id, series_id, limit } = req.query;

        let data;
        switch (action) {
            case 'auth':
                data = await api.authenticate();
                break;
            case 'live_categories':
                data = await api.getLiveCategories();
                break;
            case 'live_streams':
                data = await api.getLiveStreams(category_id);
                break;
            case 'vod_categories':
                data = await api.getVodCategories();
                break;
            case 'vod_streams':
                data = await api.getVodStreams(category_id);
                break;
            case 'vod_info':
                data = await api.getVodInfo(vod_id);
                break;
            case 'series_categories':
                data = await api.getSeriesCategories();
                break;
            case 'series':
                data = await api.getSeries(category_id);
                break;
            case 'series_info':
                data = await api.getSeriesInfo(series_id);
                break;
            case 'short_epg':
                data = await api.getShortEpg(stream_id, limit);
                break;
            default:
                return res.status(400).json({ error: 'Unknown action' });
        }

        res.json(data);
    } catch (err) {
        console.error('Xtream proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Get Xtream stream URL
 * GET /api/proxy/xtream/:sourceId/stream/:streamId
 */
router.get('/xtream/:sourceId/stream/:streamId/:type?', (req, res) => {
    try {
        const source = sources.getById(req.params.sourceId);
        if (!source || source.type !== 'xtream') {
            return res.status(404).json({ error: 'Xtream source not found' });
        }

        const api = xtreamApi.createFromSource(source);
        const { streamId, type = 'live' } = req.params;
        const { container = 'm3u8' } = req.query;

        const url = api.buildStreamUrl(streamId, type, container);
        res.json({ url });
    } catch (err) {
        console.error('Stream URL error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Fetch and parse M3U playlist
 * GET /api/proxy/m3u/:sourceId
 */
router.get('/m3u/:sourceId', async (req, res) => {
    try {
        const source = sources.getById(req.params.sourceId);
        if (!source || source.type !== 'm3u') {
            return res.status(404).json({ error: 'M3U source not found' });
        }

        const data = await m3uParser.fetchAndParse(source.url);
        res.json(data);
    } catch (err) {
        console.error('M3U proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * EPG cache - in-memory for performance
 * Structure: { [sourceId]: { data, fetchedAt } }
 */
const epgMemoryCache = {};

/**
 * Fetch and parse EPG (with caching)
 * GET /api/proxy/epg/:sourceId
 * Query params:
 *   - refresh=1  Force refresh, bypass cache
 *   - maxAge=N   Max cache age in hours (default 24)
 */
router.get('/epg/:sourceId', async (req, res) => {
    try {
        const sourceId = req.params.sourceId;
        const source = sources.getById(sourceId);
        if (!source || (source.type !== 'epg' && source.type !== 'xtream')) {
            return res.status(404).json({ error: 'Valid EPG source not found' });
        }

        const forceRefresh = req.query.refresh === '1';
        const maxAgeHours = parseInt(req.query.maxAge) || 24;
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

        // Check cache (unless force refresh)
        if (!forceRefresh && epgMemoryCache[sourceId]) {
            const cached = epgMemoryCache[sourceId];
            const age = Date.now() - cached.fetchedAt;
            if (age < maxAgeMs) {
                return res.json(cached.data);
            }
        }

        // Fetch fresh data
        let url = source.url;
        if (source.type === 'xtream') {
            const api = xtreamApi.createFromSource(source);
            url = api.getXmltvUrl();
        }

        const data = await epgParser.fetchAndParse(url);

        // Store in cache
        epgMemoryCache[sourceId] = {
            data,
            fetchedAt: Date.now()
        };

        res.json(data);
    } catch (err) {
        console.error('EPG proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Clear EPG cache for a source
 * DELETE /api/proxy/epg/:sourceId/cache
 */
router.delete('/epg/:sourceId/cache', (req, res) => {
    const sourceId = req.params.sourceId;
    delete epgMemoryCache[sourceId];
    res.json({ success: true });
});

/**
 * Get EPG for specific channels
 * POST /api/proxy/epg/:sourceId/channels
 */
router.post('/epg/:sourceId/channels', async (req, res) => {
    try {
        const source = sources.getById(req.params.sourceId);
        if (!source || source.type !== 'epg') {
            return res.status(404).json({ error: 'EPG source not found' });
        }

        const { channelIds } = req.body;
        if (!channelIds || !Array.isArray(channelIds)) {
            return res.status(400).json({ error: 'channelIds array required' });
        }

        const data = await epgParser.fetchAndParse(source.url);

        // Filter programmes for requested channels
        const result = {};
        for (const channelId of channelIds) {
            result[channelId] = epgParser.getCurrentAndUpcoming(data.programmes, channelId);
        }

        res.json(result);
    } catch (err) {
        console.error('EPG channels error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Proxy stream for playback
 * This handles CORS for streams that don't allow cross-origin
 */
router.get('/stream', async (req, res) => {
    try {
        let { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL required' });
        }

        // Forward some headers to be more "transparent" back to the origin
        const isPluto = url.includes('pluto.tv');

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            // Using https and matching the origin of the request
            'Origin': isPluto ? 'https://pluto.tv' : new URL(url).origin,
            'Referer': isPluto ? 'https://pluto.tv/' : new URL(url).origin + '/'
        };

        const response = await fetch(url, { headers });
        if (!response.ok) {
            console.error(`Upstream error for ${url}: ${response.status} ${response.statusText}`);
            return res.status(response.status).send(`Failed to fetch stream: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        res.set('Access-Control-Allow-Origin', '*');

        // Check if it's an HLS manifest
        const isHls = contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL') || url.toLowerCase().includes('.m3u8');

        if (isHls) {
            let manifest = await response.text();

            // Rewrite URLs inside manifest
            if (manifest.trim().startsWith('#EXTM3U')) {
                res.set('Content-Type', 'application/vnd.apple.mpegurl');

                const urlObj = new URL(url);
                const baseUrl = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);

                manifest = manifest.split('\n').map(line => {
                    const trimmed = line.trim();
                    if (trimmed === '' || trimmed.startsWith('#')) {
                        if (trimmed.includes('URI="')) {
                            return line.replace(/URI="([^"]+)"/g, (match, p1) => {
                                try {
                                    const absoluteUrl = new URL(p1, baseUrl).href;
                                    return `URI="${req.protocol}://${req.get('host')}${req.baseUrl}/stream?url=${encodeURIComponent(absoluteUrl)}"`;
                                } catch (e) { return match; }
                            });
                        }
                        return line;
                    }

                    try {
                        const absoluteUrl = new URL(trimmed, baseUrl).href;
                        return `${req.protocol}://${req.get('host')}${req.baseUrl}/stream?url=${encodeURIComponent(absoluteUrl)}`;
                    } catch (e) { return line; }
                }).join('\n');

                return res.send(manifest);
            }
        }

        // Binary content (segments)
        res.set('Content-Type', contentType);
        const buffer = await response.arrayBuffer();
        return res.send(Buffer.from(buffer));

    } catch (err) {
        console.error('Stream proxy error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

module.exports = router;
