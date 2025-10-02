import { useEffect, useMemo, useRef, useState } from 'react';

// ---------- Formatters ----------
function fmtNumber(val) {
  if (val === null || val === undefined) return '—';
  const num = typeof val === 'string' ? Number(val) : val;
  if (Number.isNaN(num)) return String(val);
  return num.toLocaleString();
}
function fmtPercent(val) {
  if (val === null || val === undefined) return '—';
  let num = typeof val === 'string' ? Number(val) : val;
  if (Number.isNaN(num)) return String(val);
  if (num <= 1 && num >= -1) num *= 100; // treat 0..1 as fraction
  return `${num.toFixed(2)}%`;
}
function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const g = (row, key) => row?.[key];

const COLUMNS = [
  { key: 'No.', label: 'No.', kind: 'number', align: 'right' },
  { key: 'Country Name', label: 'Country Name', kind: 'text' },
  { key: 'Population', label: 'Population', kind: 'number', align: 'right' },
  { key: '1% Population', label: '1% Population', kind: 'number', align: 'right' },
  { key: 'Est. Count', label: 'Est. Count', kind: 'number', align: 'right' },
  { key: '% of Population', label: '% of Population', kind: 'percent', align: 'right' },
  { key: 'Source', label: 'Source', kind: 'text' },
  { key: 'Conservative Est.', label: 'Conservative Est.', kind: 'number', align: 'right' },
  { key: 'Mid Est.', label: 'Mid Est.', kind: 'number', align: 'right' },
  { key: 'High Est.', label: 'High Est.', kind: 'number', align: 'right' },
  { key: '% Conservative', label: '% Conservative', kind: 'percent', align: 'right' },
  { key: '% Mid', label: '% Mid', kind: 'percent', align: 'right' },
  { key: '% High', label: '% High', kind: 'percent', align: 'right' },
  { key: 'es_created', label: 'ES Created', kind: 'date' },
  { key: 'pg_created', label: 'PG Created', kind: 'date' }
];

function comparator(a, b, col) {
  const av = g(a, col.key), bv = g(b, col.key);
  if (av == null) return bv == null ? 0 : 1;
  if (bv == null) return -1;
  if (col.kind === 'number' || col.kind === 'percent') {
    let na = Number(av), nb = Number(bv);
    if (col.kind === 'percent') {
      if (Math.abs(na) <= 1) na *= 100;
      if (Math.abs(nb) <= 1) nb *= 100;
    }
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(av).localeCompare(String(bv));
    return na - nb;
  }
  if (col.kind === 'date') return new Date(av) - new Date(bv);
  return String(av).localeCompare(String(bv));
}
function renderCell(row, col) {
  const val = g(row, col.key);
  switch (col.kind) {
    case 'number': return fmtNumber(val);
    case 'percent': return fmtPercent(val);
    case 'date': return fmtDate(val);
    default: return val ?? '—';
  }
}
function toCSV(rows) {
  const headers = COLUMNS.map(c => c.label);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return (s.includes('"') || s.includes(',') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const asCsvValue = (val, kind) => {
    if (kind === 'date') return fmtDate(val);
    if (kind === 'percent') {
      let n = Number(val);
      if (!Number.isFinite(n)) return val ?? '';
      if (Math.abs(n) <= 1) n *= 100;
      return `${n}`;
    }
    if (kind === 'number') return typeof val === 'number' ? val : Number(val ?? '');
    return val ?? '';
  };
  const lines = [headers.map(escape).join(',')];
  for (const r of rows) {
    lines.push(COLUMNS.map(c => escape(asCsvValue(g(r, c.key), c.kind))).join(','));
  }
  return lines.join('\n');
}

export default function CountryStatsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ key: 'Country Name', dir: 'asc' });
  const abortRef = useRef(null);

  // Use env base if provided; otherwise rely on Vite proxy
  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      try {
        setLoading(true);
        setErr('');
        const res = await fetch(`${API_BASE}/api/country-stats`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e.name !== 'AbortError') setErr('Failed to load country stats.');
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [API_BASE]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter(r => String(g(r, 'Country Name') ?? '').toLowerCase().includes(needle));
  }, [rows, q]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.key === sort.key) ?? COLUMNS[1];
    const copy = [...filtered].sort((a, b) => comparator(a, b, col));
    return sort.dir === 'asc' ? copy : copy.reverse();
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const onSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const downloadCsv = () => {
    const csv = toCSV(sorted);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'country_stats.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Country Statistics for English Speaking Programmer</h1>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search by country name…"
          aria-label="Search by country name"
          style={{ padding: '0.5rem', minWidth: 260, backgroundColor: '#D5D1E9', color: '#000000' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Page size:
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{backgroundColor: '#D5D1E9', color: '#000000'}}> 
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={downloadCsv} type="button" style={{ backgroundColor: '#D5D1E9', color: '#000000'}}>Download CSV</button>
        <div style={{ marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${sorted.length.toLocaleString()} rows`}
        </div>
      </div>

      {err && <div role="alert" style={{ color: 'crimson', marginBottom: '0.75rem' }}>{err}</div>}

      <div style={{ overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 14 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#F5A7A6', zIndex: 1 }}>
            <tr>
              {COLUMNS.map(col => {
                const isSorted = sort.key === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => onSort(col.key)}
                    style={{
                      position: 'sticky',
                      color: '#000000',
                      top: 0,
                      textAlign: col.align || 'left',
                      fontWeight: 600,
                      padding: '10px 12px',
                      borderBottom: '1px solid #e5e7eb',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    title="Click to sort"
                  >
                    {col.label} {isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody style={{overflow: 'auto'}}>
            {loading ? (
              <tr><td colSpan={COLUMNS.length} style={{ padding: '1rem' }}>Loading…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} style={{ padding: '1rem' }}>No data</td></tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 ? '#D5D1E9' : '#DDE4EE' }}>
                  {COLUMNS.map(col => (
                    <td
                      key={col.key}
                      style={{
                        textAlign: col.align || 'left',
                        padding: '8px 12px',
                        borderBottom: '1px solid #f1f5f9',
                        whiteSpace: 'nowrap',
                        color: '#000000'
                      }}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button type="button" style={{ backgroundColor: '#D5D1E9', color: '#000000'}} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹ Prev</button>
        <span>Page {currentPage} of {pageCount}</span>
        <button type="button" style={{ backgroundColor: '#D5D1E9', color: '#000000'}} onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount}>Next ›</button>
      </div>
    </div>
  );
}
