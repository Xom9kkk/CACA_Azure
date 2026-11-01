const CAT = { Music: "🎸", Tech: "💻", Sport: "🏃", Art: "🎨", Food: "🍄", Party: "🎉" };
const DAY = 24 * 60 * 60 * 1000;

const state = { events: [], q: "", category: "All", range: "any" };
let current = null;

const $ = (sel) => document.querySelector(sel);

async function api(method, url, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
}

function fmtDate(iso) {
    return new Date(iso).toLocaleString("en-GB", {
        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
}

function fmtPrice(price) {
    return price > 0 ? `${Number(price).toLocaleString("en", { maximumFractionDigits: 2 })} zł` : "Free";
}

function timeParts(iso) {
    const diff = Math.max(new Date(iso) - Date.now(), 0);
    const pad = (n) => String(n).padStart(2, "0");
    return {
        done: diff === 0,
        d: pad(Math.floor(diff / DAY)),
        h: pad(Math.floor(diff / 3600000) % 24),
        m: pad(Math.floor(diff / 60000) % 60),
        s: pad(Math.floor(diff / 1000) % 60),
    };
}

function countdownText(iso) {
    const t = timeParts(iso);
    return t.done ? "Started" : `T-minus ${t.d}d ${t.h}h ${t.m}m ${t.s}s`;
}

function toast(message, kind = "ok") {
    const el = document.createElement("div");
    el.className = `toast ${kind === "error" ? "error" : ""}`;
    el.textContent = message;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

/* ---------- board ---------- */

function filtered() {
    const q = state.q.trim().toLowerCase();
    const now = Date.now();
    const limit = { any: Infinity, week: 7 * DAY, month: 30 * DAY }[state.range];
    return state.events.filter((e) =>
        (!q || e.title.toLowerCase().includes(q)) &&
        (state.category === "All" || e.category === state.category) &&
        new Date(e.starts_at) - now <= limit
    );
}

function renderCats() {
    const count = (c) => (c === "All" ? state.events.length : state.events.filter((e) => e.category === c).length);
    $("#cat-list").innerHTML = ["All", ...Object.keys(CAT)].map((c) => `
        <button type="button" class="cat ${c === state.category ? "on" : ""}" data-cat="${c}">
            <span>${c === "All" ? "" : CAT[c] + " "}${c}</span><span>${count(c)}</span>
        </button>`).join("");
}

function timerBlocks(iso) {
    return `<div class="timer" data-timer="${esc(iso)}">
        <div><b data-part="d">--</b><span>days</span></div>
        <div><b data-part="h">--</b><span>hrs</span></div>
        <div><b data-part="m">--</b><span>min</span></div>
        <div><b data-part="s">--</b><span>sec</span></div>
    </div>`;
}

function renderHero() {
    const next = state.events.find((e) => e.seats_left > 0);
    const hero = $("#hero");
    if (!next) {
        hero.className = "hero blank panel k";
        hero.innerHTML = `<div class="H">No upcoming gatherings</div>
            <p class="lbl" style="margin-top:10px">The tunnels are quiet. Post the first event.</p>`;
        delete hero.dataset.id;
        return;
    }
    hero.className = "hero panel k";
    hero.dataset.id = next.id;
    hero.innerHTML = `
        <div class="art"><span>${CAT[next.category] || "◆"}</span></div>
        <div class="hero-txt">
            <div class="lbl">Next gathering · ${esc(next.category)}</div>
            <h2>${esc(next.title)}</h2>
            <div class="lbl acc">${esc(fmtDate(next.starts_at))} · ${esc(next.location)}</div>
            ${timerBlocks(next.starts_at)}
            <div><button class="btn" type="button">Reserve a pass</button></div>
        </div>`;
}

function renderGrid() {
    const list = filtered();
    $("#empty-state").hidden = list.length > 0;
    $("#grid").innerHTML = list.map((e, i) => {
        const pct = Math.round((e.seats_taken / e.capacity) * 100);
        return `
        <article class="card panel ${e.seats_left ? "" : "out"}" data-id="${e.id}" tabindex="0" style="animation-delay:${i * 40}ms">
            <div class="card-top"><span class="lbl">${esc(e.category)}</span><span class="em">${CAT[e.category] || ""}</span></div>
            <h3 class="H">${esc(e.title)}</h3>
            <div class="lbl">${esc(fmtDate(e.starts_at))} · ${esc(e.location)}</div>
            <div class="bar"><i style="width:${pct}%"></i></div>
            <div class="card-foot">
                <span class="price">${fmtPrice(e.price)}</span>
                <span class="lbl">${e.seats_left ? `${e.seats_left} left` : '<span class="sold">Sold out</span>'}</span>
            </div>
        </article>`;
    }).join("");
}

function render() {
    renderCats();
    renderHero();
    renderGrid();
    tick();
}

async function loadEvents() {
    try {
        state.events = await api("GET", "/api/events");
    } catch (err) {
        toast(`Could not load events: ${err.message}`, "error");
    }
    render();
}

function tick() {
    document.querySelectorAll("[data-timer]").forEach((el) => {
        const t = timeParts(el.dataset.timer);
        for (const part of ["d", "h", "m", "s"]) el.querySelector(`[data-part="${part}"]`).textContent = t[part];
    });
    document.querySelectorAll("[data-countdown]").forEach((el) => {
        el.textContent = countdownText(el.dataset.countdown);
    });
}

/* ---------- modals ---------- */

function showOverlay(id) {
    $(id).classList.add("show");
    document.body.classList.add("locked");
}

function hideOverlay(id) {
    $(id).classList.remove("show");
    if (!document.querySelector(".overlay.show")) document.body.classList.remove("locked");
}

function closeModals() {
    document.querySelectorAll(".overlay.show").forEach((el) => el.classList.remove("show"));
    document.body.classList.remove("locked");
    current = null;
    if (location.hash.startsWith("#event-")) history.replaceState(null, "", location.pathname + location.search);
}

function renderEventModal(e) {
    current = e;
    const pct = Math.round((e.seats_taken / e.capacity) * 100);
    const options = Array.from({ length: Math.min(5, e.seats_left) }, (_, i) =>
        `<option value="${i + 1}">${i + 1} pass${i ? "es" : ""}</option>`).join("");
    const bookingSide = e.seats_left > 0 ? `
        <form id="book-form" novalidate>
            <div class="lbl" style="margin-bottom:10px">Reserve a pass</div>
            <input class="field" name="name" placeholder="name" maxlength="80" autocomplete="name" required>
            <input class="field" name="email" type="email" placeholder="email" maxlength="120" autocomplete="email" required>
            <select class="field" name="tickets">${options}</select>
            <p class="book-error"></p>
            <button class="btn" type="submit" style="width:100%">Issue pass</button>
        </form>` : `<div class="stamp static">Sold out<small>no passes left</small></div>`;

    $("#event-modal .modal-body").innerHTML = `
        <div>
            <div class="lbl">File ${String(e.id).padStart(4, "0")} · ${CAT[e.category] || ""} ${esc(e.category)}</div>
            <h2>${esc(e.title)}</h2>
            <div class="lbl acc">${esc(fmtDate(e.starts_at))} · ${esc(e.location)} · ${fmtPrice(e.price)}</div>
            <p>${esc(e.description) || "No description yet."}</p>
            <div class="bar"><i style="width:${pct}%"></i></div>
            <div class="lbl seats-line"><span>${e.seats_taken} / ${e.capacity} seats</span><span data-countdown="${esc(e.starts_at)}"></span></div>
            <div class="row">
                <button class="btn ghost" type="button" data-action="edit">Edit</button>
                <button class="btn ghost" type="button" data-action="delete">Delete</button>
            </div>
        </div>
        <div>${bookingSide}</div>
        <div class="stamp" id="stamp"></div>`;
    tick();
}

async function openEvent(id) {
    try {
        const e = await api("GET", `/api/events/${id}`);
        renderEventModal(e);
        showOverlay("#event-modal");
        if (location.hash !== `#event-${id}`) history.replaceState(null, "", `#event-${id}`);
        const first = $("#book-form input") || $("#event-modal .close");
        first.focus({ preventScroll: true });
    } catch (err) {
        toast(err.message, "error");
        closeModals();
    }
}

function playStamp(code) {
    const stamp = $("#stamp");
    stamp.innerHTML = `Approved<small>pass ${esc(code)}</small>`;
    stamp.classList.remove("go");
    void stamp.offsetWidth;
    stamp.classList.add("go");
}

async function submitBooking(form) {
    const button = form.querySelector("button[type=submit]");
    const errorEl = form.querySelector(".book-error");
    const data = new FormData(form);
    errorEl.textContent = "";
    button.disabled = true;
    try {
        const res = await api("POST", `/api/events/${current.id}/bookings`, {
            name: data.get("name"), email: data.get("email"), tickets: Number(data.get("tickets")),
        });
        renderEventModal(res.event);
        playStamp(res.code);
        toast(`Pass ${res.code} issued for ${res.tickets} seat${res.tickets > 1 ? "s" : ""}`);
        loadEvents();
    } catch (err) {
        errorEl.textContent = err.message;
        toast(err.message, "error");
        button.disabled = false;
    }
}

function confirmDialog(text) {
    $("#confirm-text").textContent = text;
    showOverlay("#confirm-modal");
    $("#confirm-no").focus();
    return new Promise((resolve) => {
        const done = (answer) => {
            hideOverlay("#confirm-modal");
            $("#confirm-yes").onclick = $("#confirm-no").onclick = null;
            confirmDialog.cancel = null;
            resolve(answer);
        };
        $("#confirm-yes").onclick = () => done(true);
        $("#confirm-no").onclick = () => done(false);
        confirmDialog.cancel = () => done(false);
    });
}

async function deleteCurrent() {
    const e = current;
    if (!(await confirmDialog(`"${e.title}" and all its bookings will be removed.`))) return;
    try {
        await api("DELETE", `/api/events/${e.id}`);
        toast("Event deleted");
        closeModals();
        loadEvents();
    } catch (err) {
        toast(err.message, "error");
    }
}

/* ---------- create / edit form ---------- */

function toLocalInput(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openForm(e = null) {
    const form = $("#event-form");
    form.reset();
    form.dataset.id = e ? e.id : "";
    $("#form-error").textContent = "";
    $("#form-kicker").textContent = e ? `Edit file ${String(e.id).padStart(4, "0")}` : "New event";
    $("#form-title").textContent = e ? "Edit event" : "Post an event";
    $("#form-submit").textContent = e ? "Save changes" : "Post event";

    const tomorrow = new Date(Date.now() + DAY);
    tomorrow.setHours(19, 0, 0, 0);
    form.elements.title.value = e ? e.title : "";
    form.elements.description.value = e ? e.description : "";
    form.elements.category.value = e ? e.category : "Music";
    form.elements.starts_at.value = toLocalInput(e ? new Date(e.starts_at) : tomorrow);
    form.elements.location.value = e ? e.location : "";
    form.elements.price.value = e ? e.price : 0;
    form.elements.capacity.value = e ? e.capacity : 50;
    form.elements.capacity.min = e ? Math.max(1, e.seats_taken) : 1;

    hideOverlay("#event-modal");
    showOverlay("#form-modal");
    form.elements.title.focus();
}

async function submitForm(form) {
    const id = form.dataset.id;
    const button = $("#form-submit");
    const when = new Date(form.elements.starts_at.value);
    const body = {
        title: form.elements.title.value,
        description: form.elements.description.value,
        category: form.elements.category.value,
        starts_at: isNaN(when) ? "" : when.toISOString(),
        location: form.elements.location.value,
        price: form.elements.price.value === "" ? null : Number(form.elements.price.value),
        capacity: form.elements.capacity.value === "" ? null : Number(form.elements.capacity.value),
    };
    $("#form-error").textContent = "";
    button.disabled = true;
    try {
        const saved = await api(id ? "PUT" : "POST", id ? `/api/events/${id}` : "/api/events", body);
        hideOverlay("#form-modal");
        toast(id ? "Changes saved" : "Event posted");
        await loadEvents();
        openEvent(saved.id);
    } catch (err) {
        $("#form-error").textContent = err.message;
    } finally {
        button.disabled = false;
    }
}

/* ---------- azure block ---------- */

async function loadAzureInfo() {
    const db = $("#azure-db");
    try {
        const res = await fetch("/health");
        const ok = res.ok && (await res.json()).db === "connected";
        db.innerHTML = ok
            ? '<span class="led"></span>Azure PostgreSQL · connected'
            : '<span class="led off"></span>Database offline';
    } catch {
        db.innerHTML = '<span class="led off"></span>Database offline';
    }
    try {
        const info = await api("GET", "/api/info");
        $("#azure-region").textContent = info.region;
        $("#azure-rev").textContent = info.replica;
    } catch {
        $("#azure-region").textContent = $("#azure-rev").textContent = "unknown";
    }
}

/* ---------- dust ---------- */

function startDust() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = $("#dust");
    const ctx = canvas.getContext("2d");
    let particles = [];
    const resize = () => {
        canvas.width = innerWidth;
        canvas.height = innerHeight;
        particles = Array.from({ length: 60 }, () => ({
            x: Math.random() * canvas.width, y: Math.random() * canvas.height,
            r: Math.random() * 1.4 + 0.3, v: Math.random() * 0.2 + 0.04, d: Math.random() * 0.3 - 0.15,
        }));
    };
    resize();
    addEventListener("resize", resize);
    ctx.fillStyle = "rgba(200,215,235,.35)";
    (function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(200,215,235,.35)";
        for (const p of particles) {
            p.y += p.v;
            p.x += p.d;
            if (p.y > canvas.height) { p.y = -5; p.x = Math.random() * canvas.width; }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 7);
            ctx.fill();
        }
        requestAnimationFrame(frame);
    })();
}

/* ---------- wiring ---------- */

function openFromHash() {
    const match = location.hash.match(/^#event-(\d+)$/);
    if (match && (!current || current.id !== Number(match[1]))) openEvent(match[1]);
}

function init() {
    $("#event-form").elements.category.innerHTML = Object.keys(CAT)
        .map((c) => `<option value="${c}">${CAT[c]} ${c}</option>`).join("");

    $("#search").addEventListener("input", (ev) => { state.q = ev.target.value; renderGrid(); });
    $("#cat-list").addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-cat]");
        if (!btn) return;
        state.category = btn.dataset.cat;
        renderCats();
        renderGrid();
    });
    $("#date-filters").addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-range]");
        if (!btn) return;
        state.range = btn.dataset.range;
        document.querySelectorAll("#date-filters .chip").forEach((c) => c.classList.toggle("on", c === btn));
        renderGrid();
    });
    $("#new-event-btn").addEventListener("click", () => openForm());

    $("#grid").addEventListener("click", (ev) => {
        const card = ev.target.closest(".card");
        if (card) openEvent(card.dataset.id);
    });
    $("#grid").addEventListener("keydown", (ev) => {
        const card = ev.target.closest(".card");
        if (card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openEvent(card.dataset.id); }
    });
    $("#hero").addEventListener("click", () => { if ($("#hero").dataset.id) openEvent($("#hero").dataset.id); });

    $("#event-modal").addEventListener("click", (ev) => {
        const action = ev.target.closest("[data-action]")?.dataset.action;
        if (action === "edit") openForm(current);
        if (action === "delete") deleteCurrent();
    });
    $("#event-modal").addEventListener("submit", (ev) => {
        if (ev.target.id === "book-form") { ev.preventDefault(); submitBooking(ev.target); }
    });
    $("#event-form").addEventListener("submit", (ev) => { ev.preventDefault(); submitForm(ev.target); });

    document.querySelectorAll(".overlay").forEach((overlay) => {
        overlay.addEventListener("click", (ev) => {
            if (overlay.id === "confirm-modal") {
                if (ev.target === overlay) confirmDialog.cancel?.();
                return;
            }
            if (ev.target === overlay || ev.target.closest("[data-close]")) closeModals();
        });
    });
    document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape") return;
        if (confirmDialog.cancel) confirmDialog.cancel();
        else closeModals();
    });
    addEventListener("hashchange", openFromHash);

    setInterval(tick, 1000);
    startDust();
    loadAzureInfo();
    loadEvents().then(openFromHash);
}

init();
