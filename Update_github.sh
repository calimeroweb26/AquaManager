#!/bin/bash

cd /opt/aquamanager || exit

# 1. Vérifier si le remote existe déjà
if git remote | grep -q origin; then
    echo "✅ Remote 'origin' existe déjà. Mise à jour de l'URL..."
    git remote set-url origin "https://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@github.com/calimeroweb26/AquaManager.git"
else
    git remote add origin "https://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@github.com/calimeroweb26/AquaManager.git"
fi

# 2. Configurer Git (si pas déjà fait)
git config user.email "aquamanager@local"
git config user.name "AquaManager"

# 3. Ajouter les fichiers et committer
git add -A
git commit -m "AquaManager - mise à jour" || echo "⚠️ Aucun changement à committer."

# 4. Pousser les modifications (sans -f sauf si nécessaire)
git push origin main
