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
