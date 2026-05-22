cat > /opt/aquamanager/push-github.sh << 'EOF'
#!/bin/bash
GITHUB_TOKEN="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"
REPO="calimeroweb26/AquaManager"

cd /opt/aquamanager

# Init git si pas encore fait
if [ ! -d ".git" ]; then
  git init
  git branch -M main
fi

# Config
git config user.email "aquamanager@local"
git config user.name "AquaManager"

# Remote
git remote remove origin 2>/dev/null
git remote add origin "https://calimeroweb26:${GITHUB_TOKEN}@github.com/${REPO}.git"

# Push
git add -A
git commit -m "Mise à jour - $(date '+%Y-%m-%d %H:%M:%S')"
git push -f origin main

echo "✅ GitHub mis à jour !"
echo "🔗 https://github.com/${REPO}"
EOF

chmod +x /opt/aquamanager/push-github.sh
