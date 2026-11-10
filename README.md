Extension Chrome / Edge / Brave pour lire des webtoons dans une langue qu’on apprend.

Texte sélectionné : sélectionne un mot ou une phrase, la traduction s’affiche dans une bulle.
Zone sur une image (OCR) : appuie sur Alt + Shift + T, trace un rectangle autour d’une bulle de dialogue, l’extension lit le texte de l’image puis le traduit.

L’OCR (Tesseract.js) tourne entièrement dans le navigateur. Seul le texte lu est envoyé à Google Translate.

Installation
Cloner ou télécharger ce dépôt.
Ouvrir chrome://extensions et activer le Mode développeur.
Cliquer sur Charger l’extension non empaquetée et choisir le dossier du dépôt.
Après une mise à jour du code, cliquer sur le bouton de rechargement de l’extension.

Le raccourci est modifiable dans chrome://extensions/shortcuts.

Langues

Langue du webtoon : espagnol, anglais, portugais, italien, allemand ou détection automatique (espagnol + anglais pour l’OCR).
Langue de traduction : français, anglais, espagnol, portugais, arabe. Les deux se règlent depuis l’icône de l’extension.

Fichiers
Fichier	Rôle
manifest.json	Déclaration de l’extension (permissions, raccourci)
content.js / content.css	Bulle de traduction et tracé de la zone sur la page
background.js	Capture de l’écran, appel à l’OCR, traduction
offscreen.html / offscreen.js	Prépare l’image et lance l’OCR
popup.html / popup.js	Menu de l’icône (langues, bouton zone)
lib/	Tesseract.js, moteur WebAssembly et données de langue (≈ 21 Mo)
Limites
Les polices très stylisées et les effets sonores sont souvent mal lus.
La traduction utilise un accès gratuit non officiel de Google Translate, qui peut changer ou être limité.
