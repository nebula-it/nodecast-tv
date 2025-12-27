/**
 * Source Manager Component
 * Handles adding, editing, and deleting sources (Xtream, M3U, EPG)
 */

class SourceManager {
    constructor() {
        this.xtreamList = document.getElementById('xtream-list');
        this.m3uList = document.getElementById('m3u-list');
        this.epgList = document.getElementById('epg-list');

        // Content browser state
        this.contentType = 'channels'; // 'channels' or 'movies'

        this.init();
    }

    init() {
        // Add source buttons
        document.getElementById('add-xtream').addEventListener('click', () => this.showAddModal('xtream'));
        document.getElementById('add-m3u').addEventListener('click', () => this.showAddModal('m3u'));
        document.getElementById('add-epg').addEventListener('click', () => this.showAddModal('epg'));

        // Initialize content browser
        this.initContentBrowser();
    }

    /**
     * Load and display all sources
     */
    async loadSources() {
        try {
            const sources = await API.sources.getAll();

            this.renderSourceList(this.xtreamList, sources.filter(s => s.type === 'xtream'), 'xtream');
            this.renderSourceList(this.m3uList, sources.filter(s => s.type === 'm3u'), 'm3u');
            this.renderSourceList(this.epgList, sources.filter(s => s.type === 'epg'), 'epg');
        } catch (err) {
            console.error('Error loading sources:', err);
        }
    }

    /**
     * Render source list
     */
    renderSourceList(container, sources, type) {
        if (sources.length === 0) {
            container.innerHTML = `<p class="hint">No ${type.toUpperCase()} sources configured</p>`;
            return;
        }

        const icons = { xtream: '📡', m3u: '📋', epg: '📺' };

        container.innerHTML = sources.map(source => `
      <div class="source-item ${source.enabled ? '' : 'disabled'}" data-id="${source.id}">
        <span class="source-icon">${icons[type]}</span>
        <div class="source-info">
          <div class="source-name">${source.name}</div>
          <div class="source-url">${source.url}</div>
        </div>
        <div class="source-actions">
          <button class="btn btn-sm btn-secondary" data-action="refresh" title="Refresh Data">🔄</button>
          <button class="btn btn-sm btn-secondary" data-action="test" title="Test Connection">🔗</button>
          <button class="btn btn-sm btn-secondary" data-action="toggle" title="${source.enabled ? 'Disable' : 'Enable'}">
            ${source.enabled ? '✓' : '○'}
          </button>
          <button class="btn btn-sm btn-secondary" data-action="edit" title="Edit">✏️</button>
          <button class="btn btn-sm btn-danger" data-action="delete" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');

        // Attach event listeners
        container.querySelectorAll('.source-item').forEach(item => {
            const id = parseInt(item.dataset.id);

            item.querySelector('[data-action="refresh"]').addEventListener('click', () => this.refreshSource(id, type));
            item.querySelector('[data-action="test"]').addEventListener('click', () => this.testSource(id));
            item.querySelector('[data-action="toggle"]').addEventListener('click', () => this.toggleSource(id));
            item.querySelector('[data-action="edit"]').addEventListener('click', () => this.showEditModal(id, type));
            item.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteSource(id));
        });
    }

    /**
     * Show add source modal
     */
    showAddModal(type) {
        const modal = document.getElementById('modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const footer = document.getElementById('modal-footer');

        const titles = { xtream: 'Add Xtream Connection', m3u: 'Add M3U Playlist', epg: 'Add EPG Source' };
        title.textContent = titles[type];

        body.innerHTML = this.getSourceForm(type);

        footer.innerHTML = `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">Add Source</button>
    `;

        modal.classList.add('active');

        // Event listeners
        modal.querySelector('.modal-close').onclick = () => modal.classList.remove('active');
        document.getElementById('modal-cancel').onclick = () => modal.classList.remove('active');
        document.getElementById('modal-save').onclick = () => this.saveNewSource(type);
    }

    /**
     * Show edit source modal
     */
    async showEditModal(id, type) {
        try {
            const source = await API.sources.getById(id);

            const modal = document.getElementById('modal');
            const title = document.getElementById('modal-title');
            const body = document.getElementById('modal-body');
            const footer = document.getElementById('modal-footer');

            title.textContent = `Edit ${type.toUpperCase()} Source`;
            body.innerHTML = this.getSourceForm(type, source);

            footer.innerHTML = `
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Save Changes</button>
      `;

            modal.classList.add('active');

            modal.querySelector('.modal-close').onclick = () => modal.classList.remove('active');
            document.getElementById('modal-cancel').onclick = () => modal.classList.remove('active');
            document.getElementById('modal-save').onclick = () => this.updateSource(id, type);
        } catch (err) {
            console.error('Error loading source:', err);
        }
    }

    /**
     * Get source form HTML
     */
    getSourceForm(type, source = {}) {
        const nameField = `
      <div class="form-group">
        <label for="source-name">Name</label>
        <input type="text" id="source-name" class="form-input" placeholder="My Source" value="${source.name || ''}">
      </div>
    `;

        const urlField = `
      <div class="form-group">
        <label for="source-url">${type === 'xtream' ? 'Server URL' : 'URL'}</label>
        <input type="text" id="source-url" class="form-input" 
               placeholder="${type === 'xtream' ? 'http://server.com:port' : 'https://example.com/playlist.m3u'}" 
               value="${source.url || ''}">
      </div>
    `;

        if (type === 'xtream') {
            return `
        ${nameField}
        ${urlField}
        <div class="form-group">
          <label for="source-username">Username</label>
          <input type="text" id="source-username" class="form-input" value="${source.username || ''}">
        </div>
        <div class="form-group">
          <label for="source-password">Password</label>
          <input type="password" id="source-password" class="form-input" 
                 value="${source.password && !source.password.includes('•') ? source.password : ''}">
        </div>
      `;
        }

        return nameField + urlField;
    }

    /**
     * Save new source
     */
    async saveNewSource(type) {
        const name = document.getElementById('source-name').value.trim();
        const url = document.getElementById('source-url').value.trim();
        const username = document.getElementById('source-username')?.value.trim() || null;
        const password = document.getElementById('source-password')?.value.trim() || null;

        if (!name || !url) {
            alert('Name and URL are required');
            return;
        }

        try {
            await API.sources.create({ type, name, url, username, password });
            document.getElementById('modal').classList.remove('active');
            await this.loadSources();

            // Refresh channel list
            if (window.app?.channelList) {
                await window.app.channelList.loadSources();
                await window.app.channelList.loadChannels();
            }
        } catch (err) {
            alert('Error adding source: ' + err.message);
        }
    }

    /**
     * Update existing source
     */
    async updateSource(id, type) {
        const name = document.getElementById('source-name').value.trim();
        const url = document.getElementById('source-url').value.trim();
        const username = document.getElementById('source-username')?.value.trim();
        const password = document.getElementById('source-password')?.value.trim();

        if (!name || !url) {
            alert('Name and URL are required');
            return;
        }

        try {
            const data = { name, url };
            if (type === 'xtream') {
                data.username = username;
                if (password) data.password = password;
            }

            await API.sources.update(id, data);
            document.getElementById('modal').classList.remove('active');
            await this.loadSources();
        } catch (err) {
            alert('Error updating source: ' + err.message);
        }
    }

    /**
     * Delete source
     */
    async deleteSource(id) {
        if (!confirm('Are you sure you want to delete this source?')) return;

        try {
            await API.sources.delete(id);
            await this.loadSources();

            if (window.app?.channelList) {
                await window.app.channelList.loadSources();
                await window.app.channelList.loadChannels();
            }
        } catch (err) {
            alert('Error deleting source: ' + err.message);
        }
    }

    /**
     * Toggle source enabled/disabled
     */
    async toggleSource(id) {
        try {
            await API.sources.toggle(id);
            await this.loadSources();
        } catch (err) {
            alert('Error toggling source: ' + err.message);
        }
    }

    /**
     * Test source connection
     */
    async testSource(id) {
        try {
            const result = await API.sources.test(id);
            if (result.success) {
                alert('Connection successful!');
            } else {
                alert('Connection failed: ' + (result.error || result.message));
            }
        } catch (err) {
            alert('Connection failed: ' + err.message);
        }
    }

    /**
     * Refresh source data
     */
    async refreshSource(id, type) {
        try {
            const btn = document.querySelector(`.source-item[data-id="${id}"] [data-action="refresh"]`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳';
            }

            if (type === 'epg') {
                // Force refresh EPG data (server-side cache will be bypassed)
                if (window.app?.epgGuide) {
                    await window.app.epgGuide.loadEpg(true); // Force refresh
                }
                alert('EPG data refreshed!');
            } else if (type === 'xtream') {
                // Re-fetch xtream data by reloading channels
                if (window.app?.channelList) {
                    await window.app.channelList.loadChannels();
                }
                alert('Xtream data refreshed!');
            } else if (type === 'm3u') {
                // Re-fetch M3U data by reloading channels
                if (window.app?.channelList) {
                    await window.app.channelList.loadChannels();
                }
                alert('M3U playlist refreshed!');
            }

            if (btn) {
                btn.disabled = false;
                btn.textContent = '🔄';
            }
        } catch (err) {
            console.error('Error refreshing source:', err);
            alert('Refresh failed: ' + err.message);
        }
    }

    /**
     * Initialize content browser
     */
    initContentBrowser() {
        this.contentSourceSelect = document.getElementById('content-source-select');
        this.contentTree = document.getElementById('content-tree');
        this.channelsBtn = document.getElementById('content-type-channels');
        this.moviesBtn = document.getElementById('content-type-movies');
        this.seriesBtn = document.getElementById('content-type-series');

        // Content type toggle
        this.channelsBtn?.addEventListener('click', () => {
            this.contentType = 'channels';
            this.channelsBtn.classList.add('active');
            this.moviesBtn?.classList.remove('active');
            this.seriesBtn?.classList.remove('active');
            this.reloadContentTree();
        });

        this.moviesBtn?.addEventListener('click', () => {
            this.contentType = 'movies';
            this.moviesBtn.classList.add('active');
            this.channelsBtn?.classList.remove('active');
            this.seriesBtn?.classList.remove('active');
            this.reloadContentTree();
        });

        this.seriesBtn?.addEventListener('click', () => {
            this.contentType = 'series';
            this.seriesBtn.classList.add('active');
            this.channelsBtn?.classList.remove('active');
            this.moviesBtn?.classList.remove('active');
            this.reloadContentTree();
        });

        // Source selection
        this.contentSourceSelect?.addEventListener('change', () => this.reloadContentTree());

        // Show All / Hide All buttons
        document.getElementById('content-show-all')?.addEventListener('click', () => this.setAllVisibility(true));
        document.getElementById('content-hide-all')?.addEventListener('click', () => this.setAllVisibility(false));
    }

    /**
     * Reload content tree based on current type and source
     */
    reloadContentTree() {
        const sourceId = this.contentSourceSelect?.value;
        if (!sourceId) {
            const typeLabel = this.contentType === 'movies' ? 'movie categories' :
                this.contentType === 'series' ? 'series categories' : 'groups and channels';
            this.contentTree.innerHTML = `<p class="hint">Select a source to view ${typeLabel}</p>`;
            return;
        }

        if (this.contentType === 'movies') {
            this.loadMovieCategoriesTree(parseInt(sourceId));
        } else if (this.contentType === 'series') {
            this.loadSeriesCategoriesTree(parseInt(sourceId));
        } else {
            this.loadContentTree(parseInt(sourceId));
        }
    }

    /**
     * Load sources into content browser dropdown
     */
    async loadContentSources() {
        try {
            const sources = await API.sources.getAll();
            const select = document.getElementById('content-source-select');
            if (!select) return;

            // Keep the placeholder option
            select.innerHTML = '<option value="">Select a source...</option>';

            sources.filter(s => s.type === 'xtream' || s.type === 'm3u').forEach(source => {
                select.innerHTML += `<option value="${source.id}">${source.name} (${source.type})</option>`;
            });
        } catch (err) {
            console.error('Error loading content sources:', err);
        }
    }

    /**
     * Load content tree for a source
     * Checked = Visible, Unchecked = Hidden
     */
    async loadContentTree(sourceId) {
        this.contentTree.innerHTML = '<p class="hint">Loading...</p>';

        try {
            const source = await API.sources.getById(sourceId);
            let channels = [];

            let categoryMap = {};

            if (source.type === 'xtream') {
                // Run sequentially to avoid overwhelming the provider
                const categories = await API.proxy.xtream.liveCategories(sourceId);
                const streams = await API.proxy.xtream.liveStreams(sourceId);

                channels = streams;
                // Create map of category_id -> category_name
                categories.forEach(cat => {
                    categoryMap[cat.category_id] = cat.category_name;
                });
            } else if (source.type === 'm3u') {
                const m3uData = await API.proxy.m3u.get(sourceId);
                channels = m3uData.channels || [];
            }

            // Get currently hidden items
            const hiddenItems = await API.channels.getHidden(sourceId);
            const hiddenSet = new Set(hiddenItems.map(h => `${h.item_type}:${h.item_id}`));

            // Group channels
            const groups = {};
            channels.forEach(ch => {
                let groupName = 'Uncategorized';

                if (source.type === 'xtream') {
                    // Use category map for Xtream
                    if (ch.category_id && categoryMap[ch.category_id]) {
                        groupName = categoryMap[ch.category_id];
                    }
                } else {
                    // Use existing fields for M3U
                    groupName = ch.category_name || ch.groupTitle || 'Uncategorized';
                }

                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(ch);
            });

            // Render tree - checked = visible, unchecked = hidden
            let html = '';
            Object.keys(groups).sort().forEach(groupName => {
                const groupHidden = hiddenSet.has(`group:${groupName}`);
                const groupChannels = groups[groupName];

                html += `
                <div class="content-group collapsed" data-group="${groupName}">
                    <div class="content-group-header">
                        <span class="group-expander">▼</span>
                        <label class="checkbox-label" onclick="event.stopPropagation()">
                            <input type="checkbox" class="group-checkbox" data-type="group" data-id="${groupName}" data-source-id="${sourceId}" ${groupHidden ? '' : 'checked'}>
                            <span class="group-name">${groupName} (${groupChannels.length})</span>
                        </label>
                    </div>
                    <div class="content-channels">
                        ${groupChannels.map(ch => {
                    const channelId = ch.stream_id || ch.id || ch.url;
                    const channelName = ch.name || ch.tvgName || 'Unknown';
                    const channelHidden = hiddenSet.has(`channel:${channelId}`);
                    return `
                            <label class="checkbox-label channel-item" title="${channelName}">
                                <input type="checkbox" class="channel-checkbox" data-type="channel" data-id="${channelId}" data-source-id="${sourceId}" ${channelHidden ? '' : 'checked'}>
                                <span class="channel-name">${channelName}</span>
                            </label>`;
                }).join('')}
                    </div>
                </div>`;
            });

            this.contentTree.innerHTML = html || '<p class="hint">No channels found</p>';

            // Toggle group collapse on header click
            this.contentTree.querySelectorAll('.content-group-header').forEach(header => {
                header.addEventListener('click', () => {
                    const group = header.closest('.content-group');
                    group.classList.toggle('collapsed');
                });
            });

            // Attach change listeners for visibility toggling
            this.contentTree.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => this.toggleVisibility(cb));
            });

            // Group checkbox toggles all children (BULK)
            this.contentTree.querySelectorAll('.group-checkbox').forEach(groupCb => {
                groupCb.addEventListener('change', () => this.toggleGroupChildren(groupCb));
            });

        } catch (err) {
            console.error('Error loading content tree:', err);
            this.contentTree.innerHTML = '<p class="hint" style="color: var(--color-error);">Error loading content</p>';
        }
    }

    /**
     * Load movie categories tree for a source
     * Checked = Visible, Unchecked = Hidden
     */
    async loadMovieCategoriesTree(sourceId) {
        this.contentTree.innerHTML = '<p class="hint">Loading movie categories...</p>';

        try {
            const source = await API.sources.getById(sourceId);

            if (source.type !== 'xtream') {
                this.contentTree.innerHTML = '<p class="hint">Movie categories are only available for Xtream sources</p>';
                return;
            }

            // Fetch VOD categories
            const categories = await API.proxy.xtream.vodCategories(sourceId);

            if (!categories || categories.length === 0) {
                this.contentTree.innerHTML = '<p class="hint">No movie categories found</p>';
                return;
            }

            // Get currently hidden items
            const hiddenItems = await API.channels.getHidden(sourceId);
            const hiddenSet = new Set(hiddenItems.map(h => `${h.item_type}:${h.item_id}`));

            // Render categories - checked = visible, unchecked = hidden
            let html = '<div class="content-categories">';
            categories.sort((a, b) => a.category_name.localeCompare(b.category_name)).forEach(cat => {
                const isHidden = hiddenSet.has(`vod_category:${cat.category_id}`);
                html += `
                <label class="checkbox-label category-item">
                    <input type="checkbox" class="category-checkbox" 
                           data-type="vod_category" 
                           data-id="${cat.category_id}" 
                           data-source-id="${sourceId}" 
                           ${isHidden ? '' : 'checked'}>
                    <span class="category-name">${cat.category_name}</span>
                </label>`;
            });
            html += '</div>';

            this.contentTree.innerHTML = html;

            // Attach change listeners for visibility toggling
            this.contentTree.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => this.toggleVisibility(cb));
            });

        } catch (err) {
            console.error('Error loading movie categories:', err);
            this.contentTree.innerHTML = '<p class="hint" style="color: var(--color-error);">Error loading movie categories</p>';
        }
    }

    /**
     * Load series categories tree for a source
     * Checked = Visible, Unchecked = Hidden
     */
    async loadSeriesCategoriesTree(sourceId) {
        this.contentTree.innerHTML = '<p class="hint">Loading series categories...</p>';

        try {
            const source = await API.sources.getById(sourceId);

            if (source.type !== 'xtream') {
                this.contentTree.innerHTML = '<p class="hint">Series categories are only available for Xtream sources</p>';
                return;
            }

            // Fetch series categories
            const categories = await API.proxy.xtream.seriesCategories(sourceId);

            if (!categories || categories.length === 0) {
                this.contentTree.innerHTML = '<p class="hint">No series categories found</p>';
                return;
            }

            // Get currently hidden items
            const hiddenItems = await API.channels.getHidden(sourceId);
            const hiddenSet = new Set(hiddenItems.map(h => `${h.item_type}:${h.item_id}`));

            // Render categories - checked = visible, unchecked = hidden
            let html = '<div class="content-categories">';
            categories.sort((a, b) => a.category_name.localeCompare(b.category_name)).forEach(cat => {
                const isHidden = hiddenSet.has(`series_category:${cat.category_id}`);
                html += `
                <label class="checkbox-label category-item">
                    <input type="checkbox" class="category-checkbox" 
                           data-type="series_category" 
                           data-id="${cat.category_id}" 
                           data-source-id="${sourceId}" 
                           ${isHidden ? '' : 'checked'}>
                    <span class="category-name">${cat.category_name}</span>
                </label>`;
            });
            html += '</div>';

            this.contentTree.innerHTML = html;

            // Attach change listeners for visibility toggling
            this.contentTree.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => this.toggleVisibility(cb));
            });

        } catch (err) {
            console.error('Error loading series categories:', err);
            this.contentTree.innerHTML = '<p class="hint" style="color: var(--color-error);">Error loading series categories</p>';
        }
    }

    /**
     * Toggle visibility of a single item
     * Checked = show (remove from hidden), Unchecked = hide (add to hidden)
     */
    async toggleVisibility(checkbox) {
        const sourceId = parseInt(checkbox.dataset.sourceId);
        const itemType = checkbox.dataset.type;
        const itemId = checkbox.dataset.id;
        const isVisible = checkbox.checked;

        try {
            // Fire API call (don't await for faster UI response)
            const apiCall = isVisible
                ? API.channels.show(sourceId, itemType, itemId)
                : API.channels.hide(sourceId, itemType, itemId);

            // For VOD categories, don't refresh channel list (just let API complete in background)
            if (itemType === 'vod_category' || itemType === 'series_category') {
                apiCall.catch(err => {
                    console.error(`Error toggling ${itemType} visibility:`, err);
                    checkbox.checked = !isVisible; // Revert on error
                });
                return;
            }

            // For channels/groups, await and refresh
            await apiCall;

            // Refresh channel list if visible
            if (window.app?.channelList) {
                await window.app.channelList.loadHiddenItems();
                window.app.channelList.render();
            }
        } catch (err) {
            console.error('Error toggling visibility:', err);
            // Revert checkbox on error
            checkbox.checked = !isVisible;
        }
    }

    /**
     * Toggle all children of a group efficiently
     */
    async toggleGroupChildren(groupCb) {
        const group = groupCb.closest('.content-group');
        const channelCheckboxes = group.querySelectorAll('.channel-checkbox');
        const isChecked = groupCb.checked;
        const itemsToUpdate = [];

        // Identify items that need changing
        channelCheckboxes.forEach(chCb => {
            if (chCb.checked !== isChecked) {
                chCb.checked = isChecked;
                itemsToUpdate.push({
                    sourceId: parseInt(chCb.dataset.sourceId),
                    itemType: chCb.dataset.type,
                    itemId: chCb.dataset.id
                });
            }
        });

        if (itemsToUpdate.length === 0) return;

        try {
            if (isChecked) {
                await API.channels.bulkShow(itemsToUpdate);
            } else {
                await API.channels.bulkHide(itemsToUpdate);
            }

            // Refresh channel list
            if (window.app?.channelList) {
                await window.app.channelList.loadHiddenItems();
                window.app.channelList.render();
            }
        } catch (err) {
            console.error('Error toggling group children:', err);
            // We might want to revert UI here, but it's complex for bulk items
        }
    }

    /**
     * Set visibility for all items
     */
    async setAllVisibility(visible) {
        const sourceId = this.contentSourceSelect?.value;
        if (!sourceId) return;

        const checkboxes = this.contentTree.querySelectorAll('input[type="checkbox"]');
        const items = [];

        checkboxes.forEach(cb => {
            if (cb.checked !== visible) {
                items.push({
                    sourceId: parseInt(cb.dataset.sourceId),
                    itemType: cb.dataset.type,
                    itemId: cb.dataset.id
                });
                cb.checked = visible;
            }
        });

        if (items.length === 0) return;

        try {
            if (visible) {
                // Show all - use bulk API
                await API.channels.bulkShow(items);
            } else {
                // Hide all - use bulk API
                await API.channels.bulkHide(items);
            }

            // Refresh channel list
            if (window.app?.channelList) {
                await window.app.channelList.loadHiddenItems();
                window.app.channelList.render();
            }
        } catch (err) {
            console.error('Error setting all visibility:', err);
            alert('Failed to update visibility');
        }
    }

}

// Export
window.SourceManager = SourceManager;
