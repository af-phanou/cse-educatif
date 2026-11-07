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
