"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const tokenInput = byId("token");
  const connect = byId("connect");
  const workspace = byId("workspace");
  const login = byId("login");
  const siteBody = byId("sites");
  const message = byId("message");
  let token = "";
  let baseline = [];

  const setMessage = (text, error = false) => {
    message.textContent = text;
    message.className = error ? "error" : "ok";
  };

  async function request(method, body) {
    const res = await fetch("/api/sites", {
      method,
      cache: "no-store",
      credentials: "omit",
      headers: {
        "X-CSE-Admin-Token": token,
        ...(body ? {"Content-Type": "application/json"} : {})
      },
      ...(body ? {body:JSON.stringify({sites:body})} : {})
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("Jeton incorrect.");
      if (res.status === 429) throw new Error("Trop d'essais. Réessayez ultérieurement.");
      throw new Error("Opération refusée (code " + res.status + ").");
    }
    return res.json();
  }

  function cellWithInput(row, type, value, cls) {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = type;
    if (type === "checkbox") input.checked = Boolean(value);
    else input.value = String(value);
    if (type === "number") {
      input.min = "0";
      input.max = "100000";
      input.step = "1";
    }
    input.className = cls;
    td.append(input);
    row.append(td);
    return input;
  }

  function render(sites) {
    baseline = sites.map(site => ({...site}));
    siteBody.replaceChildren();
    for (const site of baseline) {
      const tr = document.createElement("tr");
      tr.dataset.code = site.code;
      const codeCell = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = site.code;
      codeCell.append(strong);
      tr.append(codeCell);
      cellWithInput(tr, "text", site.name, "siteName").maxLength = 120;
      cellWithInput(tr, "number", site.displayOrder, "siteOrder");
      cellWithInput(tr, "checkbox", site.active, "siteActive");
      siteBody.append(tr);
    }
  }

  async function reload() {
    const data = await request("GET");
    if (!Array.isArray(data.sites)) throw new Error("Réponse serveur invalide.");
    render(data.sites);
  }

  connect.addEventListener("click", async () => {
    token = tokenInput.value.trim();
    tokenInput.value = "";
    setMessage("");
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      token = "";
      setMessage("Le jeton doit comporter 64 caractères hexadécimaux.", true);
      return;
    }
    connect.disabled = true;
    try {
      await reload();
      login.hidden = true;
      workspace.hidden = false;
      setMessage("Liste des établissements chargée.");
    } catch (error) {
      token = "";
      setMessage(error.message, true);
    } finally {
      connect.disabled = false;
    }
  });

  byId("reload").addEventListener("click", async () => {
    try { await reload(); setMessage("Liste actualisée."); }
    catch (error) { setMessage(error.message, true); }
  });

  byId("lock").addEventListener("click", () => {
    token = "";
    baseline = [];
    siteBody.replaceChildren();
    byId("newSites").value = "";
    workspace.hidden = true;
    login.hidden = false;
    setMessage("Panneau verrouillé.");
  });

  byId("save").addEventListener("click", async () => {
    const batch = [];
    for (const tr of siteBody.querySelectorAll("tr")) {
      const code = tr.dataset.code;
      const item = {
        code,
        name:tr.querySelector(".siteName").value,
        displayOrder:Number(tr.querySelector(".siteOrder").value),
        active:tr.querySelector(".siteActive").checked
      };
      const before = baseline.find(site => site.code === code);
      if (!before || item.name !== before.name ||
          item.displayOrder !== before.displayOrder || item.active !== before.active) {
        batch.push(item);
      }
    }
    const additions = byId("newSites").value.trim();
    if (additions) {
      for (const line of additions.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const [code, name, order, extra] = line.split(";");
        if (extra !== undefined || !code?.trim() || !name?.trim()) {
          setMessage("Nouveau site invalide : utilisez le format code;nom;ordre.", true);
          return;
        }
        const item = {code:code.trim(), name:name.trim()};
        if (order?.trim()) {
          const n = Number(order.trim());
          if (!Number.isInteger(n) || n < 0 || n > 100000) {
            setMessage("Ordre invalide pour le nouveau site " + item.code, true);
            return;
          }
          item.displayOrder = n;
        }
        batch.push(item);
      }
    }
    if (!batch.length) {
      setMessage("Aucune modification à enregistrer.");
      return;
    }
    if (batch.length > 100) {
      setMessage("Un maximum de 100 modifications est accepté à la fois.", true);
      return;
    }
    if (!confirm("Enregistrer " + batch.length + " modification(s) d'établissement ?")) return;
    const save = byId("save");
    save.disabled = true;
    try {
      const result = await request("PUT", batch);
      byId("newSites").value = "";
      await reload();
      setMessage((result.saved?.length || 0) + " établissement(s) enregistré(s).");
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      save.disabled = false;
    }
  });
})();
