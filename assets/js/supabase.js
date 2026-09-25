// Supabase Client Initialization & Offline Storage Sync
const SUPABASE_URL = 'https://jbshrucfzwwzrsronodm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2hydWNmend3enJzcm9ub2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjkyNjcsImV4cCI6MjEwNTc0NTI2N30.aZvGaGCWT06gUZDPaEyn6kWLC13eFZjXFP8Fp8mgxKI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db = db;

// ============================================================
// Offline Storage & Synchronization System
// Stores table snapshots locally and queues offline mutations
// ============================================================
const OfflineStorage = {
  QUEUE_KEY: 'haiti_rehcare_offline_queue',

  // Save table data to LocalStorage cache
  setCache(table, data) {
    try {
      if (table && Array.isArray(data)) {
        localStorage.setItem(`cache_tbl_${table}`, JSON.stringify({
          timestamp: Date.now(),
          data: data
        }));
      }
    } catch (e) {
      console.warn('[OfflineStorage] Cache write warning:', e);
    }
  },

  // Retrieve cached table data
  getCache(table) {
    try {
      const raw = localStorage.getItem(`cache_tbl_${table}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.data || null;
    } catch (e) {
      return null;
    }
  },

  // Queue mutation for online sync
  enqueueMutation(operation) {
    try {
      const queue = JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
      queue.push({
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        created_at: new Date().toISOString(),
        ...operation
      });
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
      console.log('[OfflineStorage] Enqueued offline action:', operation);
    } catch (e) {
      console.error('[OfflineStorage] Failed to queue offline operation:', e);
    }
  },

  // Sync queued operations back to Supabase when reconnected
  async processQueue() {
    if (!navigator.onLine) return;
    try {
      const queue = JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
      if (!queue.length) return;

      console.log(`[OfflineStorage] Processing ${queue.length} offline mutations...`);
      const remaining = [];

      for (const item of queue) {
        try {
          if (item.type === 'insert') {
            await db.from(item.table).insert(item.data);
          } else if (item.type === 'update') {
            await db.from(item.table).update(item.data).match(item.match);
          } else if (item.type === 'delete') {
            await db.from(item.table).delete().match(item.match);
          }
        } catch (err) {
          console.warn('[OfflineStorage] Item sync error, keeping in queue:', item, err);
          remaining.push(item);
        }
      }

      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(remaining));
      if (queue.length > remaining.length) {
        console.log('[OfflineStorage] Offline mutations synced successfully!');
      }
    } catch (e) {
      console.error('[OfflineStorage] Queue process error:', e);
    }
  }
};

window.OfflineStorage = OfflineStorage;

// Auto sync when reconnected to network
window.addEventListener('online', () => {
  console.log('[Network] Reconnected! Syncing offline queue...');
  OfflineStorage.processQueue();
});
