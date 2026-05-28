#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const configPath = '/opt/aquamanager/alertes-config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://aquauser:aquapass@localhost:5432/aquamanager'
});

function envoyerNotification(titre, message, priorite = 'default') {
  return new Promise((resolve, reject) => {
    const url = new URL(`${config.ntfy.url}/${config.ntfy.topic}`);
    const body = Buffer.from(message, 'utf8');
    const headers = {
      'Content-Length': body.length,
      'Title': Buffer.from(titre).toString('ascii').replace(/[^ -~]/g, ''),
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
      let data = '';
      res.on('data', d => data += d);
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

async function verifierAlertes() {
  console.log('Vérification des alertes...');
  const aujourd_hui = new Date().toISOString().split('T')[0];
  
  try {
    // Changements d'eau en retard
    const retardEau = await pool.query(`
      SELECT a.nom, a.id,
        (SELECT MAX(ce.date_changement) FROM changements_eau ce WHERE ce.aquarium_id = a.id) as derniere_date,
        a.frequence_changement_eau
      FROM aquariums a
      WHERE a.actif = true
      AND a.frequence_changement_eau IS NOT NULL
    `);

    for (const row of retardEau.rows) {
      if (!row.derniere_date) continue;
      const derniere = new Date(row.derniere_date);
      const prochaine = new Date(derniere);
      prochaine.setDate(prochaine.getDate() + row.frequence_changement_eau);
      const diff = Math.floor((new Date(aujourd_hui) - prochaine) / 86400000);
      
      if (diff === 0 && config.alertes.changement_eau_due_aujourd_hui) {
        await envoyerNotification(
          `💧 Changement d'eau - ${row.nom}`,
          `Le changement d'eau de l'aquarium "${row.nom}" est prévu aujourd'hui.`,
          'default'
        );
      } else if (diff > 0 && config.alertes.changement_eau_en_retard) {
        await envoyerNotification(
          `⚠️ Retard changement d'eau - ${row.nom}`,
          `Le changement d'eau de l'aquarium "${row.nom}" est en retard de ${diff} jour(s).`,
          'high'
        );
      }
    }

    console.log('Vérification terminée.');
  } catch (err) {
    console.error('Erreur DB:', err.message);
  } finally {
    await pool.end();
  }
}

async function testNotification() {
  console.log('Envoi notification de test...');
  await envoyerNotification(
    '🐟 AquaManager - Test',
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
