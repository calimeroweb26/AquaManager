const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = 3000;

const db = new sqlite3.Database('/opt/aquamanager/data/aqua.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS aquariums (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    litrage REAL,
    description TEXT,
    dernier_changement TEXT,
    intervalle_changement INTEGER DEFAULT 7,
    filtre_dernier_nettoyage TEXT,
    filtre_intervalle INTEGER DEFAULT 30,
    filtre_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  const colonnes = ['filtre_dernier_nettoyage','filtre_intervalle','filtre_notes'];
  colonnes.forEach(col => {
    let defaut = col === 'filtre_intervalle' ? 'DEFAULT 30' : '';
    db.run(`ALTER TABLE aquariums ADD COLUMN ${col} ${col==='filtre_intervalle'?'INTEGER':'TEXT'} ${defaut}`, ()=>{});
  });
  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    aquarium_id TEXT,
    filename TEXT,
    is_vignette INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`ALTER TABLE photos ADD COLUMN is_vignette INTEGER DEFAULT 0`, ()=>{});
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '/opt/aquamanager/uploads/'),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
app.use('/uploads', express.static('/opt/aquamanager/uploads'));
app.use(express.static('/opt/aquamanager/frontend'));

app.get('/api/aquariums', (req, res) => {
  db.all('SELECT * FROM aquariums ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/aquariums/:id', (req, res) => {
  db.get('SELECT * FROM aquariums WHERE id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

app.post('/api/aquariums', (req, res) => {
  const id = uuidv4();
  const { nom, litrage, description, dernier_changement, intervalle_changement,
          filtre_dernier_nettoyage, filtre_intervalle, filtre_notes } = req.body;
  db.run(`INSERT INTO aquariums (id,nom,litrage,description,dernier_changement,intervalle_changement,
          filtre_dernier_nettoyage,filtre_intervalle,filtre_notes)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, nom, litrage, description, dernier_changement, intervalle_changement||7,
     filtre_dernier_nettoyage, filtre_intervalle||30, filtre_notes],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM aquariums WHERE id=?', [id], (e, row) => res.json(row));
    }
  );
});

app.put('/api/aquariums/:id', (req, res) => {
  const { nom, litrage, description, dernier_changement, intervalle_changement,
          filtre_dernier_nettoyage, filtre_intervalle, filtre_notes } = req.body;
  db.run(`UPDATE aquariums SET nom=?,litrage=?,description=?,dernier_changement=?,
          intervalle_changement=?,filtre_dernier_nettoyage=?,filtre_intervalle=?,filtre_notes=?
          WHERE id=?`,
    [nom, litrage, description, dernier_changement, intervalle_changement||7,
     filtre_dernier_nettoyage, filtre_intervalle||30, filtre_notes, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM aquariums WHERE id=?', [req.params.id], (e, row) => res.json(row));
    }
  );
});

app.delete('/api/aquariums/:id', (req, res) => {
  db.all('SELECT filename FROM photos WHERE aquarium_id=?', [req.params.id], (err, photos) => {
    photos && photos.forEach(p => {
      const fp = path.join('/opt/aquamanager/uploads', p.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    db.run('DELETE FROM photos WHERE aquarium_id=?', [req.params.id]);
    db.run('DELETE FROM aquariums WHERE id=?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.post('/api/aquariums/:id/changement', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.run('UPDATE aquariums SET dernier_changement=? WHERE id=?', [today, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM aquariums WHERE id=?', [req.params.id], (e, row) => {
      res.json(row);
    });
  });
});

app.post('/api/aquariums/:id/nettoyage', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.run('UPDATE aquariums SET filtre_dernier_nettoyage=? WHERE id=?', [today, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM aquariums WHERE id=?', [req.params.id], (e, row) => {
      res.json(row);
    });
  });
});

app.get('/api/aquariums/:id/photos', (req, res) => {
  db.all('SELECT * FROM photos WHERE aquarium_id=? ORDER BY is_vignette DESC, created_at', [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/aquariums/:id/photos', upload.array('photos', 20), (req, res) => {
  const inserts = req.files.map(f => {
    const id = uuidv4();
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO photos (id,aquarium_id,filename,is_vignette) VALUES (?,?,?,0)',
        [id, req.params.id, f.filename], err => err ? reject(err) : resolve());
    });
  });
  Promise.all(inserts).then(() => res.json({ success: true })).catch(e => res.status(500).json({ error: e.message }));
});

app.delete('/api/photos/:id', (req, res) => {
  db.get('SELECT filename FROM photos WHERE id=?', [req.params.id], (err, row) => {
    if (row) {
      const fp = path.join('/opt/aquamanager/uploads', row.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.run('DELETE FROM photos WHERE id=?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

app.put('/api/photos/:id/vignette', (req, res) => {
  const { aquarium_id } = req.body;
  db.run('UPDATE photos SET is_vignette=0 WHERE aquarium_id=?', [aquarium_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run('UPDATE photos SET is_vignette=1 WHERE id=?', [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

function checkRetards() {
  const today = new Date();
  db.all('SELECT * FROM aquariums', [], (err, rows) => {
    if (err) return;
    rows.forEach(row => {
      if (row.dernier_changement && row.intervalle_changement) {
        const dernierChangement = new Date(row.dernier_changement);
        const prochainChangement = new Date(dernierChangement);
        prochainChangement.setDate(prochainChangement.getDate() + row.intervalle_changement);
        const retardJours = Math.floor((today - prochainChangement) / (1000 * 60 * 60 * 24));
        if (retardJours === 0) {
        } else if (retardJours > 0) {
        }
      }
      if (row.filtre_dernier_nettoyage && row.filtre_intervalle) {
        const dernierNettoyage = new Date(row.filtre_dernier_nettoyage);
        const prochainNettoyage = new Date(dernierNettoyage);
        prochainNettoyage.setDate(prochainNettoyage.getDate() + row.filtre_intervalle);
        const retardJours = Math.floor((today - prochainNettoyage) / (1000 * 60 * 60 * 24));
        if (retardJours === 0) {
        } else if (retardJours > 0) {
        }
      }
    });
  });
}

app.listen(PORT, () => {
  console.log(`AquaManager running on port ${PORT}`);
});

