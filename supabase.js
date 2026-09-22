// ============================================================
//  SUPABASE CONFIGURATION
//  Paste your Supabase Project URL and Anon Key below.
//  If left empty the app falls back to in-memory mock data.
// ============================================================

const SUPABASE_URL      = ""; // e.g. "https://xyzabcdef.supabase.co"
const SUPABASE_ANON_KEY = ""; // e.g. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

const USE_SUPABASE = SUPABASE_URL.trim() !== "" && SUPABASE_ANON_KEY.trim() !== "";

let _supabase = null;
if (USE_SUPABASE && typeof supabase !== "undefined") {
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ── In-memory mock store ── */
const _store = {
  members: [
    { id:"m1", full_name:"Ali Hassan",    phone:"03001234567", monthly_fee:3000, joining_date:"2025-01-15", gender:"male",   status:"active",   created_at:"2025-01-15T10:00:00Z" },
    { id:"m2", full_name:"Sara Khan",     phone:"03111234567", monthly_fee:2500, joining_date:"2025-03-01", gender:"female", status:"active",   created_at:"2025-03-01T09:00:00Z" },
    { id:"m3", full_name:"Bilal Ahmed",   phone:"03211234567", monthly_fee:3500, joining_date:"2025-02-10", gender:"male",   status:"active",   created_at:"2025-02-10T08:30:00Z" },
    { id:"m4", full_name:"Fatima Malik",  phone:"03331234567", monthly_fee:2000, joining_date:"2025-04-05", gender:"female", status:"inactive", created_at:"2025-04-05T11:00:00Z" },
    { id:"m5", full_name:"Usman Tariq",   phone:"03451234567", monthly_fee:3000, joining_date:"2025-05-20", gender:"male",   status:"active",   created_at:"2025-05-20T07:45:00Z" },
    { id:"m6", full_name:"Hina Javed",    phone:"03211987654", monthly_fee:2500, joining_date:"2025-06-01", gender:"female", status:"active",   created_at:"2025-06-01T10:15:00Z" },
    { id:"m7", full_name:"Kamran Sheikh", phone:"03009876543", monthly_fee:4000, joining_date:"2025-07-10", gender:"male",   status:"active",   created_at:"2025-07-10T09:30:00Z" },
    { id:"m8", full_name:"Rabia Noor",    phone:"03131234567", monthly_fee:2000, joining_date:"2025-08-15", gender:"female", status:"active",   created_at:"2025-08-15T08:00:00Z" },
  ],
  payments: [
    { id:"p1", member_id:"m1", amount_paid:3000, payment_date:"2026-09-02", fee_for_month:"2026-09", payment_method:"Cash",   created_at:"2026-09-02T10:00:00Z" },
    { id:"p2", member_id:"m2", amount_paid:2500, payment_date:"2026-09-03", fee_for_month:"2026-09", payment_method:"Online", created_at:"2026-09-03T11:00:00Z" },
    { id:"p3", member_id:"m3", amount_paid:3500, payment_date:"2026-09-05", fee_for_month:"2026-09", payment_method:"Cash",   created_at:"2026-09-05T09:30:00Z" },
    { id:"p4", member_id:"m6", amount_paid:2500, payment_date:"2026-09-08", fee_for_month:"2026-09", payment_method:"Cash",   created_at:"2026-09-08T10:45:00Z" },
    { id:"p5", member_id:"m7", amount_paid:4000, payment_date:"2026-09-10", fee_for_month:"2026-09", payment_method:"Online", created_at:"2026-09-10T14:00:00Z" },
    { id:"p6", member_id:"m1", amount_paid:3000, payment_date:"2026-08-01", fee_for_month:"2026-08", payment_method:"Cash",   created_at:"2026-08-01T10:00:00Z" },
    { id:"p7", member_id:"m2", amount_paid:2500, payment_date:"2026-08-03", fee_for_month:"2026-08", payment_method:"Cash",   created_at:"2026-08-03T09:00:00Z" },
    { id:"p8", member_id:"m3", amount_paid:3500, payment_date:"2026-08-05", fee_for_month:"2026-08", payment_method:"Online", created_at:"2026-08-05T11:00:00Z" },
    { id:"p9", member_id:"m8", amount_paid:2000, payment_date:"2026-09-12", fee_for_month:"2026-09", payment_method:"Cash",   created_at:"2026-09-12T08:30:00Z" },
  ],
};

function _genId(prefix){ return prefix + Date.now() + Math.random().toString(36).slice(2,6); }

class MockQuery {
  constructor(table){ this._table=table; this._filters=[]; this._op="select"; this._payload=null; this._orderCol=null; this._orderAsc=true; }
  select(){ return this; }
  eq(col,val){ this._filters.push({type:"eq",col,val}); return this; }
  in(col,vals){ this._filters.push({type:"in",col,vals}); return this; }
  order(col,{ascending=true}={}){ this._orderCol=col; this._orderAsc=ascending; return this; }
  _applyFilters(rows){ return rows.filter(r=>this._filters.every(f=>{ if(f.type==="eq") return String(r[f.col])===String(f.val); if(f.type==="in") return f.vals.map(String).includes(String(r[f.col])); return true; })); }
  async _run(){
    const table=_store[this._table];
    if(!table) return {data:null,error:{message:"Table not found"}};
    if(this._op==="select"){
      let rows=this._applyFilters([...table]);
      if(this._orderCol) rows.sort((a,b)=>{ const av=a[this._orderCol],bv=b[this._orderCol]; return this._orderAsc?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0); });
      return {data:rows,error:null};
    }
    if(this._op==="insert"){
      const row={...this._payload};
      if(!row.id) row.id=_genId(this._table[0]);
      if(!row.created_at) row.created_at=new Date().toISOString();
      _store[this._table].push(row);
      return {data:[row],error:null};
    }
    if(this._op==="update"){
      const rows=this._applyFilters(_store[this._table]);
      rows.forEach(r=>Object.assign(r,this._payload));
      return {data:rows,error:null};
    }
    if(this._op==="delete"){
      _store[this._table]=_store[this._table].filter(r=>!this._filters.every(f=>{if(f.type==="eq") return String(r[f.col])===String(f.val); return false;}));
      return {data:null,error:null};
    }
    return {data:null,error:{message:"Unknown op"}};
  }
  then(res,rej){ return this._run().then(res,rej); }
}

class MockTable {
  constructor(t){ this._t=t; }
  select(){ return new MockQuery(this._t).select(); }
  insert(p){ const q=new MockQuery(this._t); q._op="insert"; q._payload=p; return q; }
  update(p){ const q=new MockQuery(this._t); q._op="update"; q._payload=p; return q; }
  delete(){ const q=new MockQuery(this._t); q._op="delete"; return q; }
}

const db = USE_SUPABASE
  ? { from:(t)=>_supabase.from(t), isSupabase:true }
  : { from:(t)=>new MockTable(t),  isSupabase:false };

console.log(`%c[GymApp] DB: ${db.isSupabase?"Supabase (live)":"Local mock"}`, "color:#D4AF37;font-weight:bold;");
