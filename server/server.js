// server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const path = require('path');
const distPath = path.join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors({
  origin: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  credentials: true
}));
app.use(express.json());


const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: true,
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    ...(process.env.DB_INSTANCE_NAME
      ? { instanceName: process.env.DB_INSTANCE_NAME }
      : {})
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();
pool.on('error', err => console.error('MSSQL pool error', err));

app.get('/api/healthz', (_req, res) => res.json({ ok: true }));

app.get('/api/country-stats', async (_req, res) => {
  await poolConnect;
  try {
    const query = `
SELECT
    ROW_NUMBER() OVER (ORDER BY (SELECT 1)) AS 'No.',
    c.country_name AS 'Country Name',
    c.population AS 'Population',
    c.one_pct_population AS '1% Population',
    es.estimated_count AS 'Est. Count',
    es.pct_of_population '% of Population',
    es.[source] AS 'Source',
    pg.conservative_est AS 'Conservative Est.', 
    pg.mid_est AS 'Mid Est.', 
    pg.high_est AS 'High Est.', 
    pg.pct_conservative AS '% Conservative',
    pg.pct_mid AS '% Mid', 
    pg.pct_high AS '% High',
    es.created_date AS es_created,
    pg.created_date AS pg_created
FROM dbo.countries AS c
OUTER APPLY (
    SELECT TOP (1)
        english_id, estimated_count, pct_of_population, [source], created_date
    FROM dbo.english_speakers AS s
    WHERE s.country_id = c.country_id
    ORDER BY s.created_date DESC, s.english_id DESC
) AS es
OUTER APPLY (
    SELECT TOP (1)
        conservative_est, mid_est, high_est, pct_conservative,
        pct_mid, pct_high, created_date
    FROM dbo.programmers AS t
    WHERE t.country_id = c.country_id
    ORDER BY t.created_date DESC, t.programmer_id DESC
) AS pg
ORDER BY c.country_name ASC;`;

    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Query failed' });
  }
});



// const port = parseInt(process.env.PORT || '3001', 10);
// app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
const port = Number(process.env.PORT || 3001);
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});
app.listen(port, () => console.log(`API listening on port ${port}`));