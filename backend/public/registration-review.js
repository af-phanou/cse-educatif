"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const tokenField = $("token");
  const login = $("login"), workspace = $("workspace");
  const body = $("requests"), count = $("count"), empty = $("empty");
  let token = "";

  function message(value, error = false) {
    $("message").textContent = value;
    $("message").className = error ? "error" : "success";
  }

  async function api(path, method = "GET", payload) {
    const result = await fetch(path, {
      method, credentials:"omit", cache:"no-store",
      headers: {
        "X-CSE-Review-Token":token,
        ...(payload ? {"Content-Type":"application/json"} : {})
      },
      ...(payload ? {body:JSON.stringify(payload)} : {})
    });
    if (!result.ok) {
      if (result.status === 401) throw new Error("Jeton refusé.");
      if (result.status === 429) throw new Error("Trop de tentatives. Réessayez ultérieurement.");
      if (result.status === 409) throw new Error("Cette demande a déjà été traitée ou a expiré.");
      throw new Error("Erreur serveur (code " + result.status + ").");
    }
    return result.json();
  }

  const reasons = {
    matched:"Correspondance unique",
    not_found:"Absent du CSV",
    ambiguous:"Homonymes ou doublons",
    no_active_roster:"Aucun CSV actif",
    establishment_unavailable:"Établissement indisponible"
  };
  function createCell(tr, contents) {
    const td = document.createElement("td");
    if (typeof contents === "string") td.textContent = contents;
    else td.append(contents);
    tr.append(td);
    return td;
  }
  function button(text, cssClass, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = cssClass;
    element.textContent = text;
    element.addEventListener("click", handler);
    return element;
  }

  async function refresh() {
    const data = await api("/api/demandes");
    if (!Array.isArray(data.requests)) throw new Error("Réponse inattendue du serveur.");
    body.replaceChildren();
    for (const request of data.requests) {
      const tr = document.createElement("tr");
      const date = new Date(request.createdAt);
      createCell(tr, Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-FR"));
      const salarie = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = request.firstName + " " + request.lastName;
      const email = document.createElement("div");
      email.textContent = request.email;
      email.className = "email";
      salarie.append(name, email);
      createCell(tr, salarie);
      createCell(tr, request.establishmentNumber);
      createCell(tr, reasons[request.reason] || "À contrôler");
      createCell(tr, request.emailVerified ? "Oui" : "Non");
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(
        button("Approuver", "", () => decide(request, "approved")),
        button("Refuser", "danger", () => decide(request, "rejected"))
      );
      createCell(tr, actions);
      body.append(tr);
    }
    count.textContent = String(data.requests.length);
    empty.hidden = data.requests.length !== 0;
  }

  async function decide(request, decision) {
    const actionName = decision === "approved" ? "approuver" : "refuser";
    const label = request.firstName + " " + request.lastName;
    if (!confirm("Confirmer : " + actionName + " le dossier de " + label + " ? Aucun compte ne sera activé et aucun email ne sera envoyé.")) return;
    body.querySelectorAll("button").forEach(el => el.disabled = true);
    try {
      const response = await api("/api/demandes/" + encodeURIComponent(request.id) + "/decision", "PUT", {decision});
      if (response.accountActivated !== false || response.emailSent !== false) {
        throw new Error("Réponse de sécurité inattendue.");
      }
      await refresh();
      message("Décision enregistrée. Aucun compte actif et aucun email envoyé.");
    } catch (error) {
      message(error.message, true);
      try { await refresh(); } catch { /* conserver le message original */ }
    } finally {
      body.querySelectorAll("button").forEach(el => el.disabled = false);
    }
  }

  $("connect").addEventListener("click", async () => {
    token = tokenField.value.trim();
    tokenField.value = "";
    message("");
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      token = "";
      message("Le jeton doit contenir 64 caractères hexadécimaux.", true);
      return;
    }
    $("connect").disabled = true;
    try {
      await refresh();
      login.hidden = true;
      workspace.hidden = false;
      message("Accès privé aux demandes ouvert.");
    } catch (error) {
      token = "";
      message(error.message, true);
    } finally {
      $("connect").disabled = false;
    }
  });

  $("refresh").addEventListener("click", async () => {
    try { await refresh(); message("Liste actualisée."); }
    catch (error) { message(error.message, true); }
  });
  $("lock").addEventListener("click", () => {
    token = "";
    body.replaceChildren();
    workspace.hidden = true;
    login.hidden = false;
    message("Panneau verrouillé.");
  });
})();
