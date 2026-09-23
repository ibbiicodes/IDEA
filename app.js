// ============================================================
//  GYM FEE MANAGER — app.js
//  Complete application logic: State, CRUD, UI, WhatsApp
// ============================================================

/* ─────────────────────────────────────────────────────────────
   SAFE STORAGE ACCESSOR (Shielded against file:/// restrictions)
───────────────────────────────────────────────────────────── */
const _storage = (typeof window !== 'undefined' && window.SafeStorage) ? window.SafeStorage : {
  getItem: function(k) {
    try { return ("localStorage" in window && window.localStorage) ? window.localStorage.getItem(k) : null; }
    catch(e) { return null; }
  },
  setItem: function(k, v) {
    try { if ("localStorage" in window && window.localStorage) window.localStorage.setItem(k, String(v)); }
    catch(e) {}
  }
};

/* ─────────────────────────────────────────────────────────────
   DATABASE RESOLVER WITH AUTONOMOUS FALLBACK
───────────────────────────────────────────────────────────── */
function getDb() {
  if (typeof window !== 'undefined' && window.db) return window.db;
  if (typeof db !== 'undefined') return db;
  // Autonomous fallback if supabase.js was blocked or not yet evaluated
  return {
    from: function(table) {
      return {
        select: function() { return this; },
        order: function() { return this; },
        eq: function() { return this; },
        in: function() { return this; },
        insert: function() { return this; },
        update: function() { return this; },
        delete: function() { return this; },
        then: function(resolve) {
          resolve({ data: [], error: null });
          return Promise.resolve({ data: [], error: null });
        }
      };
    }
  };
}

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────── */
const State = {
  members:        [],
  payments:       [],
  currentPage:    'dashboard',
  membersFilter:  'all',
  membersSearch:  '',
  ledgerMonth:    '',
  ledgerYear:     '',
  editingMemberId: null,
  theme:          _storage.getItem('gymTheme') || 'light',
};

if (typeof window !== 'undefined') {
  window.State = State;
}

/* ─────────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────────── */
function init() {
  try { applyTheme(State.theme); } catch (e) { console.warn('applyTheme error:', e); }
  try { initNav(); } catch (e) { console.warn('initNav error:', e); }
  try { initSidebar(); } catch (e) { console.warn('initSidebar error:', e); }
  try { initTheme(); } catch (e) { console.warn('initTheme error:', e); }
  try { initSearch(); } catch (e) { console.warn('initSearch error:', e); }
  try { initModals(); } catch (e) { console.warn('initModals error:', e); }
  try { initMemberActions(); } catch (e) { console.warn('initMemberActions error:', e); }
  try { updateDateDisplay(); } catch (e) { console.warn('updateDateDisplay error:', e); }

  loadData()
    .then(() => {
      try { populateLedgerFilters(); } catch (e) { console.warn('populateLedgerFilters error:', e); }
      try { renderAll(); } catch (e) { console.warn('renderAll error:', e); }
    })
    .catch((err) => {
      console.error('Fatal loadData error:', err);
      try { renderAll(); } catch (e) {}
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // If DOM already ready, run asynchronously to allow all scripts to finish defining globals
    setTimeout(init, 0);
  }
}

/* ─────────────────────────────────────────────────────────────
   DATA LAYER
───────────────────────────────────────────────────────────── */
async function loadData() {
  try {
    const database = getDb();
    const [mRes, pRes] = await Promise.all([
      database.from('members').select().order('created_at', { ascending: false }),
      database.from('payments').select().order('payment_date', { ascending: false }),
    ]);
    if (mRes.error) throw mRes.error;
    if (pRes.error) throw pRes.error;
    State.members  = mRes.data || [];
    State.payments = pRes.data || [];
  } catch (err) {
    console.error('Data load exception:', err);
    showToast('error', 'Load Error', err.message || 'Could not load data.');
  }
}

async function addMember(data) {
  const database = getDb();
  const payload = { ...data, status: 'active' };
  const { data: rows, error } = await database.from('members').insert(payload).select();
  if (error) throw error;
  const newRow = rows && rows[0] ? rows[0] : payload;
  State.members.unshift(newRow);
  return newRow;
}

async function updateMember(id, data) {
  const database = getDb();
  const { error } = await database.from('members').update(data).eq('id', id);
  if (error) throw error;
  const idx = State.members.findIndex(m => m.id === id);
  if (idx !== -1) Object.assign(State.members[idx], data);
}

async function deleteMember(id) {
  const database = getDb();
  const { error: pe } = await database.from('payments').delete().eq('member_id', id);
  const { error: me } = await database.from('members').delete().eq('id', id);
  if (me) throw me;
  State.members  = State.members.filter(m => m.id !== id);
  State.payments = State.payments.filter(p => p.member_id !== id);
}

async function recordPayment(data) {
  const database = getDb();
  const { data: rows, error } = await database.from('payments').insert(data).select();
  if (error) throw error;
  const newRow = rows && rows[0] ? rows[0] : data;
  State.payments.unshift(newRow);
  return newRow;
}

/* ─────────────────────────────────────────────────────────────
   DERIVED / COMPUTED
───────────────────────────────────────────────────────────── */
function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

function getMemberPaymentThisMonth(memberId) {
  const key = currentMonthKey();
  return State.payments.find(p => p && p.member_id === memberId && p.fee_for_month === key);
}

function isPaidThisMonth(memberId) {
  return !!getMemberPaymentThisMonth(memberId);
}

function getActiveMembers() {
  return State.members.filter(m => m && m.status === 'active');
}

function getUnpaidDefaulters() {
  return getActiveMembers().filter(m => !isPaidThisMonth(m.id));
}

function getTotalCollectedThisMonth() {
  const key = currentMonthKey();
  return State.payments
    .filter(p => p && p.fee_for_month === key)
    .reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);
}

/* ─────────────────────────────────────────────────────────────
   RENDER ALL
───────────────────────────────────────────────────────────── */
function renderAll() {
  try { renderDashboard(); } catch (e) { console.error('renderDashboard error:', e); }
  try { renderMembers(); } catch (e) { console.error('renderMembers error:', e); }
  try { renderLedger(); } catch (e) { console.error('renderLedger error:', e); }
  try { renderAnalyticsPage(); } catch (e) { console.error('renderAnalyticsPage error:', e); }
}

/* ─────────────────────────────────────────────────────────────
   DASHBOARD & ANALYTICS
───────────────────────────────────────────────────────────── */
function renderDashboard() {
  const activeCount = getActiveMembers().length;
  const collected   = getTotalCollectedThisMonth();
  const unpaidCount = getUnpaidDefaulters().length;

  // Metrics
  const activeEl = document.getElementById('stat-active');
  if (activeEl) activeEl.textContent = activeCount;

  const colEl = document.getElementById('stat-collected');
  if (colEl) colEl.textContent = `PKR ${collected.toLocaleString()}`;

  const unpEl = document.getElementById('stat-unpaid');
  if (unpEl) unpEl.textContent = unpaidCount;

  // Badge on nav
  const badge = document.getElementById('nav-badge-defaulters');
  if (badge) {
    badge.textContent = unpaidCount;
    badge.style.display = unpaidCount > 0 ? '' : 'none';
  }

  // Defaulters table
  renderDefaultersTable();
}

function renderAnalyticsPage() {
  const avgEl = document.getElementById('analytics-avg-rev');
  const peakEl = document.getElementById('analytics-peak-rev');
  const peakMonthEl = document.getElementById('analytics-peak-month');
  const txEl = document.getElementById('analytics-total-tx');

  if (avgEl) {
    const now = new Date();
    let total6M = 0;
    let peakVal = 0;
    let peakLabel = 'None';

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
      const monthTotal = State.payments
        .filter(p => p && p.fee_for_month === monthKey)
        .reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);

      total6M += monthTotal;
      if (monthTotal >= peakVal) {
        peakVal = monthTotal;
        peakLabel = monthName;
      }
    }

    const avgRev = Math.round(total6M / 6);
    avgEl.textContent = `PKR ${avgRev.toLocaleString()}`;
    if (peakEl) peakEl.textContent = `PKR ${peakVal.toLocaleString()}`;
    if (peakMonthEl) peakMonthEl.textContent = peakLabel;
    if (txEl) txEl.textContent = State.payments.length;
  }

  renderAnalyticsChart();
}

function renderAnalyticsChart() {
  const container = document.getElementById('analytics-chart-container');
  if (!container) return;

  const now = new Date();
  const monthsData = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const monthKey = `${yyyy}-${mm}`;
    const monthName = d.toLocaleDateString('en-PK', { month: 'short' });

    const total = State.payments
      .filter(p => p && p.fee_for_month === monthKey)
      .reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0);

    monthsData.push({ monthKey, label: `${monthName} '${String(yyyy).slice(2)}`, total });
  }

  const maxTotal = Math.max(...monthsData.map(m => m.total), 1);

  container.innerHTML = `
    <div class="chart-container">
      ${monthsData.map(m => {
        const heightPct = Math.round((m.total / maxTotal) * 100);
        return `
          <div class="chart-col">
            <div class="chart-val">${m.total > 0 ? (m.total >= 1000 ? (m.total/1000).toFixed(1)+'k' : m.total) : '0'}</div>
            <div class="chart-bar-fill" style="height:${Math.max(heightPct, 4)}%" title="${m.label}: PKR ${m.total.toLocaleString()}"></div>
            <div class="chart-month-label">${m.label}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDefaultersTable() {
  const tbody = document.getElementById('defaulters-tbody');
  if (!tbody) return;
  const defaulters = getUnpaidDefaulters();

  if (defaulters.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-title">All Clear!</div><div class="empty-sub">Every active member has paid for this month.</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = defaulters.map(m => {
    const isFemale = m.gender === 'female';
    return `
    <tr>
      <td>
        <div class="member-cell">
          <div class="avatar ${isFemale ? 'avatar-female' : ''}">${getInitials(m.full_name)}</div>
          <div>
            <div class="member-name">${esc(m.full_name)}</div>
          </div>
        </div>
      </td>
      <td>${esc(m.phone)}</td>
      <td class="fw-bold" style="color:var(--gold)">PKR ${(Number(m.monthly_fee) || 0).toLocaleString()}</td>
      <td><span class="badge badge-unpaid"><span class="badge-dot"></span>Unpaid</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-success btn-sm" onclick="openPaymentModal('${m.id}')">
            <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Mark Paid
          </button>
          <button class="btn btn-wa btn-sm" onclick="sendWhatsApp('${m.id}')">
            <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            WhatsApp
          </button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────
   MEMBERS DIRECTORY
───────────────────────────────────────────────────────────── */
function filterToDefaulters() {
  navigateTo('members');
  State.membersFilter = 'unpaid';
  document.querySelectorAll('.filter-tab[data-filter]').forEach(t => {
    t.classList.toggle('active', t.dataset.filter === 'unpaid');
  });
  renderMembers();
}

function renderMembers() {
  const search = (State.membersSearch || '').toLowerCase().trim();
  const filter = State.membersFilter || 'all';

  let list = State.members.filter(m => {
    if (!m) return false;
    const nameStr  = (m.full_name || '').toLowerCase();
    const phoneStr = (m.phone || '');
    const matchSearch = !search || nameStr.includes(search) || phoneStr.includes(search);
    let matchFilter = true;
    if (filter === 'male')     matchFilter = (m.gender || 'male') === 'male';
    if (filter === 'female')   matchFilter = m.gender === 'female';
    if (filter === 'paid')     matchFilter = m.status === 'active' && isPaidThisMonth(m.id);
    if (filter === 'unpaid')   matchFilter = m.status === 'active' && !isPaidThisMonth(m.id);
    if (filter === 'inactive') matchFilter = m.status === 'inactive';
    if (filter === 'active')   matchFilter = m.status === 'active';
    return matchSearch && matchFilter;
  });

  const tbody = document.getElementById('members-tbody');
  const emptyState = document.getElementById('members-empty');
  if (!tbody) return;

  // Count badges
  if (document.getElementById('tab-count-all'))      document.getElementById('tab-count-all').textContent      = State.members.length;
  if (document.getElementById('tab-count-male'))     document.getElementById('tab-count-male').textContent     = State.members.filter(m=>(m?.gender||'male')==='male').length;
  if (document.getElementById('tab-count-female'))   document.getElementById('tab-count-female').textContent   = State.members.filter(m=>m?.gender==='female').length;
  if (document.getElementById('tab-count-active'))   document.getElementById('tab-count-active').textContent   = getActiveMembers().length;
  if (document.getElementById('tab-count-paid'))     document.getElementById('tab-count-paid').textContent     = getActiveMembers().filter(m=>isPaidThisMonth(m.id)).length;
  if (document.getElementById('tab-count-unpaid'))   document.getElementById('tab-count-unpaid').textContent   = getUnpaidDefaulters().length;
  if (document.getElementById('tab-count-inactive')) document.getElementById('tab-count-inactive').textContent = State.members.filter(m=>m?.status==='inactive').length;

  if (list.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = '';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    tbody.innerHTML = list.map((m, i) => {
      const paid = isPaidThisMonth(m.id);
      const isActive = m.status === 'active';
      const isFemale = m.gender === 'female';
      return `
        <tr>
          <td style="color:var(--text-muted);font-size:0.75rem;font-weight:700">#${(i+1).toString().padStart(3,'0')}</td>
          <td>
            <div class="member-cell">
              <div class="avatar ${isFemale ? 'avatar-female' : ''}">${getInitials(m.full_name)}</div>
              <div>
                <div class="member-name">${esc(m.full_name)}</div>
                <div class="member-phone">${esc(m.phone)}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="badge ${isFemale ? 'badge-female' : 'badge-male'}">
              ${isFemale ? 'Female' : 'Male'}
            </span>
          </td>
          <td>${esc(m.phone)}</td>
          <td>${formatDate(m.joining_date)}</td>
          <td style="font-weight:700;color:var(--gold)">PKR ${(Number(m.monthly_fee) || 0).toLocaleString()}</td>
          <td>
            ${isActive
              ? (paid
                  ? `<span class="badge badge-paid"><span class="badge-dot"></span>Paid</span>`
                  : `<span class="badge badge-unpaid"><span class="badge-dot"></span>Unpaid</span>`)
              : `<span class="badge badge-inactive">Inactive</span>`}
          </td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-ghost btn-sm" title="Member ID Pass" onclick="openIDCardModal('${m.id}')">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h2"/><path d="M15 12h2"/><path d="M7 16h10"/></svg>
                ID Pass
              </button>
              <button class="btn btn-ghost btn-sm" title="Export Statement CSV" onclick="exportSingleMemberCSV('${m.id}')">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                CSV
              </button>
              <button class="btn btn-ghost btn-sm" title="Edit Member" onclick="openEditModal('${m.id}')">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" title="Payment History" onclick="openLedgerModal('${m.id}')">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" title="Toggle Status" onclick="toggleMemberStatus('${m.id}')">
                <svg class="svg-icon svg-icon-sm" style="color:${isActive ? 'var(--green)' : 'var(--red)'}" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" title="Delete Member" onclick="confirmDelete('${m.id}')" style="color:var(--red)">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

/* ─────────────────────────────────────────────────────────────
   LEDGER / PAYMENT HISTORY
───────────────────────────────────────────────────────────── */
function renderLedger() {
  const revTotal = document.getElementById('revenue-total');
  if (!revTotal) return;
  const monthFilter = State.ledgerMonth || '';
  const yearFilter  = State.ledgerYear || '';

  let payments = [...State.payments];

  if (yearFilter) {
    payments = payments.filter(p => p && (p.fee_for_month || '').startsWith(yearFilter));
  }
  if (monthFilter) {
    payments = payments.filter(p => p && (p.fee_for_month || '').endsWith(`-${monthFilter}`));
  }

  const total = payments.reduce((s, p) => s + (Number(p?.amount_paid) || 0), 0);

  document.getElementById('revenue-total').textContent   = `PKR ${total.toLocaleString()}`;
  document.getElementById('revenue-txcount').textContent = payments.length;

  let label = 'Selected Period';
  if (yearFilter && monthFilter) label = `${getMonthName(monthFilter)} ${yearFilter}`;
  else if (yearFilter) label = `Year ${yearFilter}`;
  document.getElementById('revenue-label').textContent = label;

  const tbody = document.getElementById('ledger-tbody');
  if (!tbody) return;

  if (payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><svg class="svg-icon" style="width:36px;height:36px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div><div class="empty-title">No Payments Found</div><div class="empty-sub">Try adjusting the period filters.</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map(p => {
    const member = State.members.find(m => m && m.id === p.member_id);
    const mName  = member ? member.full_name : 'Unknown';
    const feeMonthStr = p.fee_for_month && p.fee_for_month.length >= 7
      ? `${getMonthName(p.fee_for_month.slice(5,7))} ${p.fee_for_month.slice(0,4)}`
      : (p.fee_for_month || '—');
    const txnId = p.id ? String(p.id).slice(-6).toUpperCase() : 'TXN';
    return `
      <tr>
        <td style="color:var(--text-muted);font-size:0.72rem;font-weight:700">#${txnId}</td>
        <td>
          <div class="member-cell">
            <div class="avatar" style="width:30px;height:30px;font-size:0.7rem">${getInitials(mName)}</div>
            <span style="font-weight:600">${esc(mName)}</span>
          </div>
        </td>
        <td style="font-weight:700;color:var(--gold)">PKR ${(Number(p.amount_paid) || 0).toLocaleString()}</td>
        <td>${formatDate(p.payment_date)}</td>
        <td>${feeMonthStr}</td>
        <td>
          <span class="badge ${p.payment_method === 'Cash' ? 'badge-gold' : 'badge-paid'}">
            ${p.payment_method === 'Cash' ? '💵' : '📱'} ${esc(p.payment_method || 'Cash')}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────
   MODALS
───────────────────────────────────────────────────────────── */
function openAddModal() {
  State.editingMemberId = null;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = '➕ Add New Member';
  const form = document.getElementById('member-form');
  if (form) form.reset();
  clearFormErrors();
  const genderEl = document.getElementById('f-gender');
  if (genderEl) genderEl.value = 'male';
  const joinEl = document.getElementById('f-joining');
  if (joinEl) joinEl.value = toInputDate(new Date());
  openModal('member-modal');
}

function openEditModal(id) {
  const m = State.members.find(mem => mem && mem.id === id);
  if (!m) return;
  State.editingMemberId = id;
  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = '✏️ Edit Member';
  document.getElementById('f-name').value    = m.full_name || '';
  document.getElementById('f-phone').value   = m.phone || '';
  const genderEl = document.getElementById('f-gender');
  if (genderEl) genderEl.value = m.gender || 'male';
  document.getElementById('f-joining').value = m.joining_date || '';
  document.getElementById('f-fee').value     = m.monthly_fee || '';
  clearFormErrors();
  openModal('member-modal');
}

async function saveMember() {
  const name    = (document.getElementById('f-name')?.value || '').trim();
  const phone   = (document.getElementById('f-phone')?.value || '').trim();
  const gender  = document.getElementById('f-gender')?.value || 'male';
  const joining = document.getElementById('f-joining')?.value || '';
  const fee     = parseFloat(document.getElementById('f-fee')?.value || '0');

  let valid = true;
  clearFormErrors();
  if (!name)              { showFieldError('f-name',    'Full name is required.');        valid = false; }
  if (!phone || phone.length < 10) { showFieldError('f-phone', 'Valid phone required.');  valid = false; }
  if (!joining)           { showFieldError('f-joining', 'Joining date is required.');     valid = false; }
  if (!fee || fee <= 0)   { showFieldError('f-fee',     'Enter a valid monthly fee.');    valid = false; }
  if (!valid) return;

  const btn = document.getElementById('btn-save-member');
  setBtnLoading(btn, true);
  try {
    const data = { full_name:name, phone, gender, joining_date:joining, monthly_fee:fee };
    if (State.editingMemberId) {
      await updateMember(State.editingMemberId, data);
      showToast('success','Member Updated', `${name}'s details have been updated.`);
    } else {
      await addMember(data);
      showToast('success','Member Added', `${name} has been added successfully.`);
    }
    closeModal('member-modal');
    renderAll();
  } catch (e) {
    showToast('error','Error', e.message || 'Could not save member.');
  } finally {
    setBtnLoading(btn, false);
  }
}

let _payingMemberId = null;

function updatePayMemberInfo(memberId) {
  _payingMemberId = memberId;
  const m = State.members.find(mem => mem && mem.id === memberId);
  const nameEl = document.getElementById('pay-name');
  const avEl   = document.getElementById('pay-avatar');
  const feeEl  = document.getElementById('pay-fee-hint');
  const amtEl  = document.getElementById('pay-amount');

  if (!m) {
    if (nameEl) nameEl.textContent = 'Select a member';
    if (avEl)   avEl.textContent = '?';
    if (feeEl)  feeEl.textContent = 'Agreed Fee: —';
    if (amtEl)  amtEl.value = '';
    return;
  }
  if (nameEl) nameEl.textContent = m.full_name;
  if (avEl) {
    avEl.textContent = getInitials(m.full_name);
    avEl.className = m.gender === 'female' ? 'avatar avatar-female' : 'avatar';
  }
  if (feeEl) feeEl.textContent = `Agreed Fee: PKR ${(Number(m.monthly_fee) || 0).toLocaleString()}`;
  if (amtEl) amtEl.value = m.monthly_fee || '';
}

function openPaymentModal(memberId) {
  const select = document.getElementById('pay-member-select');
  const activeMembers = getActiveMembers();

  if (select) {
    select.innerHTML = activeMembers.map(m => `
      <option value="${m.id}">${esc(m.full_name)} (${esc(m.phone)})</option>
    `).join('');

    if (!memberId && activeMembers.length > 0) {
      memberId = activeMembers[0].id;
    }

    select.value = memberId || '';
  }

  updatePayMemberInfo(memberId);

  const dateEl = document.getElementById('pay-date');
  if (dateEl) dateEl.value = toInputDate(new Date());

  const monthEl = document.getElementById('pay-month');
  if (monthEl) monthEl.value = currentMonthKey();

  const methodEl = document.getElementById('pay-method');
  if (methodEl) methodEl.value = 'Cash';

  clearFormErrors();
  openModal('payment-modal');
}

async function savePayment() {
  const select = document.getElementById('pay-member-select');
  if (select && select.value) {
    _payingMemberId = select.value;
  }

  if (!_payingMemberId) {
    showToast('error', 'Select Member', 'Please select a valid member.');
    return;
  }

  const amount = parseFloat(document.getElementById('pay-amount')?.value || '0');
  const date   = document.getElementById('pay-date')?.value;
  const month  = document.getElementById('pay-month')?.value;
  const method = document.getElementById('pay-method')?.value || 'Cash';

  let valid = true;
  clearFormErrors();
  if (!amount || amount <= 0) { showFieldError('pay-amount', 'Enter a valid amount.'); valid = false; }
  if (!date)  { showFieldError('pay-date',   'Date is required.'); valid = false; }
  if (!month) { showFieldError('pay-month',  'Fee month is required.'); valid = false; }
  if (!valid) return;

  const btn = document.getElementById('btn-save-payment');
  setBtnLoading(btn, true);
  try {
    await recordPayment({
      member_id: _payingMemberId,
      amount_paid: amount,
      payment_date: date,
      fee_for_month: month,
      payment_method: method,
    });
    const m = State.members.find(mem => mem && mem.id === _payingMemberId);
    const waBtn = (m && m.phone)
      ? `<button class="toast-action-btn" onclick="sendWhatsAppReceipt('${esc(m.full_name)}', ${amount}, '${month}', '${m.phone}')"><svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Send WhatsApp Receipt</button>`
      : '';
    showToast('success', 'Payment Recorded', `PKR ${amount.toLocaleString()} recorded for ${m?.full_name || ''}.`, waBtn);
    closeModal('payment-modal');
    renderAll();
  } catch (e) {
    showToast('error','Error', e.message || 'Could not record payment.');
  } finally {
    setBtnLoading(btn, false);
  }
}

function sendWhatsAppReceipt(memberName, amount, month, phone) {
  const cleanPhone = (phone || '').replace(/\D/g,'');
  const intlPhone  = cleanPhone.startsWith('0') ? '92' + cleanPhone.slice(1) : cleanPhone;
  const msg = encodeURIComponent(
    `Salam ${memberName}, thank you! We have received your gym fee of PKR ${amount.toLocaleString()} for ${month}. - Gold Gym 🏋️`
  );
  window.open(`https://wa.me/${intlPhone}?text=${msg}`, '_blank');
}

function exportSingleMemberCSV(memberId) {
  const m = State.members.find(mem => mem && mem.id === memberId);
  if (!m) {
    showToast('error', 'Error', 'Member not found.');
    return;
  }
  const memberPayments = State.payments.filter(p => p && p.member_id === memberId);
  const headers = ['Txn ID', 'Fee Month', 'Payment Date', 'Amount Paid (PKR)', 'Payment Method'];
  const pRows = memberPayments.map(p => [
    p.id,
    p.fee_for_month,
    p.payment_date,
    p.amount_paid,
    p.payment_method
  ]);

  const profileLines = [
    `Gold Gym Member Statement`,
    `Member ID,${m.id}`,
    `Full Name,"${(m.full_name || '').replace(/"/g, '""')}"`,
    `Gender,${m.gender || 'male'}`,
    `Phone,"${m.phone || ''}"`,
    `Joining Date,${m.joining_date || ''}`,
    `Monthly Fee (PKR),${m.monthly_fee || 0}`,
    `Status,${m.status || 'active'}`,
    `Paid Current Month,${isPaidThisMonth(m.id) ? 'Yes' : 'No'}`,
    ``,
    `Payment History`,
    headers.join(',')
  ];

  const csvContent = [...profileLines, ...pRows.map(e => e.join(','))].join('\n');
  downloadCSV(csvContent, `GoldGym_Member_${(m.full_name || 'Member').replace(/\s+/g, '_')}_Statement.csv`);
  showToast('success', 'Exported', `Statement for ${m.full_name} exported to CSV.`);
}

function openIDCardModal(memberId) {
  const m = State.members.find(mem => mem && mem.id === memberId);
  if (!m) return;

  const paid = isPaidThisMonth(m.id);
  const isFemale = m.gender === 'female';

  const cardBox = document.getElementById('idcard-box');
  if (cardBox) cardBox.classList.remove('flipped');

  document.getElementById('idcard-name').textContent = m.full_name || '';
  document.getElementById('idcard-avatar').textContent = getInitials(m.full_name);
  const idcardAvatar = document.getElementById('idcard-avatar');
  if (idcardAvatar) {
    idcardAvatar.className = isFemale ? 'idcard-avatar idcard-avatar-female' : 'idcard-avatar';
  }
  document.getElementById('idcard-phone').textContent = m.phone || '';
  document.getElementById('idcard-gender').textContent = isFemale ? 'Female' : 'Male';
  document.getElementById('idcard-status').textContent = m.status === 'active' ? 'Active' : 'Inactive';
  document.getElementById('idcard-id').textContent = `#${(m.id || 'MEM').toUpperCase()}`;
  document.getElementById('idcard-joining').textContent = formatDate(m.joining_date);

  document.getElementById('idcard-back-fee').textContent = `PKR ${(Number(m.monthly_fee) || 0).toLocaleString()}`;
  const backStatusEl = document.getElementById('idcard-back-status');
  if (backStatusEl) {
    backStatusEl.textContent = paid ? 'Paid' : 'Unpaid';
    backStatusEl.style.color = paid ? 'var(--green)' : 'var(--red)';
  }

  openModal('idcard-modal');
}

function toggleIDCardFlip() {
  const cardBox = document.getElementById('idcard-box');
  if (cardBox) cardBox.classList.toggle('flipped');
}

function printIDCard() {
  window.print();
}

function openLedgerModal(memberId) {
  const m = State.members.find(mem => mem && mem.id === memberId);
  if (!m) return;

  const btnSingle = document.getElementById('btn-export-single-ledger');
  if (btnSingle) {
    btnSingle.onclick = () => exportSingleMemberCSV(memberId);
  }

  const nameEl = document.getElementById('ledger-modal-name');
  if (nameEl) nameEl.textContent = m.full_name || '';

  const memberPayments = State.payments
    .filter(p => p && p.member_id === memberId)
    .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

  const list = document.getElementById('ledger-modal-list');
  if (!list) return;

  if (memberPayments.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg class="svg-icon" style="width:36px;height:36px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></div><div class="empty-title">No payments found</div><div class="empty-sub">No transactions recorded for this member.</div></div>`;
  } else {
    const total = memberPayments.reduce((s,p) => s + (Number(p?.amount_paid) || 0), 0);
    list.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:12px">
        <span style="font-size:0.78rem;color:var(--text-muted);font-weight:700;text-transform:uppercase">Total Paid</span>
        <span style="font-size:1.1rem;font-weight:900;color:var(--gold)">PKR ${total.toLocaleString()}</span>
      </div>
      ${memberPayments.map(p => {
        const feeMonthStr = p.fee_for_month && p.fee_for_month.length >= 7
          ? `${getMonthName(p.fee_for_month.slice(5,7))} ${p.fee_for_month.slice(0,4)}`
          : (p.fee_for_month || '—');
        return `
        <div class="ledger-item">
          <div class="ledger-item-left">
            <h4>${feeMonthStr}</h4>
            <p>${formatDate(p.payment_date)} · <span class="badge ${p.payment_method==='Cash'?'badge-gold':'badge-paid'}" style="font-size:0.65rem;padding:2px 7px">${esc(p.payment_method||'Cash')}</span></p>
          </div>
          <div class="ledger-amount">PKR ${(Number(p.amount_paid) || 0).toLocaleString()}</div>
        </div>
      `;
      }).join('')}
    `;
  }
  openModal('ledger-modal');
}

/* ─────────────────────────────────────────────────────────────
   MEMBER ACTIONS
───────────────────────────────────────────────────────────── */
async function toggleMemberStatus(id) {
  const m = State.members.find(mem => mem && mem.id === id);
  if (!m) return;
  const newStatus = m.status === 'active' ? 'inactive' : 'active';
  try {
    await updateMember(id, { status: newStatus });
    showToast('info','Status Changed', `${m.full_name} is now ${newStatus}.`);
    renderAll();
  } catch (e) {
    showToast('error','Error', e.message);
  }
}

let _deleteId = null;
function confirmDelete(id) {
  _deleteId = id;
  const m = State.members.find(mem => mem && mem.id === id);
  const msgEl = document.getElementById('confirm-msg');
  if (msgEl) msgEl.textContent = `Delete "${m?.full_name}"? This will also erase all their payment records.`;
  const overlay = document.getElementById('confirm-overlay');
  if (overlay) overlay.classList.add('open');
}

function initMemberActions() {
  const cancelBtn = document.getElementById('confirm-cancel');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      const overlay = document.getElementById('confirm-overlay');
      if (overlay) overlay.classList.remove('open');
      _deleteId = null;
    };
  }
  const okBtn = document.getElementById('confirm-ok');
  if (okBtn) {
    okBtn.onclick = async () => {
      if (!_deleteId) return;
      const overlay = document.getElementById('confirm-overlay');
      if (overlay) overlay.classList.remove('open');
      try {
        const m = State.members.find(mem => mem && mem.id === _deleteId);
        await deleteMember(_deleteId);
        showToast('success','Deleted', `${m?.full_name || 'Member'} removed.`);
        renderAll();
      } catch(e) {
        showToast('error','Error', e.message);
      }
      _deleteId = null;
    };
  }

  // Quick Action buttons
  const addBtn1 = document.getElementById('btn-add-member');
  if (addBtn1) addBtn1.addEventListener('click', openAddModal);
  const addBtn2 = document.getElementById('btn-add-member-2');
  if (addBtn2) addBtn2.addEventListener('click', openAddModal);
  const recPayBtn = document.getElementById('btn-record-payment');
  if (recPayBtn) {
    recPayBtn.addEventListener('click', () => {
      const active = getActiveMembers();
      if (active.length === 0) { showToast('info','No Members','Add a member first.'); return; }
      openPaymentModal(active[0].id);
    });
  }

  // Defaulters nav click listener
  const navDefaulters = document.getElementById('nav-defaulters');
  if (navDefaulters) {
    navDefaulters.addEventListener('click', () => {
      filterToDefaulters();
      closeSidebar();
    });
  }

  // Export buttons
  const exportMembersBtn = document.getElementById('btn-export-members');
  if (exportMembersBtn) exportMembersBtn.addEventListener('click', exportMembersCSV);

  const exportLedgerBtn = document.getElementById('btn-export-ledger');
  if (exportLedgerBtn) exportLedgerBtn.addEventListener('click', exportLedgerCSV);
}

/* ─────────────────────────────────────────────────────────────
   WHATSAPP
───────────────────────────────────────────────────────────── */
function sendWhatsApp(memberId) {
  const m = State.members.find(mem => mem && mem.id === memberId);
  if (!m) return;
  const phone = (m.phone || '').replace(/\D/g,'');
  const intlPhone = phone.startsWith('0') ? '92' + phone.slice(1) : phone;
  const msg = encodeURIComponent(
    `Salam ${m.full_name}, your gym fee for this month is pending. Kindly clear it at your earliest. - Gold Gym 🏋️`
  );
  window.open(`https://wa.me/${intlPhone}?text=${msg}`, '_blank');
}

/* ─────────────────────────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────────────────────────── */
function initNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.page);
      closeSidebar();
    });
  });
}

function navigateTo(page) {
  State.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl  = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ─────────────────────────────────────────────────────────────
   SIDEBAR MOBILE
───────────────────────────────────────────────────────────── */
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.addEventListener('click', toggleSidebar);
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.addEventListener('click', closeSidebar);
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.toggle('open');
  if (ov) ov.classList.toggle('open');
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}

/* ─────────────────────────────────────────────────────────────
   THEME
───────────────────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  State.theme = theme;
  _storage.setItem('gymTheme', theme);
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon) {
    icon.innerHTML = theme === 'dark' 
      ? `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>` 
      : `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
  if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function initTheme() {
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      applyTheme(State.theme === 'dark' ? 'light' : 'dark');
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   SEARCH & FILTERS
───────────────────────────────────────────────────────────── */
function initSearch() {
  const headerSearch = document.getElementById('header-search');
  const membersSearch = document.getElementById('members-search');

  function syncSearch(val) {
    State.membersSearch = val;
    if (headerSearch && headerSearch.value !== val) headerSearch.value = val;
    if (membersSearch && membersSearch.value !== val) membersSearch.value = val;
    renderMembers();
  }

  if (headerSearch) {
    headerSearch.addEventListener('input', e => {
      if (State.currentPage !== 'members') navigateTo('members');
      syncSearch(e.target.value);
    });
  }

  if (membersSearch) {
    membersSearch.addEventListener('input', e => {
      syncSearch(e.target.value);
    });
  }

  // Global Ctrl + K search shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('header-search') || document.getElementById('members-search');
      if (input) {
        input.focus();
        input.select();
      }
    }
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab[data-filter]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab[data-filter]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      State.membersFilter = tab.dataset.filter;
      renderMembers();
    });
  });

  // Ledger filters
  const ly = document.getElementById('ledger-year');
  if (ly) {
    ly.addEventListener('change', e => {
      State.ledgerYear = e.target.value;
      renderLedger();
    });
  }
  const lm = document.getElementById('ledger-month');
  if (lm) {
    lm.addEventListener('change', e => {
      State.ledgerMonth = e.target.value;
      renderLedger();
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   LEDGER FILTERS SETUP
───────────────────────────────────────────────────────────── */
function populateLedgerFilters() {
  const yearSel  = document.getElementById('ledger-year');
  const monthSel = document.getElementById('ledger-month');
  if (!yearSel || !monthSel) return;

  while (yearSel.options.length > 1) yearSel.remove(1);
  while (monthSel.options.length > 1) monthSel.remove(1);

  const now = new Date();
  const paymentYears = State.payments
    .map(p => parseInt((p?.fee_for_month || '').slice(0, 4), 10))
    .filter(y => !isNaN(y) && y > 2000);

  const minYear = Math.min(2024, now.getFullYear(), ...paymentYears);
  const maxYear = Math.max(now.getFullYear() + 1, ...paymentYears);

  for (let y = minYear; y <= maxYear; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    yearSel.appendChild(opt);
  }
  State.ledgerYear = String(now.getFullYear());

  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const mNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  months.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = mNames[i];
    if (i === now.getMonth()) opt.selected = true;
    monthSel.appendChild(opt);
  });
  State.ledgerMonth = String(now.getMonth()+1).padStart(2,'0');
}

/* ─────────────────────────────────────────────────────────────
   MODAL UTILITIES
───────────────────────────────────────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  document.body.style.overflow = '';
}

function initModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  const saveMemberBtn = document.getElementById('btn-save-member');
  if (saveMemberBtn) saveMemberBtn.addEventListener('click', saveMember);

  const savePaymentBtn = document.getElementById('btn-save-payment');
  if (savePaymentBtn) savePaymentBtn.addEventListener('click', savePayment);

  const memberForm = document.getElementById('member-form');
  if (memberForm) {
    memberForm.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveMember();
      }
    });
  }

  const paymentModal = document.getElementById('payment-modal');
  if (paymentModal) {
    paymentModal.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        savePayment();
      }
    });
  }

  const payMemberSelect = document.getElementById('pay-member-select');
  if (payMemberSelect) {
    payMemberSelect.addEventListener('change', e => {
      updatePayMemberInfo(e.target.value);
    });
  }
}

/* ─────────────────────────────────────────────────────────────
   CSV EXPORT
───────────────────────────────────────────────────────────── */
function exportMembersCSV() {
  if (!State.members.length) {
    showToast('info', 'No Data', 'No members available to export.');
    return;
  }
  const headers = ['Member ID', 'Full Name', 'Gender', 'Phone', 'Joining Date', 'Monthly Fee (PKR)', 'Status', 'Paid This Month'];
  const rows = State.members.map(m => [
    m.id,
    `"${(m.full_name || '').replace(/"/g, '""')}"`,
    m.gender || 'male',
    `"${m.phone || ''}"`,
    m.joining_date || '',
    m.monthly_fee || 0,
    m.status || 'active',
    isPaidThisMonth(m.id) ? 'Yes' : 'No'
  ]);
  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  downloadCSV(csvContent, `GoldGym_Members_${toInputDate(new Date())}.csv`);
  showToast('success', 'Exported', 'Members directory exported to CSV.');
}

function exportLedgerCSV() {
  let payments = [...State.payments];
  if (State.ledgerYear)  payments = payments.filter(p => (p?.fee_for_month || '').startsWith(State.ledgerYear));
  if (State.ledgerMonth) payments = payments.filter(p => (p?.fee_for_month || '').endsWith(`-${State.ledgerMonth}`));

  if (!payments.length) {
    showToast('info', 'No Data', 'No payment records found for the selected period.');
    return;
  }
  const headers = ['Txn ID', 'Member ID', 'Member Name', 'Amount Paid (PKR)', 'Payment Date', 'Fee Month', 'Payment Method'];
  const rows = payments.map(p => {
    const member = State.members.find(m => m && m.id === p.member_id);
    const mName  = member ? member.full_name : 'Unknown';
    return [
      p.id,
      p.member_id,
      `"${(mName || '').replace(/"/g, '""')}"`,
      p.amount_paid,
      p.payment_date,
      p.fee_for_month,
      p.payment_method
    ];
  });
  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  downloadCSV(csvContent, `GoldGym_Ledger_${toInputDate(new Date())}.csv`);
  showToast('success', 'Exported', 'Payment ledger exported to CSV.');
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ─────────────────────────────────────────────────────────────
   FORM HELPERS
───────────────────────────────────────────────────────────── */
function showFieldError(fieldId, msg) {
  const field = document.getElementById(fieldId);
  if (field) field.classList.add('error');
  const errEl = document.getElementById(`${fieldId}-err`);
  if (errEl) errEl.textContent = msg;
}
function clearFormErrors() {
  document.querySelectorAll('.form-input.error').forEach(f => f.classList.remove('error'));
  document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
}
function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn._origText = btn._origText || btn.innerHTML;
  btn.innerHTML = loading ? '<span style="opacity:0.7">⏳ Saving…</span>' : btn._origText;
}

/* ─────────────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────────────── */
function showToast(type, title, msg, actionHtml = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'🔔'}</span><div class="toast-text"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div>${actionHtml ? `<div style="margin-top:4px">${actionHtml}</div>` : ''}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 350);
  }, actionHtml ? 6000 : 3500);
}

/* ─────────────────────────────────────────────────────────────
   DATE / STRING HELPERS
───────────────────────────────────────────────────────────── */
function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-PK', { day:'2-digit', month:'short', year:'numeric' });
  } catch { return String(dateStr); }
}

function toInputDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthName(mm) {
  const names = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  return names[parseInt(mm,10)] || mm;
}

function updateDateDisplay() {
  const now = new Date();
  const el = document.getElementById('header-date');
  if (el) el.textContent = now.toLocaleDateString('en-PK', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const greet = document.getElementById('header-greeting');
  const hour  = now.getHours();
  if (greet) {
    let g = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    greet.textContent = `${g}, Coach! 💪`;
  }
}

// Global exposure for onclick attributes & console access
if (typeof window !== 'undefined') {
  window.openEditModal    = openEditModal;
  window.openPaymentModal = openPaymentModal;
  window.openLedgerModal  = openLedgerModal;
  window.sendWhatsApp     = sendWhatsApp;
  window.confirmDelete    = confirmDelete;
  window.toggleMemberStatus = toggleMemberStatus;
  window.openAddModal     = openAddModal;
  window.navigateTo       = navigateTo;
  window.exportMembersCSV = exportMembersCSV;
  window.exportLedgerCSV  = exportLedgerCSV;
  window.sendWhatsAppReceipt = sendWhatsAppReceipt;
  window.filterToDefaulters = filterToDefaulters;
  window.exportSingleMemberCSV = exportSingleMemberCSV;
  window.openIDCardModal  = openIDCardModal;
  window.toggleIDCardFlip = toggleIDCardFlip;
  window.printIDCard      = printIDCard;
  window.renderAll        = renderAll;
}
