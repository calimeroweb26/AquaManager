const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_FILE = '/opt/aquamanager/alertes-config.json';
const DB_FILE     = '/opt/aquamanager/data/aqua.db';
const LOG_FILE    = '/opt/aquamanager/logs/alertes.log';

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ Config introuvable : ' + CONFIG_FILE);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  try {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch(e) {}
}

function envoyerNotification(config, titre, message, priorite, tags) {
  priorite = priorite || 'default';
  tags = tags || [];
  return new Promise((resolve, reject) => {
    const urlBase = config.ntfy.url.replace(/\/$/, '');
    const fullUrl = urlBase + '/' + config.ntfy.topic;
    const ntfyUrl = new URL(fullUrl);
    const body = Buffer.from(message, 'utf8');

    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Title': titre,
      'Priority': priorite,
      'Content-Length': body.length
    };

    if (tags.length > 0) headers['Tags'] = tags.join(',');
    if (config.ntfy.token) headers['Authorization'] = 'Bearer ' + config.ntfy.token;

    const options = {
      hostname: ntfyUrl.hostname,
      port: ntfyUrl.port || (ntfyUrl.protocol === 'https:' ? 443 : 80),
      path: ntfyUrl.pathname,
      method: 'POST',
      headers: headers
    };

    const lib = ntfyUrl.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          log('✅ Notification envoyée : ' + titre);
          resolve();
        } else {
          log('❌ Erreur ntfy ' + res.statusCode + ' : ' + data);
          reject(new Error('HTTP ' + res.statusCode));
        }
      });
    });

    req.on('error', (e) => {
      log('❌ Erreur réseau : ' + e.message);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

function diffJours(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function verifierAlertes() {
  const config = loadConfig();
  const db = new sqlite3.Database(DB_FILE);

  log('🔍 Vérification des alertes...');

  db.all('SELECT * FROM aquariums', [], async (err, rows) => {
    if (err) {
      log('❌ Erreur DB : ' + err.message);
      db.close();
      return;
    }

    log('📋 ' + rows.length + ' aquarium(s) trouvé(s)');

    for (const row of rows) {
      const nom = row.nom;

      if (row.dernier_changement && row.intervalle_changement) {
        const dernierJ = diffJours(row.dernier_changement);
        const retard   = dernierJ - row.intervalle_changement;

        if (retard === 0 && config.alertes.changement_eau_due_aujourd_hui) {
          await envoyerNotification(
            config,
            '💧 Changement d\'eau aujourd\'hui',
            '🐠 ' + nom + '\n\nChangement d\'eau prévu aujourd\'hui !\nDernier changement : ' + row.dernier_changement,
            'default',
            ['droplet', 'calendar']
          );
        } else if (retard === 1 && config.alertes.changement_eau_en_retard) {
          await envoyerNotification(
            config,
            '⚠️ Changement d\'eau en retard',
            '🐠 ' + nom + '\n\nChangement d\'eau en retard de 1 jour !\nDernier changement : ' + row.dernier_changement,
            'high',
            ['warning', 'droplet']
          );
        } else if (retard > 1 && config.alertes.changement_eau_en_retard && config.alertes.rappel_retard_tous_les_jours) {
          await envoyerNotification(
            config,
            '🚨 Changement d\'eau : ' + retard + 'j de retard',
            '🐠 ' + nom + '\n\nChangement d\'eau en retard de ' + retard + ' jours !\nDernier changement : ' + row.dernier_changement + '\nIntervalle prévu : ' + row.intervalle_changement + ' jours',
            'urgent',
            ['rotating_light', 'droplet']
          );
        }
      }

      if (row.filtre_dernier_nettoyage && row.filtre_intervalle) {
        const dernierJ = diffJours(row.filtre_dernier_nettoyage);
        const retard   = dernierJ - row.filtre_intervalle;

        if (retard === 0 && config.alertes.filtre_due_aujourd_hui) {
          await envoyerNotification(
            config,
            '🔧 Nettoyage filtre aujourd\'hui',
            '🐠 ' + nom + '\n\nNettoyage du filtre prévu aujourd\'hui !\nDernier nettoyage : ' + row.filtre_dernier_nettoyage,
            'default',
            ['wrench', 'calendar']
          );
        } else if (retard === 1 && config.alertes.filtre_en_retard) {
          await envoyerNotification(
            config,
            '⚠️ Nettoyage filtre en retard',
            '🐠 ' + nom + '\n\nNettoyage du filtre en retard de 1 jour !\nDernier nettoyage : ' + row.filtre_dernier_nettoyage,
            'high',
            ['warning', 'wrench']
          );
        } else if (retard > 1 && config.alertes.filtre_en_retard && config.alertes.rappel_retard_tous_les_jours) {
          await envoyerNotification(
            config,
            '🚨 Filtre : ' + retard + 'j de retard',
            '🐠 ' + nom + '\n\nNettoyage filtre en retard de ' + retard + ' jours !\nDernier nettoyage : ' + row.filtre_dernier_nettoyage + '\nIntervalle prévu : ' + row.filtre_intervalle + ' jours',
            'urgent',
            ['rotating_light', 'wrench']
          );
        }
      }
    }

    db.close();
    log('✅ Vérification terminée');
  });
}

function lancerDaemon() {
  const config = loadConfig();
  const [heure, minute] = (config.verification.heure || '08:00').split(':').map(Number);
  log('🚀 Daemon démarré - vérification quotidienne à ' + config.verification.heure);

  function planifierProchain() {
    const now = new Date();
    const prochaine = new Date();
    prochaine.setHours(heure, minute, 0, 0);
    if (prochaine <= now) prochaine.setDate(prochaine.getDate() + 1);
    const delai = prochaine - now;
    log('⏰ Prochaine vérification : ' + prochaine.toLocaleString('fr-FR'));
    setTimeout(() => {
      verifierAlertes();
      planifierProchain();
    }, delai);
  }

  planifierProchain();
}

const args = process.argv.slice(2);

if (args.includes('--daemon')) {
  lancerDaemon();
} else if (args.includes('--test')) {
  const config = loadConfig();
  envoyerNotification(
    config,
    '🐠 AquaManager - Test alertes',
    'Les alertes ntfy fonctionnent correctement !\nConfiguration OK ✅',
    'default',
    ['fish', 'white_check_mark']
  ).then(() => {
    log('✅ Test réussi !');
    process.exit(0);
  }).catch(() => process.exit(1));
} else {
  verifierAlertes();
}
