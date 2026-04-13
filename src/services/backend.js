const STORAGE_KEYS = {
  CROWD_READINGS: 'smartbus_crowdReadings',
  BUS_REQUESTS: 'smartbus_busRequests',
  FESTIVALS: 'smartbus_festivals',
  ROUTES: 'smartbus_routes',
  USERS: 'smartbus_users',
  TERMINALS: 'smartbus_terminals',
};

export const COLLECTIONS = {
  CROWD_READINGS: 'crowdReadings',
  BUS_REQUESTS: 'busRequests',
  FESTIVALS: 'festivals',
  ROUTES: 'routes',
  USERS: 'users',
};

const app = { name: 'local-storage-backend' };
const db = null;
const storage = null;

const readJson = (key, fallback = []) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed to read ${key} from localStorage:`, error);
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeFestivalKey = (festival = {}) =>
  `${String(festival.name || '').trim().toLowerCase()}|${String(festival.date || '').trim()}`;

const sortByDateDesc = (a, b, field = 'createdAt') => {
  const left = new Date(a?.[field] || a?.created_date || a?.timestamp || 0).getTime();
  const right = new Date(b?.[field] || b?.created_date || b?.timestamp || 0).getTime();
  return right - left;
};

const sortFestivals = (festivals = []) =>
  [...festivals].sort((a, b) => {
    const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

const loadCollection = (key) => readJson(key, []);
const saveCollection = (key, items) => writeJson(key, items);

const getFestivalDocuments = async () => loadCollection(STORAGE_KEYS.FESTIVALS);

const getUniqueAndDuplicateFestivals = (festivals = []) => {
  const seen = new Set();
  const unique = [];
  const duplicates = [];

  festivals.forEach((festival) => {
    const key = normalizeFestivalKey(festival);
    if (seen.has(key)) {
      duplicates.push(festival);
      return;
    }
    seen.add(key);
    unique.push(festival);
  });

  return {
    unique: sortFestivals(unique),
    duplicates: sortFestivals(duplicates),
  };
};

const subscribe = (readFn, callback) => {
  let previous = JSON.stringify(readFn());
  callback(readFn());

  const interval = setInterval(() => {
    const current = JSON.stringify(readFn());
    if (current !== previous) {
      previous = current;
      callback(readFn());
    }
  }, 1000);

  const handleStorage = (event) => {
    if (event.key && !Object.values(STORAGE_KEYS).includes(event.key)) return;
    const current = JSON.stringify(readFn());
    if (current !== previous) {
      previous = current;
      callback(readFn());
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    clearInterval(interval);
    window.removeEventListener('storage', handleStorage);
  };
};

const mapFirestoreLike = (items) => items.map(item => ({ id: item.id, ...item }));

export const crowdReadingsService = {
  async addReading(reading) {
    const readings = loadCollection(STORAGE_KEYS.CROWD_READINGS);
    const payload = {
      id: uid(),
      terminal_id: reading.terminal_id || localStorage.getItem('selectedTerminal') || 'madurai',
      ...reading,
      timestamp: reading.timestamp || new Date().toISOString(),
      createdAt: reading.createdAt || new Date().toISOString(),
    };
    readings.unshift(payload);
    saveCollection(STORAGE_KEYS.CROWD_READINGS, readings);
    return payload;
  },

  async getReadingsByRoute(routeId) {
    const readings = loadCollection(STORAGE_KEYS.CROWD_READINGS)
      .filter(reading => reading.route_id === routeId)
      .sort(sortByDateDesc);
    return mapFirestoreLike(readings);
  },

  async getAllReadings(terminalId) {
    const tid = terminalId || localStorage.getItem('selectedTerminal') || 'madurai';
    const readings = loadCollection(STORAGE_KEYS.CROWD_READINGS)
      .filter(r => r.terminal_id === tid)
      .sort(sortByDateDesc);
    return mapFirestoreLike(readings);
  },

  subscribeToReadings(callback) {
    return subscribe(() => loadCollection(STORAGE_KEYS.CROWD_READINGS).sort(sortByDateDesc), callback);
  },
};

export const busRequestsService = {
  async addRequest(request) {
    const requests = loadCollection(STORAGE_KEYS.BUS_REQUESTS);
    const payload = {
      id: uid(),
      terminal_id: request.terminal_id || localStorage.getItem('selectedTerminal') || 'madurai',
      ...request,
      createdAt: request.createdAt || new Date().toISOString(),
      created_date: request.created_date || request.requested_at || new Date().toISOString(),
      status: request.status || 'pending',
    };
    requests.unshift(payload);
    saveCollection(STORAGE_KEYS.BUS_REQUESTS, requests);
    return payload;
  },

  async updateRequest(id, updates) {
    const requests = loadCollection(STORAGE_KEYS.BUS_REQUESTS);
    const next = requests.map(request =>
      request.id === id ? { ...request, ...updates, updatedAt: new Date().toISOString() } : request
    );
    saveCollection(STORAGE_KEYS.BUS_REQUESTS, next);
  },

  async getAllRequests(terminalId) {
    const tid = terminalId || localStorage.getItem('selectedTerminal') || 'madurai';
    const items = loadCollection(STORAGE_KEYS.BUS_REQUESTS)
      .filter(r => r.terminal_id === tid)
      .sort(sortByDateDesc);
    return mapFirestoreLike(items);
  },

  subscribeToRequests(callback) {
    return subscribe(() => loadCollection(STORAGE_KEYS.BUS_REQUESTS).sort(sortByDateDesc), callback);
  },
};

export const festivalsService = {
  async getFestivals() {
    return sortFestivals(await getFestivalDocuments());
  },

  async getAllFestivals() {
    return sortFestivals(await getFestivalDocuments());
  },

  getUniqueFestivals(festivals = []) {
    return getUniqueAndDuplicateFestivals(festivals).unique;
  },

  getDuplicateFestivals(festivals = []) {
    return getUniqueAndDuplicateFestivals(festivals).duplicates;
  },

  async seedSampleFestivals(sampleFestivals = []) {
    const existingFestivals = await getFestivalDocuments();
    const existingKeys = new Set(existingFestivals.map(normalizeFestivalKey));
    const missing = sampleFestivals.filter(festival => !existingKeys.has(normalizeFestivalKey(festival)));

    if (!missing.length) {
      return { added: 0, missing: [] };
    }

    const nextFestivals = [
      ...existingFestivals,
      ...missing.map(festival => ({
        id: uid(),
        ...festival,
        is_active: festival.is_active ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    ];

    saveCollection(STORAGE_KEYS.FESTIVALS, nextFestivals);
    return { added: missing.length, missing };
  },

  async removeDuplicateFestivals() {
    const festivals = await getFestivalDocuments();
    const { unique, duplicates } = getUniqueAndDuplicateFestivals(festivals);

    if (!duplicates.length) {
      return { deleted: 0, duplicates: [] };
    }

    saveCollection(STORAGE_KEYS.FESTIVALS, unique);
    return { deleted: duplicates.length, duplicates };
  },

  async addFestival(festival) {
    const payload = {
      id: uid(),
      ...festival,
      name: typeof festival.name === 'string' ? festival.name.trim() : festival.name || '',
      date: typeof festival.date === 'string' ? festival.date.trim() : festival.date || '',
      description: typeof festival.description === 'string' ? festival.description.trim() : festival.description || '',
      is_active: festival.is_active ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const festivals = loadCollection(STORAGE_KEYS.FESTIVALS);
    festivals.unshift(payload);
    saveCollection(STORAGE_KEYS.FESTIVALS, festivals);
    return payload;
  },

  async updateFestival(id, updates) {
    const festivals = loadCollection(STORAGE_KEYS.FESTIVALS).map(festival =>
      festival.id === id ? { ...festival, ...updates, updatedAt: new Date().toISOString() } : festival
    );
    saveCollection(STORAGE_KEYS.FESTIVALS, festivals);
  },

  async deleteFestival(id) {
    const festivals = loadCollection(STORAGE_KEYS.FESTIVALS).filter(festival => festival.id !== id);
    saveCollection(STORAGE_KEYS.FESTIVALS, festivals);
  },
};

export const routesService = {
  async getRoutes(terminalId) {
    const tid = terminalId || localStorage.getItem('selectedTerminal') || 'madurai';
    const routes = loadCollection(STORAGE_KEYS.ROUTES)
      .filter(r => r.terminal_id === tid)
      .sort(sortByDateDesc);
    return mapFirestoreLike(routes);
  },

  async getAllRoutes(terminalId) {
    const tid = terminalId || localStorage.getItem('selectedTerminal') || 'madurai';
    const routes = loadCollection(STORAGE_KEYS.ROUTES)
      .filter(r => r.terminal_id === tid)
      .sort(sortByDateDesc);
    return mapFirestoreLike(routes);
  },

  async addRoute(route) {
    const payload = {
      id: uid(),
      terminal_id: route.terminal_id || localStorage.getItem('selectedTerminal') || 'madurai',
      ...route,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const routes = loadCollection(STORAGE_KEYS.ROUTES);
    routes.unshift(payload);
    saveCollection(STORAGE_KEYS.ROUTES, routes);
    return payload;
  },

  async updateRoute(id, updates) {
    const routes = loadCollection(STORAGE_KEYS.ROUTES).map(route =>
      route.id === id ? { ...route, ...updates, updatedAt: new Date().toISOString() } : route
    );
    saveCollection(STORAGE_KEYS.ROUTES, routes);
  },

  async deleteRoute(id) {
    const routes = loadCollection(STORAGE_KEYS.ROUTES).filter(route => route.id !== id);
    saveCollection(STORAGE_KEYS.ROUTES, routes);
  },
};

export const terminalsService = {
  async getTerminals() {
    let terminals = loadCollection(STORAGE_KEYS.TERMINALS);
    if (terminals.length === 0) {
      // Import from config but we avoid circular deps by hardcoding defaults here as fallback
      terminals = [
        { id: 'madurai', city: 'Madurai', name: 'Madurai Central Terminal', short: 'Madurai' },
        { id: 'bangalore', city: 'Bangalore', name: 'Majestic Bus Stand', short: 'Bangalore' },
        { id: 'chennai', city: 'Chennai', name: 'Koyambedu Terminus', short: 'Chennai' },
        { id: 'coimbatore', city: 'Coimbatore', name: 'Gandhipuram Stand', short: 'Coimbatore' },
      ];
      saveCollection(STORAGE_KEYS.TERMINALS, terminals);
    }
    return terminals;
  },

  async addTerminal(terminal) {
    const terminals = loadCollection(STORAGE_KEYS.TERMINALS);
    const payload = {
      id: terminal.city?.toLowerCase().replace(/\s+/g, '-') || uid(),
      ...terminal,
      createdAt: new Date().toISOString(),
    };
    terminals.push(payload);
    saveCollection(STORAGE_KEYS.TERMINALS, terminals);
    return payload;
  },

  async updateTerminal(id, updates) {
    const terminals = loadCollection(STORAGE_KEYS.TERMINALS).map(t =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    );
    saveCollection(STORAGE_KEYS.TERMINALS, terminals);
  },

  async deleteTerminal(id) {
    const terminals = loadCollection(STORAGE_KEYS.TERMINALS).filter(t => t.id !== id);
    saveCollection(STORAGE_KEYS.TERMINALS, terminals);
  },
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const storageService = {
  async uploadImage(file, path) {
    if (file instanceof Blob) {
      return await fileToDataUrl(file);
    }
    return path;
  },

  async uploadVideo(file, path) {
    if (file instanceof Blob) {
      return URL.createObjectURL(file);
    }
    return path;
  },
};

export { app, db, storage };
