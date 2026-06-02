#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const configPath = '/opt/aquamanager/alertes-config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const DB_FILE = '/opt/aquamanager/data/aqua.db';

function envoyerNotification(titre, message, priorite = 'default') {
  return new Promise((resolve, reject) => {
    const url = new URL(`${config.ntfy.url}/${config.ntfy.topic}`);
    const body = Buffer.from(message, 'utf8');
    const headers = {
      'Content-Length': body.length,
      'Title': titre.replace(/[^ -~]/g, ''),
      'Priority': priorite,
      'Tags': 'fish'
    };
    if (config.ntfy.token) headers['Authorization'] = `Bearer ${config.ntfy.token}`;

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        console.log(`✓ Notification envoyée: ${titre} (${res.statusCode})`);
        resolve(res.statusCode);
      });
    });
    req.on('error', e => { console.error('Erreur ntfy:', e.message); reject(e); });
    req.write(body);
    req.end();
  });
}

function dbAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function verifierAlertes() {
  console.log('Vérification des alertes...');
  const aujourd_hui = new Date();
  aujourd_hui.setHours(0,0,0,0);
  const db = new sqlite3.Database(DB_FILE);

  try {
    // Vérification changements d'eau
    const aquariums = await dbAll(db, `
      SELECT id, nom, dernier_changement, intervalle_changement
      FROM aquariums
      WHERE dernier_changement IS NOT NULL AND intervalle_changement IS NOT NULL
    `, []);

    for (const row of aquariums) {
      const derniere = new Date(row.dernier_changement);
      derniere.setHours(0,0,0,0);
      const prochaine = new Date(derniere);
      prochaine.setDate(prochaine.getDate() + row.intervalle_changement);
      const diff = Math.floor((aujourd_hui - prochaine) / 86400000);

      if (diff === 0 && config.alertes.changement_eau_due_aujourd_hui) {
        await envoyerNotification(
          `Changement eau - ${row.nom}`,
          `Le changement d'eau de "${row.nom}" est prévu aujourd'hui.`,
          'default'
        );
      } else if (diff > 0 && config.alertes.changement_eau_en_retard) {
        await envoyerNotification(
          `Retard changement eau - ${row.nom}`,
          `Le changement d'eau de "${row.nom}" est en retard de ${diff} jour(s).`,
          'high'
        );
      }
    }

    // Vérification nettoyage filtre
    for (const row of aquariums) {
      if (!row.filtre_dernier_nettoyage || !row.filtre_intervalle) continue;
      const derniere = new Date(row.filtre_dernier_nettoyage);
      derniere.setHours(0,0,0,0);
      const prochaine = new Date(derniere);
      prochaine.setDate(prochaine.getDate() + row.filtre_intervalle);
      const diff = Math.floor((aujourd_hui - prochaine) / 86400000);

      if (diff === 0 && config.alertes.filtre_aujourd_hui) {
        await envoyerNotification(
          `Nettoyage filtre - ${row.nom}`,
          `Le nettoyage du filtre de "${row.nom}" est prévu aujourd'hui.`,
          'default'
        );
      } else if (diff > 0 && config.alertes.filtre_en_retard) {
        await envoyerNotification(
          `Retard filtre - ${row.nom}`,
          `Le nettoyage du filtre de "${row.nom}" est en retard de ${diff} jour(s).`,
          'high'
        );
      }
    }

    console.log('Vérification terminée.');
  } catch (err) {
    console.error('Erreur DB:', err.message);
  } finally {
    db.close();
  }
}

async function testNotification() {
  console.log('Envoi notification de test...');
  await envoyerNotification(
    'AquaManager - Test',
    'Les notifications AquaManager fonctionnent correctement !',
    'default'
  );
  console.log('Test terminé.');
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--test')) {
  testNotification();
} else {
  verifierAlertes();
}
