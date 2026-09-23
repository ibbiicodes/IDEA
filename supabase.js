// ============================================================
//  SUPABASE CONFIGURATION & LOCAL PERSISTENCE LAYER
//  Paste your Supabase Project URL and Anon Key below.
//  If left empty the app automatically runs in local offline
//  mode with persistent SafeStorage data.
// ============================================================

const SUPABASE_URL      = ""; // e.g. "https://xyzabcdef.supabase.co"
const SUPABASE_ANON_KEY = ""; // e.g. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

const USE_SUPABASE = SUPABASE_URL.trim() !== "" && SUPABASE_ANON_KEY.trim() !== "";

let _supabase = null;
if (USE_SUPABASE) {
  if (typeof supabase !== "undefined") {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    // Dynamically and asynchronously load Supabase only when configured
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    s.onload = () => {
      if (typeof supabase !== "undefined") {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
    };
    document.head.appendChild(s);
  }
}

/* ─────────────────────────────────────────────────────────────
   SAFE STORAGE ABSTRACTION (Shielded against file:/// restrictions)
───────────────────────────────────────────────────────────── */
const SafeStorage = {
  _mem: {},
  getItem(key) {
    try {
      if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("[SafeStorage] getItem failed for " + key, e);
    }
    return Object.prototype.hasOwnProperty.call(this._mem, key) ? this._mem[key] : null;
  },
  setItem(key, value) {
    const strVal = String(value);
    try {
      if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
        window.localStorage.setItem(key, strVal);
      }
    } catch (e) {
      console.warn("[SafeStorage] setItem failed for " + key, e);
    }
    this._mem[key] = strVal;
  },
  removeItem(key) {
    try {
      if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("[SafeStorage] removeItem failed for " + key, e);
    }
    delete this._mem[key];
  },
  clear() {
    try {
      if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
        window.localStorage.clear();
      }
    } catch (e) {}
    this._mem = {};
  }
};

if (typeof window !== "undefined") {
  window.SafeStorage = SafeStorage;
}

/* ─────────────────────────────────────────────────────────────
   SEED & PERSISTENT STORE
───────────────────────────────────────────────────────────── */
function _getInitialSeedData() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const curMonthKey = `${yyyy}-${mm}`;

  const prevD = new Date(yyyy, now.getMonth() - 1, 1);
  const prevMonthKey = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

  const curDay = (d) => `${curMonthKey}-${String(d).padStart(2, '0')}`;
  const prevDay = (d) => `${prevMonthKey}-${String(d).padStart(2, '0')}`;

  const members = [
    { id: "m1", full_name: "Ali Hassan",    phone: "03001234567", monthly_fee: 3000, joining_date: `${yyyy}-01-15`, gender: "male",   status: "active",   created_at: `${yyyy}-01-15T10:00:00Z` },
    { id: "m2", full_name: "Sara Khan",     phone: "03111234567", monthly_fee: 2500, joining_date: `${yyyy}-02-01`, gender: "female", status: "active",   created_at: `${yyyy}-02-01T09:00:00Z` },
    { id: "m3", full_name: "Bilal Ahmed",   phone: "03211234567", monthly_fee: 3500, joining_date: `${yyyy}-02-10`, gender: "male",   status: "active",   created_at: `${yyyy}-02-10T08:30:00Z` },
    { id: "m4", full_name: "Fatima Malik",  phone: "03331234567", monthly_fee: 2000, joining_date: `${yyyy}-03-05`, gender: "female", status: "inactive", created_at: `${yyyy}-03-05T11:00:00Z` },
    { id: "m5", full_name: "Usman Tariq",   phone: "03451234567", monthly_fee: 3000, joining_date: `${yyyy}-03-20`, gender: "male",   status: "active",   created_at: `${yyyy}-03-20T07:45:00Z` },
    { id: "m6", full_name: "Hina Javed",    phone: "03211987654", monthly_fee: 2500, joining_date: `${yyyy}-04-01`, gender: "female", status: "active",   created_at: `${yyyy}-04-01T10:15:00Z` },
    { id: "m7", full_name: "Kamran Sheikh", phone: "03009876543", monthly_fee: 4000, joining_date: `${yyyy}-04-10`, gender: "male",   status: "active",   created_at: `${yyyy}-04-10T09:30:00Z` },
    { id: "m8", full_name: "Rabia Noor",    phone: "03131234567", monthly_fee: 2000, joining_date: `${yyyy}-05-15`, gender: "female", status: "active",   created_at: `${yyyy}-05-15T08:00:00Z` },
  ];

  const payments = [
    { id: "p1", member_id: "m1", amount_paid: 3000, payment_date: curDay(2),  fee_for_month: curMonthKey,  payment_method: "Cash",   created_at: `${curDay(2)}T10:00:00Z` },
    { id: "p2", member_id: "m2", amount_paid: 2500, payment_date: curDay(3),  fee_for_month: curMonthKey,  payment_method: "Online", created_at: `${curDay(3)}T11:00:00Z` },
    { id: "p3", member_id: "m3", amount_paid: 3500, payment_date: curDay(5),  fee_for_month: curMonthKey,  payment_method: "Cash",   created_at: `${curDay(5)}T09:30:00Z` },
    { id: "p4", member_id: "m6", amount_paid: 2500, payment_date: curDay(8),  fee_for_month: curMonthKey,  payment_method: "Cash",   created_at: `${curDay(8)}T10:45:00Z` },
    { id: "p5", member_id: "m7", amount_paid: 4000, payment_date: curDay(10), fee_for_month: curMonthKey,  payment_method: "Online", created_at: `${curDay(10)}T14:00:00Z` },
    { id: "p6", member_id: "m8", amount_paid: 2000, payment_date: curDay(12), fee_for_month: curMonthKey,  payment_method: "Cash",   created_at: `${curDay(12)}T08:30:00Z` },
    { id: "p7", member_id: "m1", amount_paid: 3000, payment_date: prevDay(1), fee_for_month: prevMonthKey, payment_method: "Cash",   created_at: `${prevDay(1)}T10:00:00Z` },
    { id: "p8", member_id: "m2", amount_paid: 2500, payment_date: prevDay(3), fee_for_month: prevMonthKey, payment_method: "Cash",   created_at: `${prevDay(3)}T09:00:00Z` },
    { id: "p9", member_id: "m3", amount_paid: 3500, payment_date: prevDay(5), fee_for_month: prevMonthKey, payment_method: "Online", created_at: `${prevDay(5)}T11:00:00Z` },
  ];

  return { members, payments };
}

function _loadStore() {
  const seed = _getInitialSeedData();
  let members = null;
  let payments = null;

  try {
    const rawM = SafeStorage.getItem("gym_members");
    if (rawM) {
      const parsed = JSON.parse(rawM);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
        members = parsed;
      }
    }
  } catch (e) {
    console.warn("Could not parse gym_members from storage", e);
  }

  try {
    const rawP = SafeStorage.getItem("gym_payments");
    if (rawP) {
      const parsed = JSON.parse(rawP);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
        payments = parsed;
      }
    }
  } catch (e) {
    console.warn("Could not parse gym_payments from storage", e);
  }

  if (!members) {
    members = seed.members;
    SafeStorage.setItem("gym_members", JSON.stringify(members));
  }

  if (!payments) {
    payments = seed.payments;
    SafeStorage.setItem("gym_payments", JSON.stringify(payments));
  }

  return { members, payments };
}

const _store = _loadStore();

function _persistStore(table) {
  try {
    if (_store[table]) {
      SafeStorage.setItem(`gym_${table}`, JSON.stringify(_store[table]));
    }
  } catch (e) {
    console.error(`Failed to persist gym_${table} to storage`, e);
  }
}

function _genId(prefix) {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6);
}

class MockQuery {
  constructor(table) {
    this._table = table;
    this._filters = [];
    this._op = "select";
    this._payload = null;
    this._orderCol = null;
    this._orderAsc = true;
  }
  select() {
    return this;
  }
  eq(col, val) {
    this._filters.push({ type: "eq", col, val });
    return this;
  }
  in(col, vals) {
    this._filters.push({ type: "in", col, vals });
    return this;
  }
  order(col, { ascending = true } = {}) {
    this._orderCol = col;
    this._orderAsc = ascending;
    return this;
  }
  _applyFilters(rows) {
    return rows.filter((r) =>
      this._filters.every((f) => {
        if (f.type === "eq") return String(r[f.col]) === String(f.val);
        if (f.type === "in") return f.vals.map(String).includes(String(r[f.col]));
        return true;
      })
    );
  }
  async _run() {
    const table = _store[this._table];
    if (!table) return { data: null, error: { message: `Table ${this._table} not found` } };

    if (this._op === "select") {
      let rows = this._applyFilters([...table]);
      if (this._orderCol) {
        rows.sort((a, b) => {
          const av = a[this._orderCol] || "";
          const bv = b[this._orderCol] || "";
          return this._orderAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
        });
      }
      return { data: rows, error: null };
    }

    if (this._op === "insert") {
      const row = { ...this._payload };
      if (!row.id) row.id = _genId(this._table[0]);
      if (!row.created_at) row.created_at = new Date().toISOString();
      _store[this._table].push(row);
      _persistStore(this._table);
      return { data: [row], error: null };
    }

    if (this._op === "update") {
      const rows = this._applyFilters(_store[this._table]);
      rows.forEach((r) => Object.assign(r, this._payload));
      _persistStore(this._table);
      return { data: rows, error: null };
    }

    if (this._op === "delete") {
      _store[this._table] = _store[this._table].filter(
        (r) => !this._filters.every((f) => {
          if (f.type === "eq") return String(r[f.col]) === String(f.val);
          return false;
        })
      );
      _persistStore(this._table);
      return { data: null, error: null };
    }

    return { data: null, error: { message: "Unknown operation" } };
  }
  then(res, rej) {
    return this._run().then(res, rej);
  }
  catch(rej) {
    return this._run().catch(rej);
  }
  finally(fn) {
    return this._run().finally(fn);
  }
}

class MockTable {
  constructor(t) {
    this._t = t;
  }
  select() {
    return new MockQuery(this._t).select();
  }
  insert(p) {
    const q = new MockQuery(this._t);
    q._op = "insert";
    q._payload = p;
    return q;
  }
  update(p) {
    const q = new MockQuery(this._t);
    q._op = "update";
    q._payload = p;
    return q;
  }
  delete() {
    const q = new MockQuery(this._t);
    q._op = "delete";
    return q;
  }
}

const db = USE_SUPABASE
  ? { from: (t) => (_supabase ? _supabase.from(t) : new MockTable(t)), isSupabase: true }
  : { from: (t) => new MockTable(t), isSupabase: false };

if (typeof window !== "undefined") {
  window.db = db;
  window._store = _store;
  window.resetGymData = function () {
    SafeStorage.removeItem("gym_members");
    SafeStorage.removeItem("gym_payments");
    const seed = _getInitialSeedData();
    _store.members = seed.members;
    _store.payments = seed.payments;
    SafeStorage.setItem("gym_members", JSON.stringify(seed.members));
    SafeStorage.setItem("gym_payments", JSON.stringify(seed.payments));
    if (typeof State !== "undefined" && typeof renderAll === "function") {
      State.members = seed.members;
      State.payments = seed.payments;
      if (typeof populateLedgerFilters === "function") populateLedgerFilters();
      renderAll();
      if (typeof showToast === "function") {
        showToast("info", "Data Reset", "Gym demo records have been restored.");
      }
    }
  };
}

console.log(
  `%c[GymApp] Data Mode: ${db.isSupabase ? "Supabase (live)" : "SafeStorage persistent mock"}`,
  "color:#D4AF37;font-weight:bold;"
);
