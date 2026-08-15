# Umgebung für Headless-Chromium ohne root (Bibliotheken lokal unter ~/chrome-libs)
export LD_LIBRARY_PATH="$HOME/chrome-libs/usr/lib/x86_64-linux-gnu:$HOME/chrome-libs/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export FONTCONFIG_PATH="$HOME/chrome-libs/etc/fonts"
export CHROME_PATH="$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome"
