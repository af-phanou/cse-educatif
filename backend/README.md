# Backend CSE Éducatif — préparation de l'application

**Etat : infrastructure en construction, pas encore une application de production.**
Le site public officiel reste la page de maintenance servie par Caddy.

## Ce qui existe

- API Node.js avec /healthz (processus) et /readyz (connexion PostgreSQL).
- Aucun endpoint pour consulter ou modifier les données personnelles, aucun port public sur l'API.
- Conteneur de migration ponctuel : create/alter role cse_app avec un secret indépendant.
- Le compte de l'API cse_app n'a aucun privilège de création de schémas/tables
  et ne peut pas attribuer des droits administrateur aux comptes.
- Migration 001 : comptes utilisateurs, demandes de revue, imports CSV d'**éligibilité**
  et journal d'audit.

## Migration du VPS existant (sans publier la maquette)

Dans /srv/cse-educatif sur Ubuntu :

1. Mettre à jour la copie du dépôt :
   `git -C app/maquette pull --ff-only`.
2. Créer **une seule fois** le secret du compte applicatif :
   `umask 077 && openssl rand -hex 32 > secrets/app_db_password`.
   Ne jamais afficher, copier vers le chat ou commiter cette valeur.
3. `cp app/maquette/backend/compose.vps.yaml compose.api.yaml`.
4. Contrôler la configuration :
   `sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet`.
5. Lancer la migration ponctuelle :
   `sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate`.
6. Après succès, recréer l'API :
   `sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build api`.

Le secret de la migration est l'ancien secret de PostgreSQL ; l'API ne voit
**que** son nouveau secret. Le compte administratif de PostgreSQL reste
disponible uniquement pour maintenance et migrations ponctuelles.

## Schéma de données

- `cse.roster_imports` : lots CSV et état (staged, active, archived).
  Un seul lot peut être actif à la fois.
- `cse.roster_entries` : uniquement nom, prénom et numéro
  d'établissement provenant du CSV. Deux homonymes ne sont pas fusionnés.
- `cse.accounts` : profils saisis volontairement par les salariés ;
  comptes en attente de validation par défaut. Les mots de passe devront être
  hachés (Argon2id) avant toute création réelle de compte.
- `cse.account_reviews` : file de revue manuelle (absence de
  correspondance, homonymies, ambiguïtés).
- `cse.administrator_grants` : attributions administrateur que
  l'API ne peut pas insérer ou modifier directement.
- `cse.audit_events` : journal auquel l'API peut ajouter,
  mais pas modifier ni supprimer d'événements.

## Ce qui manque avant toute donnée réelle

Authentification sécurisée, vérification des droits sur chaque route, hachage
de mots de passe, import CSV validé/reconcilié, emails transactionnels,
stockage privé et sauvegardes chiffrées des billets PDF, configuration et
tests des sauvegardes, procédures RGPD pour les données hébergées au Canada,
et gestion des incidents/supervision. Ne pas importer de vrais CSV RH à ce stade.
La maquette HTML/JS actuelle conserve ses données en localStorage/IndexedDB,
sans liaison avec l'API.

## Sécurité

Ne jamais publier un port 5432 ou 3000 ; le backend et PostgreSQL utilisent
le réseau `cse_private`. Le dossier `secrets/` est hors du dépôt
GitHub, en permissions restrictives. Ne jamais coller un secret dans un ticket
GitHub, un message ou une commande visible dans les historiques de shell.


## Controle d'eligibilite CSV (module en preparation)

Le module `src/eligibility.js` analyse un CSV (separateur point-virgule,
virgule ou tabulation) et ne conserve que **nom, prenom et numero
d'etablissement**. Les autres colonnes sont ignorees.

- Une seule correspondance dans le lot actif pourra ouvrir le parcours
  d'inscription, sans activer automatiquement le compte.
- Une absence ou plusieurs correspondances (homonymes) imposent une
  **validation manuelle**.
- Le numero d'etablissement conserve ses zeros initiaux.
- Le resultat d'une verification est une information interne ; ne jamais
  exposer au candidat un message permettant de deduire la presence d'un
  autre salarie dans le fichier.
- Il n'existe **aucun endpoint public** d'inscription ou d'import a ce stade.

**Test sans donnees reelles** (sur le VPS, apres `git pull`) :
```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api node --test test/eligibility.test.js
```

Pour tester uniquement la lecture d'un exemple fictif, sans insertion SQL :
```bash
printf 'nom;prenom;numero_etablissement\nEXEMPLE;Alice;0001\n' | sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm -T --no-deps api node src/check-roster.js --preview -
```

Cette verification **n'importe ni ne stocke** le fichier et ne cree
aucun compte. L'import mensuel et la creation d'un compte seront raccordes
au backend uniquement apres l'ajout de l'authentification administrateur,
de la revue manuelle, des emails et des protections RGPD.


## Inscription salarie : etape preparatoire

Fichiers :
- `src/registration.js` : nettoie et valide les champs saisis
  par le salarie, consulte uniquement le **dernier lot CSV actif** par requete
  SQL parametree, classe une correspondance unique comme "eligible_provisional"
  et tous les cas incertains en "manual_review".
- `test/registration.test.js` : 10 tests unitaires couvrant les
  donnees saisies, homonymes, absence, absence de CSV actif et discretion des
  reponses publiques.
- `migrations/002_app_readonly.sql` : retire les droits d'ecriture
  de l'API sur les fichiers d'eligibilite, comptes et demandes de revue, en
  attendant un vrai parcours authentifie.

**Attention :** aucune inscription n'est encore enregistree, aucun compte
active, aucun email envoye et aucun endpoint HTTP d'inscription expose.
L'objet `publicStatus` ne doit pas etre utilise comme un
accuse de reception avant la creation du service de persistance. Le
formulaire final necessitera hachage Argon2id, verification de possession
de l'adresse email, limitation des tentatives, anti-enumeration,
administration securisee, audit et envoi email via un service reel.

Commandes de controle VPS (donnees uniquement fictives) :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
```

Puis, apres validation des tests, appliquer la migration restrictive :
```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
```

La migration 002 est prevue pour etre rejouee sans modification
lorsqu'elle a deja ete appliquee. Ne pas importer de CSV RH reel.


## Repertoire des etablissements (migration 003)

Le nouveau catalogue des etablissements est en base SQL, sans liste figee :

| Code (texte) | Etablissement |
|---|---|
| 01 | SIEGE |
| 05 | DAME DU ROITELET |
| 07 | DAME LE MESNIL |
| 08 | DAME LE RECUEIL |
| 09 | LES TOURNESOLS |

- Le code est une chaine de caracteres, avec les zeros initiaux conserves.
- La requete privee `GET /api/etablissements` rend seulement les lieux actifs.
- Le gabarit `public/inscription.html` contient la liste deroulante requise (remplie depuis l'API) et n'est pas publie.
- Le bouton d'inscription est volontairement inactif tant que les sessions, mots de passe et emails ne sont pas securises.
- La verification cote serveur refuse toute eligibilite provisoire pour un code inconnu ou desactive.
- Les modifications sont journalisees ; une desactivation ne supprime pas l'historique.
- La migration ajoute une future designation `superadmin` dans `administrator_grants`, sans encore ouvrir une interface d'administration web.

### Installer sur le VPS existant

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
```

Verifier la liste depuis le conteneur API :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml exec -T api node -e 'fetch("http://127.0.0.1:3000/api/etablissements").then(async r => console.log(r.status, await r.text()))'
```

### Gestion reservee au VPS, en attendant la connexion web du superadministrateur

Un operateur disposant de l'acces SSH au VPS peut afficher, ajouter, renommer ou desactiver des etablissements. Les modifications groupées sont transactionnelles et auditees. Ne jamais publier cet outil sur Internet.

Lister tous les etablissements (actifs ou non) :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/manage-establishments.js list
```

**Exemple fictif** (ne pas executer sans demander ces ajouts) :

```bash
printf '[{"code":"10","name":"NOUVEAU SITE","displayOrder":10},{"code":"11","name":"AUTRE SITE","displayOrder":11}]\n' | sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm -T --no-deps migrate node src/manage-establishments.js upsert --stdin
```

Le champ `"active":false` retire un site du menu sans le supprimer, les sites existants peuvent etre renommes avec le meme code. Seule une future application admin authentifiee doit exposer l'edition au superadministrateur ; aucune route HTTP d'ecriture n'existe.

Ne pas importer de vrai CSV RH ou creer de compte tant que les protections GDPR/RGPD, notamment le traitement des donnees au Canada, les sauvegardes et les controles de session ne sont pas en place.


## Panneau prive d'administration des etablissements (migration 004)

**Etape provisoire de maintenance : accessible uniquement depuis une session SSH**, avec jeton prive supplementaire. Ce panneau ne constitue **PAS encore**
l'interface de production superadministrateur : sa gestion des identites,
des sessions et des autorisations individuelles reste a developper.

La migration 004 cree le role SQL `cse_site_manager`, qui n'a acces en
lecture/ecriture qu'aux etablissements et en insertion au journal
`cse.establishment_changes`. Aucune permission sur les listes RH ou
les comptes salaries.

L'application `etablissements_admin` tourne sur le conteneur Node.js,
publiee sur le **seul loopback du VPS** :
`127.0.0.1:8088:3100`. Ne jamais l'ajouter au Caddyfile public,
ne jamais modifier le bind en `0.0.0.0`, et ne jamais ouvrir 8088
dans UFW / pare-feu OVH.

### Initialiser et demarrer

Dans **Ubuntu VPS**, apres avoir mis a jour le depot :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

# Creer une seule fois deux secrets prives, sans les afficher
if [ ! -f secrets/establishments_db_password ]; then
  (umask 077; openssl rand -hex 32 > secrets/establishments_db_password)
fi
if [ ! -f secrets/establishments_panel_token ]; then
  (umask 077; openssl rand -hex 32 > secrets/establishments_panel_token)
fi
chmod 600 secrets/establishments_db_password secrets/establishments_panel_token

cp compose.api.yaml compose.api.yaml.backup
cp app/maquette/backend/compose.vps.yaml compose.api.yaml
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build etablissements_admin
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml ps
```

Verifier que la publication affiche UNIQUEMENT
`127.0.0.1:8088->3100/tcp` pour `etablissements_admin`, et
que les conteneurs `db`, `api` et `web` demeurent sains.

Dans **PowerShell Windows** (ouvrir une nouvelle fenetre et laisser ouverte) :

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_cse" -L 8088:127.0.0.1:8088 ubuntu@167.114.71.54
```

Dans le navigateur du PC, ouvrir `http://localhost:8088/`.
Cette liaison est chiffree par SSH entre le PC et le VPS.
Dans le terminal prive du VPS, lire le jeton **uniquement pour
le saisir dans le navigateur personnel**, jamais dans ce chat :

```bash
cat /srv/cse-educatif/secrets/establishments_panel_token
```

Le jeton n'est jamais enregistre en localStorage ni en cookie :
le rechargement de la page impose une nouvelle saisie. Les operations
de modification sont transactionnelles et ajoutees au journal.
Le code d'un etablissement existant ne peut pas etre change, mais
son nom, son ordre et son etat actif peuvent l'etre. L'interface accepte
plusieurs nouveaux codes d'un coup (`code;nom;ordre`, une ligne par site).

**Avant l'ouverture de l'administration sur le domaine public** :
mettre en place comptes superadmin authentifies, MFA, sessions serveur,
protection CSRF, audit individualise, rotation des secrets, tests de
securite, sauvegardes testees et verification RGPD. Actuellement le
panneau n'est utilisable que par la personne ayant l'acces SSH et le jeton.


### Correctif Docker 29 : port 8088 non publie

Sur certaines versions de Docker Engine 29 avec Ubuntu 26.04, un port declare
dans `ports` n'est **pas** publie si le service n'est relie qu'a un
reseau Docker `internal: true`. Le conteneur peut rester `healthy`
alors que `curl http://127.0.0.1:8088/` echoue.

Le fichier `compose.vps.yaml` relie donc maintenant le service
`etablissements_admin` a deux reseaux :

- `cse_private` (interne), pour PostgreSQL ;
- `cse_panel_bridge` (bridge normal et dedie), pour permettre la
  publication locale `127.0.0.1:8088:3100`.

Le port n'est **jamais** publie sur `0.0.0.0` et ne doit pas etre ajoute
a Caddy ou a UFW.

Sur Ubuntu, apres `git -C app/maquette pull --ff-only` :

```bash
cd /srv/cse-educatif
cp compose.api.yaml compose.api.yaml.backup
cp app/maquette/backend/compose.vps.yaml compose.api.yaml
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --force-recreate etablissements_admin
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml ps
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/; echo
```

La derniere commande doit repondre `200` (requete GET).
La colonne `PORTS` du panneau doit afficher
`127.0.0.1:8088->3100/tcp`.


## Etape 27 — Dossier d'inscription prive (migration 005)

Cette etape prepare **le traitement cote serveur**, mais n'ouvre
pas encore l'inscription sur le site officiel.

### Ce qui a ete ajoute

- `cse.registration_requests` : donnees saisies par le salarie,
  uniquement statut initial `pending`. Aucun compte actif ni mot de
  passe n'est cree a cette etape.
- `cse.registration_reviews` : file de validation manuelle si le
  salarie est absent du CSV, ambigu ou si aucun import actif n'existe.
- `cse.email_outbox` : preparation de la confirmation au salarie et
  de la notification de revue administrative. Tous les messages restent
  `not_configured` : **aucun email n'est encore envoye**.
- `src/registration-submission.js` : traite une demande dans
  une transaction PostgreSQL, utilise le CSV actif et le code
  d'etablissement, empeche les doublons de demandes en attente,
  prepare les notifications, journalise sans exposer les noms.
- `src/check-registration-setup.js` : controle les permissions SQL
  de l'API sans creer de demande ni lire de donnees personnelles.
- `POST /api/inscriptions` : route d'essai interne **DESACTIVEE
  PAR DEFAUT**. La configuration Docker ne definit pas
  `CSE_REGISTRATION_TEST_ONLY=1`. Ne pas activer sur le site
  public tant que l'anti-abus durable, la verification de l'email,
  l'administration, le SMTP, les sauvegardes et le RGPD ne sont
  pas finalises. Caddy ne publie pas cette route.
- Renforcement des privileges : `cse_app` peut inserer des demandes
  mais ne peut pas modifier leur statut ni consulter les comptes
  existants. La liste RH reste en lecture minimale.

### Installation sur VPS

Dans le terminal Ubuntu :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml exec -T api node src/check-registration-setup.js
```

Le dernier controle doit afficher `"status":"ok"` et cinq verifications
toutes a `true`. Aucune donnee RH n'est chargee par cette operation.

### Etapes indispensables avant toute inscription reelle

1. Authentification et gestion des mots de passe haches (Argon2id),
   verification de l'email par lien a usage unique, puis activation.
2. Administration authentifiee pour valider/refuser les demandes
   manuelles et consulter les dossiers avec permissions au strict besoin.
3. Import CSV mensuel reserve aux administrateurs, avec controles
   de qualite et journalisation ; ne jamais faire de rapprochement
   automatique des homonymes.
4. SMTP et emails transactionnels reels, protections anti-abus partagees,
   surveillance, sauvegardes testees, procedure d'effacement des demandes
   expirees et mentions RGPD (VPS heberge au Canada).

**N'importer aucun CSV RH reel et ne saisir aucune coordonnee personnelle
de salarie pendant cette phase.**


## Etape 28 — Panneau prive de validation des inscriptions

La migration `006_registration_review.sql` cree un role SQL dedie :
`cse_registration_reviewer`. Il ne peut consulter que les
colonnes necessaires des demandes d'inscription, puis **approuver**
ou **refuser** une demande en attente. Il n'a pas acces aux listes RH,
aux comptes salaries, aux adresses postales ou aux numeros de telephone.

**Important** : approuver une demande n'active aucun compte et
n'envoie aucun email. La verification de l'adresse email, les comptes
utilisateurs et les expeditions SMTP restent a implementer.

Le service `inscriptions_admin` est accessible **UNIQUEMENT** sur le
loopback du VPS `127.0.0.1:8089`, par tunnel SSH depuis le PC.
Il partage le reseau interne PostgreSQL et le bridge dedie
`cse_panel_bridge` (necessaire a la publication sur Docker 29).
Aucun port public n'est ouvert. **Ne jamais ajouter cette route a Caddy,
ni publier 8089 sur 0.0.0.0, ni ouvrir le port dans UFW.**

### Mise a jour sur Ubuntu VPS

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

if [ ! -f secrets/registration_reviewer_db_password ]; then
  (umask 077; openssl rand -hex 32 > secrets/registration_reviewer_db_password)
fi
if [ ! -f secrets/registration_review_panel_token ]; then
  (umask 077; openssl rand -hex 32 > secrets/registration_review_panel_token)
fi
chmod 600 secrets/registration_reviewer_db_password secrets/registration_review_panel_token

cp compose.api.yaml compose.api.yaml.backup
cp app/maquette/backend/compose.vps.yaml compose.api.yaml
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build inscriptions_admin
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml ps
```

Resultat attendu des tests : **64 reussites et 0 echec**.
La migration doit appliquer `006_registration_review.sql`.
Le service `inscriptions_admin` doit etre `healthy` et publier
uniquement `127.0.0.1:8089->3101/tcp`.

Verifications dans Ubuntu :

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8089/; echo
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml exec -T inscriptions_admin node src/check-review-setup.js
```

Le controle HTTP doit repondre `200`. Le test des droits doit
repondre `"status":"ok"` avec les huit controles vrais.

### Tunnel depuis PowerShell Windows

Si le tunnel des etablissements est deja actif, l'arreter avec Ctrl+C
puis ouvrir un tunnel SSH combinant les deux ports :

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_cse" -o ExitOnForwardFailure=yes -N -L 127.0.0.1:18088:127.0.0.1:8088 -L 127.0.0.1:18089:127.0.0.1:8089 ubuntu@167.114.71.54
```

Ouvrir **manuellement** dans le navigateur du PC :
`http://127.0.0.1:18089/`

Recuperer dans Ubuntu le jeton **uniquement sur un terminal prive** :

```bash
cat /srv/cse-educatif/secrets/registration_review_panel_token
```

Ne jamais transmettre ce jeton dans un chat, une capture, GitHub,
un email ou un document non chiffre.

La file d'attente sera normalement **vide** pour le moment : les
inscriptions publiques sont toujours fermees et aucun CSV RH reel
ne doit etre importe. Le panneau permet de tester l'affichage sans
creer de comptes ou envoyer d'emails. Les decisions sont journalisees,
mais non attribuees a un compte individuel : l'authentification par
identite et la double authentification restent a developper.

### Avant toute production

Mettre en place un superadministrateur authentifie (MFA), une gestion
des permissions et de l'audit individualisee, la verification de l'email,
la creation des comptes avec Argon2id, un import CSV RH mensuel securise,
un service SMTP, la suppression des dossiers expires, des sauvegardes
testees et la conformite RGPD pour les donnees hebergees au Canada.

## Etape 31 — Test de bout en bout du panneau avec une demande fictive

L'outil prive src/demo-request-cli.js cree exclusivement une demande
« DEMONSTRATION FICTIF CSE » avec l'email reserve
demo-validation-cse@example.invalid, dans le premier etablissement actif.
Il utilise le parcours normal de demande via le role SQL limite cse_app.
Il ne cree aucun compte actif et n'envoie aucun email.

Depuis le terminal Ubuntu du VPS, apres mise a jour du depot :

~~~bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
~~~

Nombre attendu : 67 tests passes, 0 echec.

Creer la demande fictive (INSEREE dans PostgreSQL pour ce test) :

~~~bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api node src/demo-request-cli.js create
~~~

Dans le panneau prive de validation (http://127.0.0.1:18089/),
cliquer sur Actualiser puis trouver DEMONSTRATION FICTIF CSE.
Cliquer sur Approuver ou Refuser afin de confirmer la prise en charge.
Le dossier ne doit plus apparaitre parmi les demandes en attente.
Ces decisions n'activent aucun compte salarie et n'envoient aucun email.

Apres ce test, supprimer les demandes et notifications FICTIVES seulement :

~~~bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/demo-request-cli.js cleanup --confirm-demo-cleanup
~~~

Le nettoyage s'applique seulement a cette combinaison exacte de nom,
prenom et adresse example.invalid. Les entrees d'audit sans donnees
personnelles sont conservees. Ne jamais utiliser de donnees RH reelles
pour ce test, surtout avant les mesures RGPD et sauvegardes prevues.


## Étape 33 — Import mensuel privé du CSV d'éligibilité

La migration `007_roster_manager.sql` crée `cse_roster_manager`,
un rôle réservé aux imports. Il **n'a pas accès aux comptes salariés ni
aux demandes d'inscription**. Il peut charger des lignes minimales
dans `cse.roster_entries`, lire les métadonnées des lots, et
activer un nouveau lot après confirmation.

Le panneau `salaries_csv_admin` propose :

- prévisualisation d'un fichier UTF-8 jusqu'à **2 Mio / 15 000 lignes** ;
- colonnes `nom;prenom;numero_etablissement` obligatoires ;
- autres colonnes ignorées, non stockées ;
- décompte des doublons / homonymes et contrôle des codes d'établissement ;
- **import en attente** sans modifier la liste actuellement active ;
- activation manuelle du lot, qui archive le précédent en **une transaction** ;
- présentation des dates, nombres de lignes et empreintes, jamais la
  liste des noms / prénoms dans le tableau de bord.

L'établissement est validé sur le répertoire PostgreSQL **actif**.
Les codes restent des chaînes, pour conserver `01`, `05`, etc.
Les homonymes sont conservés comme plusieurs lignes ; la recherche
de correspondance lors de l'inscription les renvoie en revue manuelle.
L'absence d'un salarié de la nouvelle liste empêche sa **nouvelle
inscription automatique**, sans révoquer rétroactivement un compte
déjà actif. La révocation des droits de compte sera une fonction
distincte à sécuriser avant la production.

### Sécurité du panneau

Le port du VPS est lié **uniquement à `127.0.0.1:8090`**. L'interface
est accessible depuis Windows au moyen d'un tunnel SSH vers le port
local `18090`, et d'un nouveau jeton privé à 64 caractères.
Le jeton est conservé uniquement dans la mémoire de l'onglet :
pas de cookie, pas de localStorage, pas d'URL avec token.
**Ne jamais publier 8090 dans UFW, Docker sur 0.0.0.0 ou Caddy.**

Il s'agit toujours d'une interface de maintenance **provisoire**,
sans comptes superadministrateur individuels ni MFA. En attendant les
contrôles RGPD, notamment le transfert des données sur le VPS au
Canada, **n'importer aucune liste RH réelle**. L'exemple intégré
dans le panneau est uniquement prévisualisable et n'est pas importable
par le bouton de démonstration.

### Installation sur Ubuntu VPS

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

if [ ! -f secrets/roster_db_password ]; then
  (umask 077; openssl rand -hex 32 > secrets/roster_db_password)
fi
if [ ! -f secrets/roster_panel_token ]; then
  (umask 077; openssl rand -hex 32 > secrets/roster_panel_token)
fi
chmod 600 secrets/roster_db_password secrets/roster_panel_token

cp compose.api.yaml compose.api.yaml.backup
cp app/maquette/backend/compose.vps.yaml compose.api.yaml
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build salaries_csv_admin
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml ps
```

La migration doit appliquer `007_roster_manager.sql`. Le conteneur
`salaries_csv_admin` doit être `healthy` et publier seulement
`127.0.0.1:8090->3102/tcp`.

Vérifier les droits et l'écriture fictive annulée :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml exec -T salaries_csv_admin node src/check-roster-setup.js
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml exec -T salaries_csv_admin node src/check-roster-write.js
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/; echo
```

Les deux commandes Node doivent afficher `"status":"ok"`. Le test
d'écriture affiche `"persisted":false`. Le contrôle HTTP donne `200`.

### Tunnel depuis Windows

Dans une **fenêtre PowerShell Windows**, pas dans Ubuntu :

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_cse" -o ExitOnForwardFailure=yes -N -L 127.0.0.1:18090:127.0.0.1:8090 ubuntu@167.114.71.54
```

Dans Firefox, saisir **manuellement** `http://127.0.0.1:18090/`.
Récupérer le jeton dans le terminal Ubuntu (ne jamais le partager) :

```bash
cat /srv/cse-educatif/secrets/roster_panel_token
```

### Avant un véritable import mensuel

Mettre en place une sauvegarde PostgreSQL chiffrée et **testée**,
une procédure de rétention/suppression des anciens CSV, l'authentification
superadministrateur avec MFA et audit nominatif, l'information RH
des salariés et une analyse des transferts de données conformément au
RGPD pour l'hébergement au Canada. Ne jamais déposer les vrais CSV
dans le dépôt GitHub ou dans le dossier public `site/`.


### Réactivation et précautions

Un lot archivé peut être réactivé sur confirmation `ACTIVER`,
avec une mise en garde spécifique. Ceci permet de réutiliser un fichier
mensuel identique, mais il faut impérativement contrôler que les personnes
qu'il contient sont toujours éligibles. Le retour au lot précédent ne
révoque ni n'active aucun compte existant.

Les caractères illisibles introduits par un mauvais encodage sont
rejetés : demander une exportation au format **CSV UTF-8** avant l'import.
Le service conserve seulement les trois champs d'éligibilité ; les
colonnes supplémentaires, si elles existent dans le fichier transmis,
sont ignorées et non stockées.

## Etape 34 — Test complet CSV d'eligibilite, avec un fichier 100 % fictif

Le fichier backend/examples/DEMO_eligibilite_salaries.csv contient :

~~~csv
nom;prenom;numero_etablissement
FICTIFTEST;ALPHA;01
FICTIFTEST;BETA;05
FICTIFTEST;ALPHA;01
~~~

Cela produit 3 lignes, 2 identites distinctes et 1 ligne repetee.
Les codes 01 et 05 correspondent au repertoire existant.
Ne pas utiliser de vrai fichier RH avant la preparation RGPD.

Installer le code et lancer 94 tests :

~~~bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
~~~

Verifier l'etat initial de ce seul lot de demonstration :

~~~bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/demo-roster-cli.js check
~~~

Le statut not_found signifie qu'il n'existe pas encore en base.
Dans le panneau prive CSV http://127.0.0.1:18090/ (tunnel SSH),
charger le fichier de demonstration depuis l'ordinateur Windows.
Cliquer Previsualiser puis Importer ce fichier en attente.
Le lot reste staged et ne remplace pas le lot actuellement actif.

Relancer ensuite la commande check : elle doit indiquer demo_found
et importStatus:staged. L'activation est une etape separee a confirmer.

Ne pas activer la liste fictive si une liste reelle est deja active.
Apres tout essai d'activation, il faut nettoyer le lot fictif.

Commande de nettoyage protectrice :

~~~bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/demo-roster-cli.js cleanup --confirm-demo-cleanup
~~~

Le programme refuse de supprimer le lot si son empreinte, son nombre
de lignes ou une valeur des trois lignes differe du CSV fictif GitHub,
ou si un compte/dossier y fait reference. Il refuse aussi de supprimer
un lot de demo actif lorsqu'un autre lot archive existe : retablir
d'abord le lot d'eligibilite correct. Les traces d'audit sont conservees.

N'importer aucune donnee RH reelle tant que la securite, les sauvegardes
et la conformite RGPD du traitement au Canada ne sont pas finalisees.


## Étape 40 — Vérifier réellement l'éligibilité avec PostgreSQL, sans rien stocker

Après le nettoyage de la démonstration CSV, le nouveau script
`src/check-eligibility-e2e.js` vérifie **la vraie requête SQL**
d'inscription avec trois identités fictives dans une transaction.

Il couvre 6 situations :

- aucun CSV actif : revue manuelle ;
- une correspondance unique : éligibilité provisoire ;
- identités identiques (même nom, prénom, établissement) : revue manuelle ;
- identité absente du CSV : revue manuelle ;
- bon nom dans un autre établissement : revue manuelle ;
- établissement inconnu : revue manuelle.

Le script **refuse toute opération si une liste CSV est déjà active**.
Il utilise le même verrou PostgreSQL que l'administration des CSV pour
éviter de perturber une activation concurrente. Toutes ses écritures
sont annulées par `ROLLBACK`, y compris en cas d'erreur, et l'absence
du lot fictif est vérifiée après l'annulation. Aucun compte salarié,
mot de passe, email ni dossier d'inscription n'est créé.

### Exécution dans Ubuntu sur le VPS

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/check-eligibility-e2e.js
```

Résultat attendu des tests : **101 tests réussis, zéro échec**.
Le test réel doit renvoyer `"status":"ok"`, avec
`"testedAgainst":"postgresql_real"`,
`"rolledBack":true` et `"demoRosterPersisted":false`.

Pour mémoire : ce contrôle est un **test de logique interne** et
non l'ouverture des inscriptions sur le domaine public. Le parcours
de production exige encore vérification du propriétaire de l'email,
comptes sécurisés, authentification administrateur individuelle/MFA,
envoi SMTP, sauvegardes restaurables et conformité RGPD pour les données
hébergées au Canada.


## Étape 41 — Vérification de l'adresse email (préparation privée)

Cette étape prépare les jetons de confirmation sans encore ouvrir le parcours
d'inscription et sans expédier d'emails.

**Fonctionnement prévu** : après une demande d'inscription, un service
d'envoi SMTP autorisé générera un lien temporaire et l'enverra à
l'adresse saisie par le salarié. Le jeton devra être présenté une seule
fois pour prouver que l'adresse est accessible par le demandeur.

### Protections ajoutées

- Migration `008_email_verification.sql` : nouvelle table
  `cse.registration_email_challenges`.
- Jeton aléatoire cryptographiquement sûr : **32 octets / 256 bits**,
  transmis comme 64 caractères hexadécimaux.
- Stockage SQL : **empreinte SHA-256 seulement**, aucun jeton brut.
- Expiration **30 minutes** après l'émission.
- Un jeton ne peut être validé qu'une fois ; une seconde utilisation
  ou un jeton expiré est refusé.
- Une demande rejetée, annulée ou expirée ne peut pas être vérifiée.
- Le service est autorisé à modifier uniquement
  `email_verified_at` et `consumed_at`, pas l'email, le statut
  administratif, les listes RH ni les comptes salariés.
- Journal d'audit limité, sans jeton et sans adresse email.
- Aucun mot de passe, compte actif ou email envoyé dans cette étape.

Le rôle SQL `cse_email_verifier` dispose d'un **secret dédié**
conservé sur le VPS. Le test de validation utilise les droits de
ce rôle, avec `SET LOCAL ROLE` à l'intérieur d'une transaction
PostgreSQL. Le test utilise des coordonnées fictives
`@example.invalid`, exécute un `ROLLBACK` et contrôle que les
données de démonstration n'ont pas été conservées.

**Le moteur ne publie aucune nouvelle route HTTP et ne contient
aucune fonction SMTP.** L'envoi de mails et la confirmation par clic
seront raccordés après avoir sécurisé la délivrabilité et
l'authentification, avec un dispositif anti-abus et une
gestion sécurisée du renouvellement des liens.

### Installation sur Ubuntu VPS

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

if [ ! -f secrets/email_verifier_db_password ]; then
  (umask 077; openssl rand -hex 32 > secrets/email_verifier_db_password)
fi
chmod 600 secrets/email_verifier_db_password

cp compose.api.yaml compose.api.yaml.backup
cp app/maquette/backend/compose.vps.yaml compose.api.yaml
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api migrate
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/check-email-verification-e2e.js
```

Le test Node doit montrer **115 tests réussis, zéro échec**.
La migration doit afficher `008_email_verification.sql`.
Le test d'intégration doit afficher `"status":"ok"`, ainsi que
`"firstUse":"verified"`, `"replay":"invalid_or_expired"`,
`"expiredToken":"invalid_or_expired"`,
`"originalTokenStored":false`, `"rolledBack":true`,
`"accountsCreated":false` et `"emailsSent":false`.

Ne pas ajouter le rôle email à l'API ou à Caddy pour le moment.
Ne pas importer de véritables données RH tant que les mesures
de conformité au RGPD, les sauvegardes testées et les procédures
d'information et d'accès aux données du VPS au Canada ne sont
pas achevées.


## Étape 42 — Modèles de messages email avant activation de la messagerie

Des gabarits HTML et texte brut sont préparés dans
`src/email-templates.js`, **sans envoi SMTP, sans connexion à un
compte email et sans ouverture publique du parcours**.

Modèles disponibles :

- Demande de confirmation de l'adresse email (lien à usage unique, 30 minutes).
- Accusé de réception d'une demande (sans promesse d'activation).
- Notification à l'équipe administrative qu'un dossier nécessite une revue
  (aucun nom, prénom ni adresse email du salarié dans ce message).
- Décision favorable de revue (sans compte déjà actif).
- Décision défavorable de revue.

Le lien de confirmation est préparé sous la forme
`https://cse-educatif-rxtg.fr/verification-email#jeton=...`.
Le jeton est placé dans le **fragment** pour éviter de le transmettre
au serveur lors de la première requête de navigation. Une future
page devra le récupérer, l'effacer immédiatement de l'adresse du
navigateur et le transmettre par POST sécurisé, sans analytique,
sans log de jeton et sans service tiers.

**La page /verification-email et l'endpoint HTTP de vérification ne
sont pas encore déployés. Ne pas envoyer ces modèles aux salariés
avant leur mise en service, le paramétrage SMTP et les tests de bout
en bout.** Aucune donnée réelle ne doit être utilisée.

### Vérification hors ligne sur le VPS

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api node src/check-email-templates.js
```

Tests automatisés attendus : **127 réussis, aucun échec**.
Dernière commande : `status:ok`, `templatesPrepared:5`,
`smtpConfigured:false`, `verificationWebPagePublished:false`,
`emailsSent:false`. Ces vérifications ne modifient pas PostgreSQL.

### Avant la configuration SMTP OVHcloud

Vérifier dans l'espace client OVHcloud si une **boîte de messagerie
effective** existe pour le domaine (MX Plan, Email Pro ou autre).
La seule possession du nom de domaine et du VPS ne garantit pas
l'existence d'une boîte email. Le serveur SMTP, les ports TLS,
l'authentification, les plafonds d'envoi et SPF/DKIM/DMARC dépendent
du produit de messagerie réellement utilisé.

Ne jamais placer des mots de passe email ou des jetons dans GitHub,
les captures d'écran ou la conversation. Les identifiants SMTP
devront rester dans des secrets privés du VPS. Ne pas modifier les
enregistrements MX du domaine tant que l'offre et les besoins de
réception ne sont pas clarifiés.

La mise en route du SMTP devra être suivie d'un essai avec une
adresse de test autorisée, du contrôle de la délivrabilité et d'un
mécanisme anti-abus et de limitation des envois.


## Étape 43 — DMARC et premier email SMTP sur OVHcloud

Le DNS du domaine `cse-educatif-rxtg.fr` a ses enregistrements MX,
SPF et DKIM (activation par OVHcloud), tandis que la requête
`_dmarc.cse-educatif-rxtg.fr` ne renvoyait pas encore de TXT.

Créer, **une seule fois**, un enregistrement TXT dans la zone DNS OVHcloud :

- Sous-domaine : `_dmarc`
- Type : `TXT`
- Valeur : `v=DMARC1; p=none`
- TTL : par défaut

Ne pas créer une deuxième entrée DMARC si elle existe déjà.
La politique `p=none` ne demande pas le rejet des emails, mais
permet de démarrer l'évaluation DMARC. Une phase de contrôle
SPF/DKIM doit précéder toute politique plus restrictive.
Aucune modification des enregistrements MX/SPF/A existants.

Sur Windows, vérifier la propagation DNS :

```powershell
Resolve-DnsName _dmarc.cse-educatif-rxtg.fr -Type TXT
```

### Test d'authentification et d'envoi SMTP sur le VPS

Le fichier `backend/tools/smtp_selftest.py` réalise un **unique test
SMTP_SSL (465) avec vérification TLS** depuis le VPS vers
`contact@cse-educatif-rxtg.fr`, adressé **à cette même boîte**.
Il utilise uniquement la bibliothèque standard Python, sans compte
salarié, sans authentification de l'application et sans jeton de lien.

Copier le code à jour depuis GitHub, puis dans Ubuntu :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only
read -r -s -p 'Mot de passe de contact@cse-educatif-rxtg.fr : ' SMTP_PASSWORD
printf '\n'
(umask 077; printf '%s' "$SMTP_PASSWORD" > secrets/smtp_password)
unset SMTP_PASSWORD
chmod 600 secrets/smtp_password
python3 app/maquette/backend/tools/smtp_selftest.py
```

**NE JAMAIS copier le mot de passe SMTP dans ce chat, dans GitHub,
dans une capture, dans un argument de commande ni dans un fichier public.**
Le mot de passe est saisi sans affichage et conservé en permissions
`600` hors du dépôt, dans `/srv/cse-educatif/secrets/smtp_password`.
Le test ne transmet le mot de passe qu'au serveur SMTP authentifié via
TLS. Aucun port entrant supplémentaire sur le VPS.

La sortie `OK : email de test remis au serveur SMTP OVHcloud.`
signifie uniquement que le serveur SMTP l'a accepté. Il faut ensuite
contrôler la réception dans le webmail OVHcloud, et vérifier dans
l'en-tête du message reçu les résultats SPF/DKIM/DMARC si visibles.

**Ce script n'active aucune automatisation d'envoi.** Avant production :
gestion des secrets applicatifs, limitation des envois et des abus,
raccordement fiable de la vérification email au flux d'inscription,
gestion des rebonds et des reprises, sauvegardes et conformité RGPD,
notamment pour l'hébergement des données au Canada.


## Etape 51 — Connecteur SMTP Node.js (mode essai uniquement)

Le test SMTP historique Python a confirme que le serveur
`smtp.mail.ovh.net:465` accepte des messages depuis le VPS vers la
boite `contact@cse-educatif-rxtg.fr`.

L'application Node.js dispose maintenant d'un transport Nodemailer
(version `10.3.1`, testee avec Node 26) :

- `src/email-smtp.js` : port 465, TLS obligatoire (minimum TLS 1.2),
  certificat verifie, pas de logs SMTP et destinataire impose a
  `contact@cse-educatif-rxtg.fr` pour le test ;
- `src/send-email-selftest.js` : envoie **un unique message technique**
  vers la boite CSE elle-meme, sans inscription, utilisateur ou CSV ;
- `test/email-smtp.test.js` : controles sans aucune connexion SMTP ;
- service Compose `mailer_test` : **profil Docker manuel**
  `manual-mail-test`, aucune connexion base, aucun port expose,
  reseau sortant bridge dedie, aucun redemarrage automatique.

Le role SQL `cse_email_verifier` reste distinct et n'est pas
attribue a ce service. **La file `cse.email_outbox` n'est pas consommee,
aucun email ne part automatiquement aux salaries.**

### Installer et tester sur le VPS

Dans Ubuntu :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

# Le secret SMTP du test Python precedent existe deja.
stat -c '%U %a %n' secrets/smtp_password

cp compose.api.yaml compose.api.yaml.backup
cp app/maquette/backend/compose.vps.yaml compose.api.yaml
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml config --quiet

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test
```

Nombre attendu après ajout des 7 nouveaux tests : **134 réussis**
(sur la base des 127 tests existants).

Après ces vérifications, lancer **une seule fois** le test SMTP :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml --profile manual-mail-test run --rm --no-deps mailer_test
```

Le message doit afficher `accepted_by_smtp`, avec
`automatedSending:false` et `emailsToEmployees:0`. Vérifier
ensuite dans le webmail OVHcloud la réception du message intitulé
`CSE Educatif - test du moteur SMTP de l'application`.

L'acceptation par le serveur ne garantit pas à elle seule la
délivrabilité externe. Pour celle-ci, contrôler les en-têtes
SPF / DKIM / DMARC d'un message de test destiné à une boîte externe
autorisée. Le DKIM est déclaré actif chez OVHcloud, et DMARC est
publié en DNS avec `v=DMARC1; p=none`.

**Ne jamais copier `secrets/smtp_password` dans GitHub ou dans ce chat.**
Ce test manuel ne publie aucun port ni endpoint ; il ne remplace pas
les contrôles de sécurité indispensables au service d'envoi automatisé.


## Étape 52 — Notifications des décisions (file d'attente, aucun envoi)

Le test SMTP Node.js -> OVHcloud -> boîte CSE a été reçu avec succès.
Ce résultat vérifie le transport, pas encore la sécurité ou la
délivrabilité des notifications aux salariés.

La migration `009_decision_notifications.sql` complète la table
`cse.email_outbox` avec deux modèles :
`registration_approved` et `registration_rejected`.

Quand un administrateur enregistre une approbation ou un refus
depuis le panneau privé des inscriptions, la même transaction SQL :

- met à jour le statut du dossier ;
- ajoute une notification de décision avec `recipient_email = NULL`
  et le statut par défaut `not_configured` ;
- ajoute un événement d'audit.

Si une des étapes échoue, toute la transaction est annulée.
Le rôle `cse_registration_reviewer` ne peut qu'insérer ces événements,
sans lire les autres emails ni déclencher un envoi. Une nouvelle
décision sur un dossier déjà traité est refusée. Le panneau affiche
que la notification est **préparée, pas envoyée**.

Le futur service de distribution devra d'abord résoudre la bonne
adresse **vérifiée** à partir du dossier, contrôler les permissions
et les préférences légitimes, puis expédier le message avec reprise,
limitation de débit et audit. Aucun service de distribution automatique
n'est installé ni activé à cette étape.

### Mise à jour du VPS

Dans Ubuntu :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api migrate

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --build migrate
```

Nombre attendu : **141 tests réussis, zéro échec**.
La migration doit afficher `009_decision_notifications.sql`.

Tester ensuite avec deux identités entièrement fictives (sans
enregistrer de demande ni expédier d'email) :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/check-notifications-e2e.js
```

La réponse doit contenir `"status":"ok"`,
`"outboxEntriesCreated":2`, `"deliveryStatus":"not_configured"`,
`"recipientAddressesStored":false`, `"rolledBack":true` et
`"emailsSent":false`.

Pour faire prendre en compte la nouvelle logique dans le panneau privé
des inscriptions, reconstruire uniquement ce service :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build inscriptions_admin
```

### Contrôle sans données nominatives

Le script suivant, exécuté uniquement depuis le VPS via SSH, affiche
les totaux des messages préparés par audience, modèle et statut, sans
nom, adresse ou jeton :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/preview-notifications.js
```

La liste peut être vide : les dossiers de démonstration précédents ont
été nettoyés, et le test E2E utilise `ROLLBACK`.

**Ne pas activer les emails aux salariés pour l'instant.**
Les inscriptions ne sont toujours pas ouvertes au public, et les
protections nécessaires restent à réaliser : compte administrateur
individuel et MFA, vérification email complète, données RH importées
dans des conditions RGPD adaptées à l'hébergement canadien,
limitation anti-abus, sauvegardes restaurables, délivrabilité, reprise
des notifications, politique de rétention et effacement.


## Étape 54 — Contrôle des préconditions de notification (sans aucun envoi)

À l'issue de l'étape 53, le panneau `inscriptions_admin` est
`healthy` et `preview-notifications.js` affiche une file vide.
Le transport SMTP Node.js a été accepté par OVHcloud et le message
de test a été reçu dans la boîte CSE.

Pour préparer les protections du futur distributeur, un diagnostic
**en lecture seule** est disponible :

- `src/inspect-decision-readiness.js` : rapport **agrégé uniquement** ;
- `test/inspect-decision-readiness.test.js` : 5 tests sans base ni SMTP ;
- `src/check-decision-readiness-e2e.js` : 5 demandes et
  notifications **entièrement fictives**, annulées avec `ROLLBACK`.

Pour les modèles `registration_approved` et
`registration_rejected`, le contrôle signale :

- statut de livraison autre que `not_configured` ;
- audience différente de `employee`, ou destinataire déjà renseigné ;
- email non vérifié ;
- inscription expirée ;
- incohérence entre le statut de la demande et le modèle ;
- conditions réunies pour une **étape future** :
  `conditions_met_sending_disabled`.

Les autres modèles sont classés `template_outside_scope` (non
évalués à cette étape). **Même si toutes les conditions sont réunies,
aucun email n'est émis**. La fonction est un diagnostic, et le futur
distributeur devra appliquer les mêmes contrôles avant de résoudre
l'adresse vérifiée et d'envoyer un message. Elle n'ajoute aucune
permission SQL, n'ouvre aucune route HTTP, ne fait pas intervenir
Nodemailer et ne publie aucune donnée nominative.

### Déploiement limité aux tests du VPS

Dans le terminal Ubuntu :

```bash
cd /srv/cse-educatif
git -C app/maquette pull --ff-only

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml build api migrate

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps api npm test

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/check-decision-readiness-e2e.js

sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml run --rm --no-deps migrate node src/inspect-decision-readiness.js
```

Aucune migration SQL supplémentaire ni redémarrage du panneau
administratif n'est nécessaire pour ce diagnostic.

Le test PostgreSQL doit afficher `"status":"ok"`,
`"scenariosChecked":5`, `"rolledBack":true`,
`"persisted":false`, `"smtpInvoked":false` et
`"emailsSent":false`.
L'inspection finale peut afficher `"conditions":[]` tant qu'aucune
notification persistante n'a été préparée.

**La page publique de confirmation d'email et le service de
distribution des emails ne sont toujours pas déployés.**
Le site public et les inscriptions publiques restent fermés.
