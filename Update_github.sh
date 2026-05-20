cd /opt/aquamanager
git init
git config user.email "aquamanager@local"
git config user.name "AquaManager"
git remote add origin "https://calimeroweb26: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@github.com/calimeroweb26/AquaManager.git"
git branch -M main
git add -A
git commit -m "AquaManager - mise à jour"
git push -f origin main
