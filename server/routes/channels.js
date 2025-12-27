const express = require('express');
const router = express.Router();
const { hiddenItems } = require('../db');

// Get all hidden items
router.get('/hidden', (req, res) => {
    try {
        const { sourceId } = req.query;
        const items = hiddenItems.getAll(sourceId ? parseInt(sourceId) : null);
        res.json(items);
    } catch (err) {
        console.error('Error getting hidden items:', err);
        res.status(500).json({ error: 'Failed to get hidden items' });
    }
});

// Hide a channel or group
router.post('/hide', (req, res) => {
    try {
        const { sourceId, itemType, itemId } = req.body;

        if (!sourceId || !itemType || !itemId) {
            return res.status(400).json({ error: 'sourceId, itemType, and itemId are required' });
        }

        if (!['channel', 'group'].includes(itemType)) {
            return res.status(400).json({ error: 'itemType must be "channel" or "group"' });
        }

        hiddenItems.hide(sourceId, itemType, itemId);
        res.json({ success: true });
    } catch (err) {
        console.error('Error hiding item:', err);
        res.status(500).json({ error: 'Failed to hide item' });
    }
});

// Show (unhide) a channel or group
router.post('/show', (req, res) => {
    try {
        const { sourceId, itemType, itemId } = req.body;

        if (!sourceId || !itemType || !itemId) {
            return res.status(400).json({ error: 'sourceId, itemType, and itemId are required' });
        }

        hiddenItems.show(sourceId, itemType, itemId);
        res.json({ success: true });
    } catch (err) {
        console.error('Error showing item:', err);
        res.status(500).json({ error: 'Failed to show item' });
    }
});

// Check if item is hidden
router.get('/hidden/check', (req, res) => {
    try {
        const { sourceId, itemType, itemId } = req.query;

        if (!sourceId || !itemType || !itemId) {
            return res.status(400).json({ error: 'sourceId, itemType, and itemId are required' });
        }

        const isHidden = hiddenItems.isHidden(parseInt(sourceId), itemType, itemId);
        res.json({ hidden: isHidden });
    } catch (err) {
        console.error('Error checking hidden status:', err);
        res.status(500).json({ error: 'Failed to check hidden status' });
    }
});

// Bulk hide channels and groups
router.post('/hide/bulk', (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required' });
        }

        hiddenItems.bulkHide(items);
        res.json({ success: true, count: items.length });
    } catch (err) {
        console.error('Error bulk hiding items:', err);
        res.status(500).json({ error: 'Failed to bulk hide items' });
    }
});

// Bulk show channels and groups
router.post('/show/bulk', (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required' });
        }

        hiddenItems.bulkShow(items);
        res.json({ success: true, count: items.length });
    } catch (err) {
        console.error('Error bulk showing items:', err);
        res.status(500).json({ error: 'Failed to bulk show items' });
    }
});

module.exports = router;
