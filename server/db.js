const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'db.json');

// Initialize database structure
function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      // Ensure all keys exist
      return {
        sources: data.sources || [],
        hiddenItems: data.hiddenItems || [],
        favorites: data.favorites || [],
        nextId: data.nextId || 1
      };
    }
  } catch (err) {
    console.error('Error loading database:', err);
  }
  return {
    sources: [],
    hiddenItems: [],
    favorites: [],
    nextId: 1
  };
}

function saveDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Source CRUD operations
const sources = {
  getAll() {
    const db = loadDb();
    return db.sources;
  },

  getById(id) {
    const db = loadDb();
    return db.sources.find(s => s.id === parseInt(id));
  },

  getByType(type) {
    const db = loadDb();
    return db.sources.filter(s => s.type === type && s.enabled);
  },

  create(source) {
    const db = loadDb();
    const newSource = {
      id: db.nextId++,
      ...source,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.sources.push(newSource);
    saveDb(db);
    return newSource;
  },

  update(id, updates) {
    const db = loadDb();
    const index = db.sources.findIndex(s => s.id === parseInt(id));
    if (index === -1) return null;

    db.sources[index] = {
      ...db.sources[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    saveDb(db);
    return db.sources[index];
  },

  delete(id) {
    const db = loadDb();
    db.sources = db.sources.filter(s => s.id !== parseInt(id));
    // Also delete related hidden items
    db.hiddenItems = db.hiddenItems.filter(h => h.source_id !== parseInt(id));
    saveDb(db);
  },

  toggleEnabled(id) {
    const db = loadDb();
    const source = db.sources.find(s => s.id === parseInt(id));
    if (source) {
      source.enabled = !source.enabled;
      source.updated_at = new Date().toISOString();
      saveDb(db);
    }
    return source;
  }
};

// Hidden items operations
const hiddenItems = {
  getAll(sourceId = null) {
    const db = loadDb();
    if (sourceId) {
      return db.hiddenItems.filter(h => h.source_id === parseInt(sourceId));
    }
    return db.hiddenItems;
  },

  hide(sourceId, itemType, itemId) {
    const db = loadDb();
    // Check if already hidden
    const exists = db.hiddenItems.find(
      h => h.source_id === parseInt(sourceId) && h.item_type === itemType && h.item_id === itemId
    );
    if (!exists) {
      db.hiddenItems.push({
        id: db.nextId++,
        source_id: parseInt(sourceId),
        item_type: itemType,
        item_id: itemId
      });
      saveDb(db);
    }
  },

  show(sourceId, itemType, itemId) {
    const db = loadDb();
    db.hiddenItems = db.hiddenItems.filter(
      h => !(h.source_id === parseInt(sourceId) && h.item_type === itemType && h.item_id === itemId)
    );
    saveDb(db);
  },

  isHidden(sourceId, itemType, itemId) {
    const db = loadDb();
    return db.hiddenItems.some(
      h => h.source_id === parseInt(sourceId) && h.item_type === itemType && h.item_id === itemId
    );
  },

  bulkHide(items) {
    const db = loadDb();
    let modified = false;

    items.forEach(item => {
      const { sourceId, itemType, itemId } = item;
      const exists = db.hiddenItems.find(
        h => h.source_id === parseInt(sourceId) && h.item_type === itemType && h.item_id === itemId
      );

      if (!exists) {
        db.hiddenItems.push({
          id: db.nextId++,
          source_id: parseInt(sourceId),
          item_type: itemType,
          item_id: itemId
        });
        modified = true;
      }
    });

    if (modified) {
      saveDb(db);
    }
    return true;
  },

  bulkShow(items) {
    const db = loadDb();
    const initialLength = db.hiddenItems.length;

    // Create a set of "signatures" for O(1) lookup of items to remove
    const toRemove = new Set(items.map(i => `${i.sourceId}:${i.itemType}:${i.itemId}`));

    db.hiddenItems = db.hiddenItems.filter(h =>
      !toRemove.has(`${h.source_id}:${h.item_type}:${h.item_id}`)
    );

    if (db.hiddenItems.length !== initialLength) {
      saveDb(db);
    }
    return true;
  }
};

// Favorites operations
const favorites = {
  getAll(sourceId = null, itemType = null) {
    const db = loadDb();
    let results = db.favorites;
    if (sourceId) {
      results = results.filter(f => f.source_id === parseInt(sourceId));
    }
    if (itemType) {
      results = results.filter(f => f.item_type === itemType);
    }
    return results;
  },

  add(sourceId, itemId, itemType = 'channel') {
    const db = loadDb();
    // Check if already favorited
    const exists = db.favorites.find(
      f => f.source_id === parseInt(sourceId) && f.item_id === String(itemId) && f.item_type === itemType
    );
    if (!exists) {
      db.favorites.push({
        id: db.nextId++,
        source_id: parseInt(sourceId),
        item_id: String(itemId),
        item_type: itemType, // 'channel', 'movie', 'series'
        created_at: new Date().toISOString()
      });
      saveDb(db);
    }
    return true;
  },

  remove(sourceId, itemId, itemType = 'channel') {
    const db = loadDb();
    db.favorites = db.favorites.filter(
      f => !(f.source_id === parseInt(sourceId) && f.item_id === String(itemId) && f.item_type === itemType)
    );
    saveDb(db);
    return true;
  },

  isFavorite(sourceId, itemId, itemType = 'channel') {
    const db = loadDb();
    return db.favorites.some(
      f => f.source_id === parseInt(sourceId) && f.item_id === String(itemId) && f.item_type === itemType
    );
  }
};


// EPG cache operations (simple in-memory for now)
const epgCache = {
  cache: new Map(),

  get(channelId) {
    return this.cache.get(channelId);
  },

  set(sourceId, channelId, data) {
    this.cache.set(channelId, { sourceId, data, updated_at: new Date() });
  },

  clear(sourceId = null) {
    if (sourceId) {
      for (const [key, value] of this.cache) {
        if (value.sourceId === sourceId) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
};

module.exports = { sources, hiddenItems, favorites, epgCache };
