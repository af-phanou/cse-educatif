# CSE Éducatif — Maquette intégrée V12

Prototype interactif du **site public**, de l'**espace salarié** et de l'**administration**.

## Démarrage

Ouvrir `index.html` dans un navigateur via un petit serveur local (par exemple `python -m http.server 8000`, puis `http://localhost:8000/`).

- **Site public / Espace salarié** : accueil et catalogue, accès à l'espace personnel, panier, commandes, billets et factures simulées.
- **Administration** : gestion des pages, création de produits, catégories, fournisseurs, prix publics et prix CSE, stocks et option « délai fournisseur plus important ».
- **Catalogue** : démonstration de la boutique par catégories → fournisseurs → variantes de produits.

## Liaison entre les interfaces

Les deux vues utilisent le même domaine et le `localStorage` du navigateur :

- `cse_fusion_v9_catalogue` : produits et catégories. Les nouveautés **fournisseur**, **mise en avant sur l'accueil** et **délai prolongé** sont disponibles dans la fiche produit admin.
- `cse_fusion_v12_pages` : pages et blocs du CMS, enregistrés via **Enregistrer la page**. Après modification, le site public affiche les contenus publiés et le bloc « Produits mis en avant » (au maximum 8 produits en deux colonnes).
- En ouvrant le site et l'admin à travers `index.html`, les vues peuvent se synchroniser via les événements de stockage du navigateur. Recharger une vue si nécessaire.

**Test recommandé :** Administration → Catalogue → éditer un produit, renseigner le fournisseur, cocher « Mettre en avant » ; puis Administration → Pages du site → Accueil → Enregistrer la page ; enfin Site public → Accueil / Boutique.

## Limites

C'est une **maquette**, non une application de production. Aucun paiement, email, PDF réel ni authentification sécurisée. Le stockage est **local au navigateur**, pas une base de données partagée entre utilisateurs ou appareils. Les commandes et comptes restent simulés et ne constituent pas une synchronisation métier complète entre les interfaces.

## Identité graphique

Bleu `#1278CC`, bleu marine `#0F2660`, blanc, conformément aux orientations validées pour la maquette CSE.

## Validation des commandes — V13

Dans **Administration → Commandes** : sélection des commandes via cases à cocher, validation groupée après confirmation, et interrupteur « Validation automatique des commandes payées ». Les commandes non payées et déjà validées ne sont pas éligibles à la validation groupée. Les commandes avec plus d'une facture échue non réglée restent bloquées, et les billets doivent être disponibles pour leur attribution.

**Attention** : l'automatisation est une **simulation JavaScript locale**. Elle fonctionne uniquement pendant l'utilisation de la maquette, y compris lors de l'ouverture de la page Commandes ou d'une modification de paiement locale ; elle **ne fonctionne pas en arrière-plan pendant les congés**. Pour le site définitif, ce mode nécessitera un service côté serveur et une confirmation fiable du paiement (webhook / rapprochement), avec traçabilité, envois réels et contrôle des stocks.

## Code PIN du mode automatique — V14

Le changement d'état de la case **Validation automatique des commandes payées** (activation et désactivation) demande un **code PIN de 4 chiffres**. Pour la maquette uniquement, le code est **2027**. Un code incorrect ou une annulation laisse le mode inchangé.

**Ce PIN est visible dans le code JavaScript et ne sécurise pas une vraie application.** En production, contrôle côté serveur réservé au superadministrateur, hachage du secret, limitation des tentatives et journal d'audit sont nécessaires. Cette maquette n'effectue aucune validation de commande en arrière-plan.

## Suivi des bénéficiaires des codes (V16)

**Administration → Codes de réduction → Suivi des utilisations** affiche la date, le code, le nom du salarié, l'établissement, la commande, la facture, la remise et le statut « Appliquée » ou « Validée ». Recherche, filtrage par lot et export CSV. La validation individuelle ou groupée met à jour le statut si une utilisation a été enregistrée.

**Limite de la maquette :** le suivi concerne les codes appliqués depuis l'administration de démonstration. Les anciennes utilisations déjà comptabilisées n'ont pas forcément d'identité rattachée, et la boutique salariée n'est pas encore raccordée à ce registre. En production : enregistrement transactionnel de l'utilisation à la validation de commande, identification fiable du salarié, prévention de la double utilisation et accès limité au superadministrateur.
