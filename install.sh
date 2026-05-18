cat > /root/aquamanager-install.sh << 'EOF'
#!/usr/bin/env bash
# AquaManager LXC - Install Script
# Style: community-scripts (tteck)

# Couleurs
YW=$(echo "\033[33m")
BL=$(echo "\033[36m")
RD=$(echo "\033[01;31m")
GN=$(echo "\033[1;92m")
CL=$(echo "\033[m")
BFR="\\r\\033[K"
HOLD="-"
CM="${GN}✓${CL}"
CROSS="${RD}✗${CL}"

set -euo pipefail

header_info() {
clear
cat << "HEADER"
    ___                  __  ___                                   
   /   | ____ ___  ___  /  |/  /___ _____  ____ _____ ____  _____
  / /| |/ __ `/ / / / / /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/
 / ___ / /_/ / /_/ / / /  / / /_/ / / / / /_/ / /_/ /  __/ /    
/_/  |_\__, /\__,_/ /_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/     
         /_/                                  /____/               
HEADER
echo -e "${BL}Node.js + SQLite + Nginx${CL}"
echo ""
}

msg_info() { echo -e "${HOLD} ${YW}${1}...${CL}"; }
msg_ok()   { echo -e "${BFR}${CM} ${GN}${1}${CL}"; }
msg_error(){ echo -e "${BFR}${CROSS} ${RD}${1}${CL}"; }

# =====================
# CHOIX ID AUTOMATIQUE
# =====================
get_next_id() {
  USED=$(pvesh get /cluster/resources --type vm 2>/dev/null | grep -oP '"vmid":\K[0-9]+' | sort -n)
  ID=100
  while echo "$USED" | grep -q "^${ID}$"; do
    ID=$((ID + 1))
  done
  echo $ID
}

# =====================
# VARIABLES
# =====================
header_info

NEXTID=$(get_next_id)
DEFAULT_STORAGE="local-lvm"
DEFAULT_RAM=512
DEFAULT_DISK=4
DEFAULT_CPU=1
OSTYPE="debian"
OSVERSION="12"
TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"

# =====================
# INTERFACE UTILISATEUR
# =====================
echo -e "${YW}Configuration du LXC AquaManager${CL}"
echo ""

# ID
read -p "ID du conteneur [${NEXTID}] : " CT_ID
CT_ID=${CT_ID:-$NEXTID}

# Mot de passe root
while true; do
  read -s -p "Mot de passe root : " ROOT_PASS
  echo ""
  read -s -p "Confirmez le mot de passe : " ROOT_PASS2
  echo ""
  if [ "$ROOT_PASS" = "$ROOT_PASS2" ]; then
    break
  else
    msg_error "Les mots de passe ne correspondent pas, réessayez."
  fi
done

# Hostname
read -p "Hostname [AquaManager] : " CT_HOSTNAME
CT_HOSTNAME=${CT_HOSTNAME:-AquaManager}

# Stockage
read -p "Stockage [${DEFAULT_STORAGE}] : " CT_STORAGE
CT_STORAGE=${CT_STORAGE:-$DEFAULT_STORAGE}

# RAM
read -p "RAM en MB [${DEFAULT_RAM}] : " CT_RAM
CT_RAM=${CT_RAM:-$DEFAULT_RAM}

# Disk
read -p "Taille disque en GB [${DEFAULT_DISK}] : " CT_DISK
CT_DISK=${CT_DISK:-$DEFAULT_DISK}

# GitHub
read -p "GitHub User [calimeroweb26] : " GITHUB_USER
GITHUB_USER=${GITHUB_USER:-calimeroweb26}

read -p "GitHub Repo [AquaManager] : " GITHUB_REPO
GITHUB_REPO=${GITHUB_REPO:-AquaManager}

echo ""
echo -e "${YW}Récapitulatif :${CL}"
echo -e "  ID        : ${BL}${CT_ID}${CL}"
echo -e "  Hostname  : ${BL}${CT_HOSTNAME}${CL}"
echo -e "  Stockage  : ${BL}${CT_STORAGE}${CL}"
echo -e "  RAM       : ${BL}${CT_RAM} MB${CL}"
echo -e "  Disque    : ${BL}${CT_DISK} GB${CL}"
echo -e "  GitHub    : ${BL}https://github.com/${GITHUB_USER}/${GITHUB_REPO}${CL}"
echo ""
read -p "Confirmer la création ? (o/N) : " CONFIRM
CONFIRM=${CONFIRM:-n}
if [[ ! "$CONFIRM" =~ ^[oO]$ ]]; then
  echo "Annulé."
  exit 0
fi

# =====================
# TÉLÉCHARGEMENT TEMPLATE
# =====================
msg_info "Vérification du template Debian 12"
if ! pveam list ${CT_STORAGE} 2>/dev/null | grep -q "$TEMPLATE"; then
  msg_info "Téléchargement du template Debian 12"
  pveam update >/dev/null 2>&1
  pveam download ${CT_STORAGE} ${TEMPLATE} >/dev/null 2>&1 || {
    # Cherche le bon storage pour les templates
    TEMPLATE_STORAGE=$(pvesm status --content vztmpl | awk 'NR>1{print $1}' | head -1)
    pveam download ${TEMPLATE_STORAGE} ${TEMPLATE} >/dev/null 2>&1
    TEMPLATE_PATH="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"
  }
fi
TEMPLATE_PATH="${CT_STORAGE}:vztmpl/${TEMPLATE}"
msg_ok "Template Debian 12 disponible"

# =====================
# CRÉATION DU LXC
# =====================
msg_info "Création du conteneur LXC ${CT_ID}"
pct create ${CT_ID} ${TEMPLATE_PATH} \
  --hostname ${CT_HOSTNAME} \
  --password "${ROOT_PASS}" \
  --cores ${DEFAULT_CPU} \
  --memory ${CT_RAM} \
  --rootfs ${CT_STORAGE}:${CT_DISK} \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --unprivileged 1 \
  --start 0 \
  >/dev/null 2>&1
msg_ok "Conteneur ${CT_ID} créé"

# =====================
# DÉMARRAGE
# =====================
msg_info "Démarrage du conteneur"
pct start ${CT_ID}
sleep 5
msg_ok "Conteneur démarré"

# =====================
# INSTALLATION
# =====================
msg_info "Mise à jour du système"
pct exec ${CT_ID} -- bash -c "apt-get update -qq && apt-get upgrade -y -qq" >/dev/null 2>&1
msg_ok "Système mis à jour"

msg_info "Installation des dépendances (Node.js, Nginx, Git, SQLite)"
pct exec ${CT_ID} -- bash -c "
  apt-get install -y -qq curl git nginx sqlite3 >/dev/null 2>&1
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null 2>&1
" >/dev/null 2>&1
msg_ok "Dépendances installées"

msg_info "Récupération des fichiers depuis GitHub"
pct exec ${CT_ID} -- bash -c "
  mkdir -p /opt/aquamanager
  git clone https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git /opt/aquamanager
" >/dev/null 2>&1
msg_ok "Fichiers récupérés depuis GitHub"

msg_info "Installation des modules Node.js"
pct exec ${CT_ID} -- bash -c "
  cd /opt/aquamanager
  npm install >/dev/null 2>&1
" >/dev/null 2>&1
msg_ok "Modules Node.js installés"

msg_info "Configuration Nginx"
pct exec ${CT_ID} -- bash -c "
cat > /etc/nginx/sites-available/aquamanager << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF
ln -sf /etc/nginx/sites-available/aquamanager /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx
" >/dev/null 2>&1
msg_ok "Nginx configuré"

msg_info "Configuration du service systemd"
pct exec ${CT_ID} -- bash -c "
cat > /etc/systemd/system/aquamanager.service << 'SVCEOF'
[Unit]
Description=AquaManager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/aquamanager
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable aquamanager >/dev/null 2>&1
systemctl start aquamanager
" >/dev/null 2>&1
msg_ok "Service AquaManager démarré"

# =====================
# RÉSULTAT FINAL
# =====================
IP=$(pct exec ${CT_ID} -- hostname -I | awk '{print $1}')
echo ""
echo -e "${GN}════════════════════════════════════════${CL}"
echo -e "${GN}  ✓ AquaManager installé avec succès !${CL}"
echo -e "${GN}════════════════════════════════════════${CL}"
echo -e "  ID LXC    : ${BL}${CT_ID}${CL}"
echo -e "  IP        : ${BL}${IP}${CL}"
echo -e "  Accès     : ${BL}http://${IP}${CL}"
echo -e "  Dashboard : ${BL}http://${IP}/index.html${CL}"
echo ""
EOF

chmod +x /root/aquamanager-install.sh
echo "Script créé ! Lancez : bash /root/aquamanager-install.sh"
