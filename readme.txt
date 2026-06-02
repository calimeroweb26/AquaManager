AquaManager

Gestion des changements d'eau et des nettoyages de filtre pour mes aquariums

------------------------------------------------------------------------------------------------------
parametrage cron pour les alertes : 

crontab -e
0 8 * * * node /opt/aquamanager/backend/alertes-ntfy.js >> /opt/aquamanager/logs/alertes.log 2>&1
0 12 * * * node /opt/aquamanager/backend/alertes-ntfy.js >> /opt/aquamanager/logs/alertes.log 2>&1
0 19 * * * node /opt/aquamanager/backend/alertes-ntfy.js >> /opt/aquamanager/logs/alertes.log 2>&1
mkdir -p /opt/aquamanager/logs
cat /opt/aquamanager/alertes-config.json
node /opt/aquamanager/backend/alertes-ntfy.js --test

------------------------------------------------------------------------------------------------------



