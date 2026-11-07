# Backend CSE Éducatif — socle privé V1

Ce dossier marque le début de la migration de la maquette statique vers une
application serveur. Il ne constitue **pas** une version de production.

## Contenu livré

- API Node.js (version 26) et pilote PostgreSQL (pg).
- GET /healthz : vérifie que le processus répond.
- GET /readyz : vérifie la connexion à PostgreSQL.
- Aucune interface d'administration ni route de données salariés accessible.
- Aucun port d'API publié sur l'hôte ; réseau Docker privé requis.

## Configuration Docker Compose recommandée

Depuis le dossier /srv/cse-educatif du VPS (où compose.yaml configure déjà la
base et compose.override.yaml configure Caddy), créer un fichier
compose.api.yaml avec le service suivant :

```yaml
services:
  api:
    build:
      context: ./app/maquette/backend
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      PORT: "3000"
      DB_HOST: db
      DB_PORT: "5432"
      DB_NAME: cse_educatif
      DB_USER: cse_dbadmin
      DB_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password
    networks:
      - cse_private
```

Le mot de passe est lu depuis le secret local déjà utilisé par PostgreSQL ;
**ne jamais commiter de vrai secret**. Le fichier source est protégé (mode 600)
sur le VPS. Le conteneur tourne en utilisateur « node » (UID 1000), qui doit
avoir le droit de lire ce fichier monté par Docker Compose.

Démarrer en incluant les trois fichiers Compose :

```bash
sudo docker compose -f compose.yaml -f compose.override.yaml -f compose.api.yaml up -d --build api
```

## Limitations / suite indispensable

- Le compte DB actuellement utilisé pour la seule sonde de santé est un compte
  d'administration. **Créer un rôle SQL applicatif limité** avant les
  fonctionnalités métiers.
- Ajouter migrations SQL, authentification/permissions, journalisation d'audit,
  validation de formulaires, anti-abus, email, PDF privés, sauvegardes testées.
- Ne jamais importer un vrai CSV RH tant que ces contrôles ne sont pas en place.
- La maquette GitHub Pages continue de fonctionner localement via localStorage
  et IndexedDB : elle n'est pas reliée à cette API.
