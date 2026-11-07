/* CSE Educatif — Boutique V25 : catalogue editorial, fiches produit et variantes.
 * Les données et les photos viennent du catalogue administratif V18.
 * Aucun paiement, livraison ni e-mail réel. */
(function () {
  "use strict";
  if (!window.CSECatalog || typeof catalog !== "function") return;
  const esc = CSECatalog.esc, eur = CSECatalog.money;
  let selectedCategory = "Toutes", searchText = "", sortBy = "featured";
  let detailId = null, detailQuantity = 1;
  const variantByProduct = {};
  const idArg = value => JSON.stringify(String(value)).replace(/"/g, "&quot;");
  const catalogueData = () => CSECatalog.load().products || [];
  const getProduct = id => catalogueData().find(x => String(x.id) === String(id));
  const validVariants = p => (p?.variants || []).filter(v => v && v.id !== undefined);
  const cheapest = p => {
    const list = validVariants(p);
    return list.length ? list.reduce((a, b) => Number(b.cse) < Number(a.cse) ? b : a) : null;
  };
  const currentVariant = p => {
    const list = validVariants(p);
    const selected = list.find(v => String(v.id) === String(variantByProduct[p.id]));
    const result = selected || cheapest(p);
    if (result) variantByProduct[p.id] = result.id;
    return result;
  };
  const inStock = v => !!v && (!!v.unlimited || Number(v.stock) > 0);
  const savingPct = v => v && Number(v.public) > 0 && Number(v.cse) < Number(v.public)
    ? Math.round((1 - Number(v.cse) / Number(v.public)) * 100) : 0;
  const productImage = (p, size) => {
    const image = String(p.image || "");
    if (/^(data:image\/(?:png|jpeg|jpg|webp);base64,|https:\/\/)/i.test(image)) {
      return '<img class="v25-photo" src="' + esc(image) + '" alt="' + esc(p.name) + '" loading="lazy">';
    }
    // Illustration vectorielle générique par univers : aucune fausse photographie de produit.
    const cat = String(p.category||"").toLocaleLowerCase("fr");
    const family = /cinéma|cinema|spectacle|concert/.test(cat) ? "cinema" :
      /parc|sortie|loisir/.test(cat) ? "park" :
      /panier|fraîcheur|fraicheur|aliment/.test(cat) ? "fresh" :
      /sport/.test(cat) ? "sport" : "generic";
    const art = {
      cinema:'<rect x="17" y="23" width="86" height="67" rx="8"/><path d="M17 40h86M34 23l10 17M62 23l10 17M89 23l10 17M36 63h47M36 75h27"/>',
      park:'<circle cx="60" cy="51" r="32"/><circle cx="60" cy="51" r="7"/><path d="M60 19v64M28 51h64M37 28l46 46M83 28L37 74M60 83l-22 27M60 83l22 27M28 110h64"/>',
      fresh:'<path d="M32 52h56l-6 48H38zM43 52c-8-15 2-29 13-33 9 11 7 24 4 33M64 52c-5-17 7-33 22-34 4 18-3 31-14 34M40 68h40M44 82h32"/>',
      sport:'<circle cx="60" cy="57" r="36"/><path d="M43 33l16-7 18 12-4 18-22 5-13-15zM51 61l9 18 24-6M43 33l-15 11M77 38l13 2M60 79l-1 15"/>',
      generic:'<path d="M25 34h70v20c-12 0-12 16 0 16v20H25V70c12 0 12-16 0-16zM65 34v56"/><path d="M68 34v56" stroke-dasharray="5 6"/>'
    };
    return '<div class="v25-placeholder v25-placeholder-' + family + '" role="img" aria-label="Illustration générique de la catégorie ' + esc(p.category) + '">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">' +
      art[family] + '</svg><span>Illustration de présentation</span></div>';
  };
  const variantOptions = p => validVariants(p).map(v =>
    '<option value="' + esc(v.id) + '" ' + (String(currentVariant(p)?.id) === String(v.id) ? 'selected' : '') + '>' +
    esc(v.name) + ' — ' + eur(v.cse) + '</option>').join("");
  const stockLabel = v => !v ? "Aucune formule" : v.unlimited
    ? "Disponible sur commande" : Number(v.stock) > 0 ? "Disponible" : "Indisponible";
  function productCard(p, compact) {
    const v = currentVariant(p), pct = savingPct(v), qty = validVariants(p).length;
    const disabled = !inStock(v);
    return '<article class="v25-product-card' + (compact ? ' v25-featured-card' : '') + '">' +
      '<div class="v25-card-media"><div class="v25-card-picture">' + productImage(p) + '</div>' +
      (p.featured ? '<span class="v25-ribbon">À la une</span>' : '') +
      (pct > 0 ? '<span class="v25-save-badge">−' + pct + ' %</span>' : '') +
      '</div>' +
      '<div class="v25-card-body"><div class="v25-eyebrow">' + esc(p.category) + '</div>' +
      '<h3>' + esc(p.name) + '</h3><p class="v25-card-description">' + esc(p.description || 'Découvrez les différentes formules réservées aux salariés.') + '</p>' +
      '<label class="v25-card-label" for="v25select-' + esc(p.id) + '">Choisir une formule <small>(' + qty + ')</small></label>' +
      '<select id="v25select-' + esc(p.id) + '" class="v25-variant-select" onchange="v25ChooseVariant(' + idArg(p.id) + ',this.value)" ' + (!qty ? 'disabled' : '') + '>' + variantOptions(p) + '</select>' +
      '<div class="v25-card-price"><div><small>Prix public</small><s>' + (v ? eur(v.public) : "—") + '</s></div>' +
      '<div><small>Votre prix CSE</small><strong>' + (v ? eur(v.cse) : "—") + '</strong></div></div>' +
      '<div class="v25-card-status"><span class="' + (inStock(v) ? 'v25-available' : 'v25-unavailable') + '">' + stockLabel(v) + '</span>' +
      (v?.longDelay ? '<span class="v25-long-delay">Délai fournisseur prolongé</span>' : '') + '</div>' +
      '<div class="v25-card-actions"><button class="v25-detail-btn" onclick="v25OpenProduct(' + idArg(p.id) + ')">Voir la fiche</button>' +
      '<button class="btn primary v25-cart-btn" ' + (disabled ? 'disabled' : '') + ' onclick="v25QuickAdd(' + idArg(p.id) + ')">＋ Ajouter</button></div>' +
      '</div></article>';
  }
  function listProducts() {
    const q = searchText.toLocaleLowerCase("fr").trim();
    let list = catalogueData().filter(p =>
      (selectedCategory === "Toutes" || p.category === selectedCategory) &&
      (!q || [p.category, p.name, p.description, ...validVariants(p).map(v => v.name)].join(" ").toLocaleLowerCase("fr").includes(q)));
    list.sort((a, b) => {
      if (sortBy === "priceUp") return Number(cheapest(a)?.cse ?? Infinity) - Number(cheapest(b)?.cse ?? Infinity);
      if (sortBy === "priceDown") return Number(cheapest(b)?.cse ?? -Infinity) - Number(cheapest(a)?.cse ?? -Infinity);
      if (sortBy === "alpha") return a.name.localeCompare(b.name, "fr");
      return Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name, "fr");
    });
    return list;
  }
  function catalogPage() {
    if (detailId && getProduct(detailId)) return detailPage(getProduct(detailId));
    detailId = null;
    const data = CSECatalog.load(), list = listProducts();
    const categories = ["Toutes", ...new Set([...data.categories, ...data.products.map(p => p.category)])];
    return '<div class="v25-shop">' +
      '<div class="v25-shop-head"><div><span class="v25-overline">LA BOUTIQUE DU CSE ÉDUCATIF</span>' +
      '<h1>Les avantages qui font la différence.</h1>' +
      '<p>Billetterie, sorties, loisirs et offres réservées aux salariés. Découvrez nos tarifs CSE en toute simplicité.</p>' +
      '<div class="v25-shop-highlights"><span>✓ Tarifs négociés</span><span>✓ Choix des formules</span><span>✓ Suivi de vos commandes</span></div></div>' +
      '<div class="v25-shop-head-art" aria-hidden="true"><div class="v25-art-disc"></div><div class="v25-art-ticket"><i></i><span>CSE</span><b>Avantages</b></div></div></div>' +
      '<div class="v25-shop-layout">' +
      '<aside class="v25-filters" aria-label="Catégories de produits"><div class="v25-filters-head">Explorer <span>' + data.products.length + ' produits</span></div>' +
      categories.map(c => '<button class="v25-category-btn ' + (selectedCategory === c ? 'active' : '') +
        '" onclick="v25SetCategory(' + idArg(c) + ')"><span>' + esc(c) + '</span><small>' +
        (c === "Toutes" ? data.products.length : data.products.filter(p => p.category === c).length) +
        '</small></button>').join("") +
      '<div class="v25-sidebar-note"><b>Vos avantages CSE</b><p>Les prix réservés aux salariés sont indiqués sur chaque fiche produit.</p></div></aside>' +
      '<div class="v25-shop-results"><div class="v25-searchrow"><div class="v25-searchbar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="19" height="19" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>' +
      '<input id="v25SearchInput" type="search" aria-label="Rechercher des produits" placeholder="Rechercher un produit, une enseigne, une formule…" value="' + esc(searchText) + '" oninput="v25Search(this.value)"></div>' +
      '<label class="v25-sort"><span>Trier par</span><select onchange="v25SetSort(this.value)">' +
      [['featured', 'À la une'], ['alpha', 'Nom A à Z'], ['priceUp', 'Prix croissant'], ['priceDown', 'Prix décroissant']].map(([id, text]) =>
        '<option value="' + id + '" ' + (sortBy === id ? 'selected' : '') + '>' + text + '</option>').join("") +
      '</select></label></div>' +
      '<div class="v25-result-heading"><div><span class="v25-overline">' + esc(selectedCategory === "Toutes" ? "CATALOGUE COMPLET" : selectedCategory) + '</span>' +
      '<h2>' + (selectedCategory === "Toutes" ? 'Tous les produits' : esc(selectedCategory)) + '</h2></div><span>' + list.length + ' produit' + (list.length > 1 ? 's' : '') + '</span></div>' +
      '<div class="v25-grid">' + (list.length ? list.map(p => productCard(p, false)).join("") :
        '<div class="v25-no-result"><h3>Aucun produit trouvé</h3><p>Essayez un autre mot-clé ou sélectionnez une autre catégorie.</p>' +
        '<button class="btn" onclick="v25ResetFilters()">Voir tous les produits</button></div>') + '</div>' +
      '</div></div></div>';
  }
  function detailPage(p) {
    const v = currentVariant(p), pct = savingPct(v), available = inStock(v);
    if (v && !v.unlimited && detailQuantity > Number(v.stock)) detailQuantity = Math.max(1, Number(v.stock));
    const count = Math.max(1, detailQuantity);
    return '<div class="v25-detail-page">' +
      '<nav class="v25-breadcrumb" aria-label="Fil d’Ariane"><button onclick="v25BackToShop()">Boutique</button><span>›</span><button onclick="v25SetCategory(' + idArg(p.category) + ')">' + esc(p.category) + '</button><span>›</span><strong>' + esc(p.name) + '</strong></nav>' +
      '<div class="v25-detail-layout"><section class="v25-detail-photo">' +
      '<div class="v25-detail-photo-frame">' + productImage(p, true) + '</div>' +
      '<div class="v25-photo-caption">Photo ou illustration · ' + esc(p.category) + '</div>' +
      '</section><section class="v25-detail-info"><div class="v25-eyebrow">' + esc(p.category) + '</div>' +
      '<h1>' + esc(p.name) + '</h1>' +
      '<p class="v25-detail-desc">' + esc(p.description || 'Choisissez parmi les formules proposées à tarif CSE.') + '</p>' +
      '<div class="v25-advantages"><span>Réservé aux salariés</span><span>Tarif préférentiel CSE</span></div>' +
      '<div class="v25-purchase-box">' +
      '<label class="v25-purchase-title" for="v25DetailVariant">Choisissez votre formule</label>' +
      '<select id="v25DetailVariant" onchange="v25ChooseVariant(' + idArg(p.id) + ',this.value)">' + variantOptions(p) + '</select>' +
      '<div class="v25-detail-prices"><div><span>Prix public</span><s>' + (v ? eur(v.public) : '—') + '</s></div>' +
      '<div><span>Prix CSE</span><strong>' + (v ? eur(v.cse) : '—') + '</strong></div>' +
      (pct ? '<span class="v25-detail-saving">Économie de ' + (v ? eur(Math.max(0, Number(v.public) - Number(v.cse))) : '—') + ' · −' + pct + ' %</span>' : '') +
      '</div>' +
      '<div class="v25-statusline"><span class="' + (available ? 'v25-available' : 'v25-unavailable') + '">' + stockLabel(v) + '</span>' +
      (v?.longDelay ? '<span class="v25-long-delay">Délai fournisseur plus important</span>' : '') + '</div>' +
      (v?.longDelay ? '<p class="v25-delivery-notice">Ce produit nécessite un délai de préparation fournisseur plus long. Les informations de disponibilité seront confirmées par le CSE.</p>' : '') +
      '<div class="v25-purchase-row"><div class="v25-quantity" role="group" aria-label="Quantité"><button onclick="v25ChangeQty(-1)" aria-label="Diminuer la quantité">−</button><output id="v25QtyValue">' + count + '</output><button onclick="v25ChangeQty(1)" aria-label="Augmenter la quantité">+</button></div>' +
      '<button class="btn primary v25-add-main" onclick="v25AddFromDetail()" ' + (available ? '' : 'disabled') + '>Ajouter au panier</button></div>' +
      '<p class="v25-safe-note">Commande et paiement simulés pour cette maquette.</p>' +
      '</div></section></div>' +
      '<section class="v25-detail-more"><div><h2>À propos de ce produit</h2><p>' + esc(p.description || 'Toutes les informations de cette prestation sont accessibles depuis votre espace salarié.') + '</p></div>' +
      '<div><h2>Informations pratiques</h2><p>Votre sélection apparaîtra dans votre panier avec le tarif CSE de la formule choisie. L’administrateur pourra vérifier votre commande avant sa validation définitive.</p></div></section></div>';
  }
  function featured(limit) {
    const products = catalogueData().filter(p => p.featured).slice(0, Math.max(1, Math.min(Number(limit) || 8, 8)));
    return '<div class="v25-featured">' + (products.length ? products.map(p => productCard(p, true)).join("") :
      '<div class="v25-no-result"><p>Aucun produit n’est sélectionné pour les offres à la une.</p></div>') + '</div>';
  }
  function setCategory(cat) { selectedCategory = cat; detailId = null; page = 'catalog'; render(); window.scrollTo(0, 0); }
  function setSort(sort) { sortBy = sort; render(); }
  function search(q) {
    searchText = q;
    const active = document.getElementById('v25SearchInput');
    const pos = active?.selectionStart;
    render();
    const el = document.getElementById('v25SearchInput');
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }
  function openDetail(id) { if (!getProduct(id)) return; detailId = id; detailQuantity = 1; page = 'catalog'; render(); window.scrollTo(0, 0); }
  function backToShop() { detailId = null; render(); window.scrollTo(0, 0); }
  function chooseVariant(productId, variantId) {
    variantByProduct[productId] = Number(variantId);
    if (detailId) detailQuantity = 1;
    render();
  }
  function changeQty(direction) {
    const p = getProduct(detailId), v = p && currentVariant(p);
    if (!v) return;
    const ceiling = v.unlimited ? 99 : Number(v.stock);
    detailQuantity = Math.min(Math.max(1, ceiling), Math.max(1, detailQuantity + direction));
    const output = document.getElementById('v25QtyValue');
    if (output) output.textContent = String(detailQuantity);
  }
  function addProduct(p, qty) {
    const v = currentVariant(p);
    if (!inStock(v)) { notify("Cette formule est indisponible."); return; }
    qty = Math.max(1, Math.min(99, qty));
    if (typeof mode === 'undefined' || mode === 'public') {
      addCart(v.id);
      return;
    }
    const existing = cart.find(x => Number(x.id) === Number(v.id));
    if (!v.unlimited && Number(v.stock) < qty + (existing?.qty || 0)) {
      notify("La quantité choisie dépasse le stock disponible.");
      return;
    }
    if (existing) existing.qty += qty;
    else cart.push({ id: v.id, qty });
    notify(qty + " article" + (qty > 1 ? "s" : "") + " ajouté" + (qty > 1 ? "s" : "") + " au panier.");
    render();
  }
  function quickAdd(id) { const p = getProduct(id); if (p) addProduct(p, 1); }
  function addFromDetail() { const p = getProduct(detailId); if (p) addProduct(p, detailQuantity); }
  function reset() { selectedCategory = "Toutes"; searchText = ""; sortBy = "featured"; render(); }
  window.v25SetCategory = setCategory; window.v25SetSort = setSort;
  window.v25Search = search; window.v25OpenProduct = openDetail;
  window.v25BackToShop = backToShop; window.v25ChooseVariant = chooseVariant;
  window.v25ChangeQty = changeQty; window.v25AddFromDetail = addFromDetail;
  window.v25QuickAdd = quickAdd; window.v25ResetFilters = reset;
  // Public and employee use the same catalogue and the same underlying variant identifiers.
  catalog = catalogPage;
  if (typeof publicFeatured === 'function') publicFeatured = featured;
  // Visiting the "Boutique" menu resets a previously opened detail page.
  const previousGo = go;
  go = function (p) { if (p === 'catalog') detailId = null; previousGo(p); };
  // Keep featured homepage product cards in the same design without altering the CMS page layouts.
  const previousHome = home;
  home = function () {
    const configured = typeof sharedPage === 'function' ? sharedPage("Accueil") : null;
    if (configured?.length) return previousHome();
    return '<section class="hero"><div><span class="pill">VOTRE ESPACE AVANTAGES</span>' +
      '<h1>Vos avantages CSE,<br>en toute simplicité.</h1><p>Billetterie, loisirs et services réservés aux salariés.</p>' +
      '<button class="btn" onclick="go(\'catalog\')">Découvrir les offres →</button></div></section>' +
      '<section class="section"><h2>Nos offres à la une</h2>' + featured(4) + '</section>';
  };
  window.addEventListener("storage", e => { if (e.key === CSECatalog.KEY && page === "catalog") render(); });
  window.addEventListener("cse:catalog-updated", () => { if (page === "catalog") render(); });
  render();
})();