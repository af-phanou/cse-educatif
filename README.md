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

## Catalogue remanié — V18

Le catalogue suit désormais le modèle **Catégorie → Produit principal → Déclinaisons**. Exemple : catégorie « Cinéma », produit « Kinépolis » avec une image, et déclinaisons « Voucher individuel », « Carte 5 entrées », « Carte 8 entrées ». Ne pas confondre le produit avec ses déclinaisons : chaque variante a son propre prix public, prix CSE, stock, option illimité et indicateur « Délai fournisseur plus important ».

Dans **Administration → Catalogue** : créer d'abord les catégories, puis ouvrir « Nouveau produit », renseigner nom, catégorie, description et image, puis ajouter des déclinaisons. Enregistrer pour afficher ce catalogue dans le site public et l'espace salarié. Le logo et le design officiels d'un fournisseur ne sont pas repris ; une image peut être ajoutée par l'administrateur.

Le catalogue est enregistré dans `cse_fusion_v18_catalogue`, avec un export aplati compatible avec la maquette historique via `cse_fusion_v9_catalogue`. Les images sont redimensionnées localement avant enregistrement. Le stockage reste limité au navigateur et **ne constitue ni un hébergement d'images ni une base partagée de production**. La maquette doit être testée dans le navigateur ; aucune commande ou facture réelle n'est générée.

Fichiers : `catalogue-v18.js` (données communes), `catalogue-admin-v18.js` (édition), `catalogue-public-v18.js` (boutique), `catalogue-v18.css` (présentation).

## Correction « Nos offres à la une » — V19

Dans **Administration → Pages du site → Accueil**, sélectionnez le bloc **Produits mis en avant**. Le panneau de droite propose désormais la liste des véritables produits du catalogue V18 avec une case à cocher pour chacun (maximum 8). L'aperçu du bloc affiche leurs images, catégories, prix publics barrés et tarifs CSE. Le bloc et la page publique reprennent les produits cochés, dans la limite du nombre choisi (2, 4, 6 ou 8) et en deux colonnes sur ordinateur.

Les choix sont enregistrés immédiatement dans le catalogue local. Cliquez également sur « Enregistrer la page » pour enregistrer les blocs du CMS. Si aucun produit n'est coché, une consigne explicite apparaît à la place d'un bloc vide.

## Thèmes saisonniers du site public — V20

Dans **Administration → Pages du site**, un panneau « Thème du site public » permet de sélectionner **un seul thème à la fois** parmi : Aucun thème, Noël, Halloween, Printemps, Été, Automne, Hiver et Saint-Valentin.

Chaque choix dispose d'un aperçu et d'une option **Activer les petites animations décoratives** : flocons, citrouilles, pétales, soleil, feuilles ou cœurs selon la saison. Les animations sont décoratives (ne bloquent jamais les clics), réduites sur mobile et complètement désactivées si le système de l'utilisateur demande une **réduction des mouvements**.

Après choix, cliquer sur **Appliquer au site public**. Le paramètre est enregistré sous `cse_fusion_v20_seasonal_theme` dans le stockage local du navigateur et récupéré par le site public via les deux fichiers `seasonal-themes-v20.js` et `seasonal-public-v20.js`. Le panneau admin se trouve dans `seasonal-admin-v20.js`. Le style est dans `seasonal-themes-v20.css`.

**Limites :** ce réglage concerne la maquette locale et n'est pas encore synchronisé entre les différents ordinateurs, ni automatiquement activé selon le calendrier. Le bleu et blanc du logo restent inchangés.

## Éditions festives fortes — V23

Les thèmes Noël et Halloween disposent désormais d'une véritable identité graphique temporaire sur **le site public** :

- **Noël** : rouge profond et vert sapin, bordures dorées, grande bannière festive, sapin, cadeaux, boules et étoiles SVG, neige et petites animations.
- **Halloween** : orange lumineux, fond violet-noir, bandeau saisonnier, illustrations SVG de citrouille, fantôme et chauves-souris, particules animées.
- Les couleurs s'appliquent au header, à la navigation, à l'accueil, aux boutons, aux cartes produits et au catalogue ; prix et parcours de commande restent inchangés.
- Les éléments décoratifs ne bloquent pas les interactions. Les animations sont supprimées pour `prefers-reduced-motion: reduce` et peuvent être désactivées dans **Administration → Thèmes du site**.
- Les autres thèmes saisonniers restent tels qu'ils existaient en V20.

Fichiers : `seasonal-festive-v23.css` et `seasonal-festive-v23.js`. Le choix du thème reste stocké sous `cse_fusion_v20_seasonal_theme` et se fait dans **Administration → Pages du site / Thèmes du site**. Les tests de syntaxe ont été effectués, pas encore la recette visuelle complète dans un navigateur.

## Refonte graphique des thèmes — V24

La V24 **remplace intégralement les dessins de la V23** par deux directions visuelles plus professionnelles :

- **Noël premium** : fond rouge profond et vert sapin, touches dorées, bokeh, couronnes lumineuses et rameaux botaniques en tracés fins, chute de très petits flocons.
- **Halloween dark chic** : nuances aubergine, violet nuit, orange cuivre, lueur de lune, brume délicate, silhouettes de chauves-souris et détails de toile en filigrane, particules ambre légères.

Les fonds, le bandeau d'accueil, les boutons, la navigation et les cartes produits s'adaptent ; les données de la boutique ne changent pas. Les anciens dessins/citrouilles et sapins cartoon de V23 ne sont plus chargés.

Fichiers : `seasonal-premium-v24.css` et `seasonal-premium-v24.js`. Le sélecteur dans **Administration → Thèmes du site** conserve son fonctionnement : choisir le thème puis **Appliquer au site public**. Désactiver les animations avec la case du panneau. Les préférences système de réduction des mouvements sont respectées ; les éléments décoratifs ne capturent pas les clics.

**Limites** : la V24 est une maquette HTML avec stockage de thème dans le navigateur. La syntaxe JavaScript a été vérifiée, mais la recette visuelle et responsive exhaustive sur navigateur reste à effectuer.

## Refonte de la boutique et des fiches produits — V25

Le site public et l'espace salarié disposent d'une présentation de boutique entièrement renouvelée :

- En-tête de boutique, catégories à gauche, recherche par produit, enseigne ou déclinaison, tri par nom ou prix.
- Cartes produits modernes avec grande image, catégorie, présentation, choix de la déclinaison, **prix public barré**, tarif CSE, taux de remise, disponibilité et signalement du délai fournisseur prolongé.
- Bouton **Voir la fiche** ouvrant une véritable fiche produit détaillée, avec photo/illustration, description, liste déroulante des déclinaisons, prix, économie, stock, quantité et ajout au panier.
- Blocs « Nos offres à la une » actualisés dans la présentation du site, en conservant la limite de huit produits sur deux colonnes.
- Photos issues directement du champ image dans l'administration du catalogue V18. Si aucune photo n'a été ajoutée, une **illustration générique clairement présentée comme telle** est utilisée pour la maquette.
- Responsive sur ordinateur, tablette et téléphone ; compatibilité avec les habillages Noël et Halloween V24.

Fichiers : `boutique-v25.css` et `boutique-v25.js`, chargés par `CSE_Educatif_Site_Espace_Salarie_Fusion_V9.html`. La navigation entre site public, salarié et administration est conservée via `index.html`.

**Tests** : syntaxe JavaScript vérifiée. Un test de fonctionnement ciblé a confirmé le rendu du catalogue et de la fiche produit, le changement de déclinaison, la quantité ajoutée au panier et le filtrage. L'ensemble des parcours visuels et responsive n'a pas encore fait l'objet d'une recette complète. Les commandes et règlements restent simulés localement.

## Billetterie PDF : import, attribution et classement Libres / Vendu — V26

La maquette contient maintenant un espace **Administration → Billetterie** fonctionnel pour les tests :

1. Sélectionner une catégorie (Cinéma, Parcs d'attractions, etc.) puis un fournisseur (par exemple « Cinéma Lumière »).
2. Importer un ou plusieurs PDF depuis son ordinateur (glisser-déposer ou bouton **Importer des billets PDF**). Chaque original est ajouté au dossier **Libres** du fournisseur. Les doublons de nom sont refusés pour ce fournisseur.
3. Sélectionner une **commande de démonstration** correspondant au fournisseur. Les commandes intégralement payées sont autorisées ; un règlement non validé exige une action de forçage administrateur et une confirmation explicite.
4. Cliquer sur **Attribuer les billets** : l'application choisit autant de PDF libres que la quantité demandée, met à jour leur enregistrement, renomme leur *nom de téléchargement* sous la forme `Prenom_Nom_nom-original.pdf` et les affiche dans **Vendu**. La transaction IndexedDB protège contre une double attribution du même billet. Chaque attribution mémorise le salarié, la commande, la facture et la date.
5. Dans **Espace salarié → Mes billets**, le bénéficiaire voit sa liste avec les PDF à télécharger. Le salarié de démonstration préchargé est **Claire Leroy** ; pour le tester, utilisez la commande fictive payée **CMD-27005** chez **Cinéma Lumière**.

Un paquet de **10 PDF fictifs avec QR codes uniques** a été fourni dans la conversation (six `cinema_001.pdf` à `cinema_006.pdf`, quatre `parc_001.pdf` à `parc_004.pdf`). Les QR sont des codes de test **non valables**. Il faut décompresser le paquet avant l'import des fichiers.

### Important : fonctionnement de démonstration et production

La maquette GitHub Pages est un site statique. Les PDF importés sont **enregistrés uniquement dans IndexedDB du navigateur**, PAS sur GitHub, Dropbox ni OVH. Le dossier **Vendu** et le renommage sont simulés au niveau du stockage local : ils **ne modifient pas les fichiers originaux sur le disque de l'administrateur**. En revanche, le téléchargement du billet vendu utilise le nouveau nom.

Pour la future application OVH, un service sécurisé stockera réellement les fichiers sous `Billetterie/<Catégorie>/<Fournisseur>/Libres/`, puis exécutera un renommage et un déplacement atomique vers `.../Vendu/` avec contrôle de stock, traçabilité, réservation transactionnelle et accès restreint. Si Dropbox est retenu, on utilisera son API autorisée ; sinon un stockage privé sur OVH convient. Seul le salarié concerné devra pouvoir télécharger son billet via une URL authentifiée, et les emails avec billet ne partiront qu'après validation du paiement ou dérogation autorisée. **La V26 n'envoie pas d'emails réels** et ne remplace pas les contrôles serveur d'authentification, de paiement et d'accès.

Fichiers : `billetterie-v26-stockage.js`, `billetterie-v26-admin.js`, `billetterie-v26-salarie.js`, `billetterie-v26.css`.

## V28 — Commande de billet reliée au stock PDF

Préparation : dans Administration > Billetterie, relier chaque produit à son fournisseur de PDF. Importer les billets dans Libres, en précisant si besoin la déclinaison. Les associations Kinépolis/Cinéma Lumière et Parc partenaire/Parc Aventure sont des exemples fictifs à adapter.

À la commande sur le site salarié, le moteur cherche automatiquement les PDF disponibles dans le fournisseur correspondant et les place atomiquement dans Réservés, sans possibilité de double attribution. Si le stock est insuffisant, l'achat est refusé avant enregistrement. Une fois le paiement confirmé (simulation sur GitHub), le mode automatique peut attribuer le billet ou un administrateur valide manuellement ; les PDF sont alors renommés Prenom_Nom_original.pdf et passés dans Vendu. Le salarié les retrouve dans Mes billets. Une annulation avant livraison restitue les PDF et leur déclinaison d'origine dans Libres.

Emails : cinq modèles de messages sélectionnables ; bouton d'export d'un brouillon .eml contenant les PDF délivrés. L'administrateur doit ouvrir ce fichier dans sa messagerie et l'envoyer manuellement. Le mode automatique marque uniquement un envoi SIMULÉ. Aucun email réel n'est envoyé sur GitHub Pages.

Fichiers ajoutés : billetterie-v28-commandes.js, billetterie-v28-site.js, billetterie-v28-admin.js et billetterie-v28.css. Stockage PDF IndexedDB local et commandes dans localStorage. Un serveur OVH sera nécessaire pour sécuriser les paiements, authentifier les utilisateurs, stocker les PDF sur le serveur, envoyer les emails réels et gérer une expiration des réservations impayées. Le code PIN de démonstration n'est pas une protection de production.
