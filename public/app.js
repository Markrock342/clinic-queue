const { esc, api, time, ago, waited, formatPhone, dateFmt, announceChange, poll } = window.Clinic;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const el = {
  clock: $("#clock"),
  sync: $("#sync"),
  totals: $("#totals"),
  tabs: $$("#dept-tabs [role=tab]"),
  loadError: $("#load-error"),
  loadErrorText: $("#load-error-text"),
  now: $("#now"),
  next: $("#next"),
  waiting: $("#waiting"),
  waitingCount: $("#waiting-count"),
  history: $("#history"),
  historyCount: $("#history-count"),
  search: $("#search"),
  form: $("#ticket-form"),
  name: $("#patient-name"),
  phone: $("#phone"),
  nameError: $("#name-error"),
  phoneError: $("#phone-error"),
  formError: $("#form-error"),
  submit: $("#ticket-form [type=submit]"),
  issued: $("#issued"),
  ticket: $("#ticket"),
  printSlip: $("#print-slip"),
  resetDialog: $("#reset-dialog"),
  toasts: $("#toasts"),
};

const PHONE_RE = /^0\d{8,9}$/;
const SERVICE_KEY = "clinic-counter-service";

const state = {
  service: readSavedService(),
  summary: null,
  tickets: [],
  query: "",
  lastIssued: null,
  loaded: false,
  html: {},
};

function readSavedService() {
  try {
    const saved = localStorage.getItem(SERVICE_KEY);
    if (["general", "dental", "lab"].includes(saved)) return saved;
  } catch {}
  return "general";
}

/* ---------- นาฬิกา ---------- */

function tickClock() {
  el.clock.textContent = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}
tickClock();
setInterval(tickClock, 10_000);

/* ---------- แจ้งเตือน ---------- */

function toast(message, type = "ok") {
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  el.toasts.append(item);
  requestAnimationFrame(() => item.classList.add("show"));
  setTimeout(() => {
    item.classList.remove("show");
    setTimeout(() => item.remove(), 300);
  }, type === "error" ? 5000 : 2800);
  while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
}

function setSync(status) {
  el.sync.dataset.state = status;
  el.sync.textContent = { ok: "ออนไลน์", error: "ขาดการเชื่อมต่อ", loading: "กำลังเชื่อมต่อ…" }[status];
}

/* วาดใหม่เฉพาะเมื่อเปลี่ยน และคืนโฟกัสให้ปุ่มเดิม */
function paint(node, key, html) {
  if (state.html[key] === html) return;
  const active = document.activeElement;
  const focus = active && node.contains(active) ? active.dataset.focusKey : null;
  node.innerHTML = html;
  state.html[key] = html;
  if (focus) $(`[data-focus-key="${CSS.escape(focus)}"]`, node)?.focus({ preventScroll: true });
}

/* ---------- เรียกคิว ---------- */

function actionButton(act, ticket, label, cls) {
  const id = esc(ticket.id);
  return `<button type="button" class="btn ${cls}" data-act="${act}" data-id="${id}" data-focus-key="${act}-${id}">${label}</button>`;
}

function renderNow(service) {
  const current = service.current;
  if (!current) {
    return `<div class="now is-empty">
      <p class="now-label">ยังไม่ได้เรียกคิว</p>
      <p>${service.waiting ? "กดปุ่ม “เรียกคนถัดไป” ด้านล่างเพื่อเริ่ม" : "ยังไม่มีผู้ป่วยรอในแผนกนี้"}</p>
    </div>`;
  }
  return `<div class="now">
    <p class="now-label">กำลังเรียก</p>
    <span class="now-number">${esc(current.number)}</span>
    <div class="now-who">
      <b>${esc(current.patientName)}</b>
      <span>เรียกเมื่อ ${time(current.calledAt)} น. (${ago(current.calledAt)})${current.recalls ? ` · เรียกซ้ำแล้ว ${current.recalls} ครั้ง` : ""}</span>
    </div>
    <div class="now-actions">
      ${actionButton("done", current, "✓ เสร็จสิ้น", "btn-success")}
      ${actionButton("recall", current, "เรียกซ้ำ", "btn-outline")}
      ${actionButton("skip", current, "ข้าม (ไม่มา)", "btn-outline")}
    </div>
  </div>`;
}

function renderNext(service) {
  const upcoming = service.next[0];
  if (!upcoming) {
    return `<button type="button" class="next-btn" disabled><b>เรียกคนถัดไป</b><small>ไม่มีคิวรอ</small></button>`;
  }
  const current = service.current;
  const note = current ? ` — ${esc(current.number)} จะถูกบันทึกว่าเสร็จสิ้น` : "";
  return `<button type="button" class="next-btn" data-next="${service.id}" data-focus-key="next"${
    current ? ` data-finish="${esc(current.id)}"` : ""
  }>
    <b>เรียกคนถัดไป</b>
    <small>${esc(upcoming.number)} · ${esc(upcoming.patientName)}${note}</small>
  </button>`;
}

function matches(ticket) {
  const q = state.query.trim().toLowerCase().replace(/[\s-]/g, "");
  if (!q) return true;
  return `${ticket.number}${ticket.patientName}${ticket.phone}`.toLowerCase().replace(/\s/g, "").includes(q);
}

function phoneText(ticket) {
  return ticket.phone ? ` · ${esc(formatPhone(ticket.phone))}` : "";
}

function renderWaiting(tickets, currentId) {
  const open = tickets.filter((t) => t.status === "called" && t.id !== currentId);
  const waiting = tickets.filter((t) => t.status === "waiting");
  el.waitingCount.textContent = `(${waiting.length} คน)`;

  const rows = [
    ...open.filter(matches).map(
      (t) => `<li class="row is-called">
        <span class="row-num">${esc(t.number)}</span>
        <span class="row-who"><b>${esc(t.patientName)}</b><span><span class="tag tag-called">ยังเรียกค้างอยู่</span> เรียกเมื่อ ${time(t.calledAt)} น.</span></span>
        <span class="row-act">${actionButton("done", t, "เสร็จสิ้น", "btn-outline")}${actionButton("skip", t, "ข้าม", "btn-outline")}</span>
      </li>`,
    ),
    ...waiting
      .map((t, index) => ({ t, first: index === 0 }))
      .filter(({ t }) => matches(t))
      .map(
        ({ t, first }) => `<li class="row${first ? " is-first" : ""}">
          <span class="row-num">${esc(t.number)}</span>
          <span class="row-who"><b>${esc(t.patientName)}</b><span>${waited(t.createdAt)}${phoneText(t)}</span></span>
          <span class="row-act">${actionButton("call", t, "เรียก", "btn-outline")}</span>
        </li>`,
      ),
  ];

  if (!rows.length) {
    return `<li class="row-empty">${state.query ? `ไม่พบ “${esc(state.query)}”` : "ไม่มีผู้ป่วยรอ"}</li>`;
  }
  return rows.join("");
}

function renderHistory(tickets) {
  const finished = tickets
    .filter((t) => t.status === "done" || t.status === "skipped")
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
  el.historyCount.textContent = `(${finished.length})`;

  const rows = finished.filter(matches).map((t) => {
    const done = t.status === "done";
    return `<li class="row">
      <span class="row-num">${esc(t.number)}</span>
      <span class="row-who"><b>${esc(t.patientName)}</b><span>
        <span class="tag ${done ? "tag-done" : "tag-skipped"}">${done ? "เสร็จสิ้น" : "ข้าม"}</span>
        ${time(t.finishedAt)} น.</span></span>
      <span class="row-act">${done ? "" : actionButton("requeue", t, "นำกลับเข้าคิว", "btn-outline")}</span>
    </li>`;
  });
  return rows.length ? rows.join("") : `<li class="row-empty">ยังไม่มี</li>`;
}

function renderServe() {
  if (!state.summary) return;
  const service = state.summary.services.find((s) => s.id === state.service);
  const mine = state.tickets.filter((t) => t.service === state.service);

  paint(el.now, "now", renderNow(service));
  paint(el.next, "next", renderNext(service));
  paint(el.waiting, "waiting", renderWaiting(mine, service.current?.id));
  paint(el.history, "history", renderHistory(mine));
}

function renderCounts(summary) {
  for (const service of summary.services) {
    $(`[data-tab-count=${service.id}]`).textContent = service.waiting;
    $(`[data-wait=${service.id}]`).textContent = `รอ ${service.waiting} คน`;
  }
  el.totals.textContent = `วันนี้ทั้งหมด ${summary.total} คิว · รอ ${summary.waiting} · กำลังเรียก ${summary.called} · เสร็จ ${summary.done} · ข้าม ${summary.skipped}`;
}

/* ---------- แท็บแผนก ---------- */

function selectService(service, focus = false) {
  state.service = service;
  try {
    localStorage.setItem(SERVICE_KEY, service);
  } catch {}
  el.tabs.forEach((tab) => {
    const on = tab.dataset.service === service;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  });
  renderServe();
}

$("#dept-tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[role=tab]");
  if (tab) selectService(tab.dataset.service);
});

$("#dept-tabs").addEventListener("keydown", (event) => {
  const index = el.tabs.indexOf(document.activeElement);
  if (index < 0 || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  const next = el.tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + el.tabs.length) % el.tabs.length];
  selectService(next.dataset.service, true);
});

selectService(state.service);

el.search.addEventListener("input", () => {
  state.query = el.search.value;
  if (state.query) $("#history-box").open = true;
  renderServe();
});

/* ---------- โหลดข้อมูล ---------- */

async function refresh() {
  try {
    const [summary, list] = await Promise.all([api("/api/summary"), api("/api/queue")]);
    state.summary = summary;
    state.tickets = list.tickets;
    state.loaded = true;
    renderCounts(summary);
    renderServe();
    el.loadError.hidden = true;
    setSync("ok");
  } catch (error) {
    setSync("error");
    if (!state.loaded) {
      el.loadErrorText.textContent = `โหลดข้อมูลไม่สำเร็จ: ${error.message}`;
      el.loadError.hidden = false;
      el.now.innerHTML = "";
    }
  }
}

const refreshNow = poll(refresh, 3000);

$("#retry").addEventListener("click", () => {
  setSync("loading");
  refreshNow();
});

/* ---------- คำสั่ง ---------- */

const post = (url, body = {}) => api(url, { method: "POST", body: JSON.stringify(body) });

const MESSAGE = {
  call: (t) => `เรียก ${t.number} · ${t.patientName}`,
  recall: (t) => `เรียก ${t.number} ซ้ำแล้ว`,
  done: (t) => `${t.number} เสร็จสิ้น`,
  skip: (t) => `ข้าม ${t.number}`,
  requeue: (t) => `${t.number} กลับเข้าคิวรอแล้ว`,
};

async function run(button, task) {
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    const message = await task();
    if (message) toast(message);
    announceChange();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
    await refreshNow();
  }
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-act]");
  if (action) {
    const { act, id } = action.dataset;
    run(action, async () => MESSAGE[act](await post(`/api/queue/${encodeURIComponent(id)}/${act}`)));
    return;
  }
  const next = event.target.closest("[data-next]");
  if (next) {
    const { next: service, finish } = next.dataset;
    run(next, async () => {
      if (finish) await post(`/api/queue/${encodeURIComponent(finish)}/done`);
      return MESSAGE.call(await post("/api/queue/next", { service }));
    });
  }
});

/* ---------- ออกบัตรคิว ---------- */

function validateName() {
  const ok = Boolean(el.name.value.trim());
  el.nameError.textContent = ok ? "" : "กรุณากรอกชื่อผู้ป่วย";
  el.name.toggleAttribute("aria-invalid", !ok);
  return ok;
}

function validatePhone() {
  const tel = el.phone.value.replace(/[\s-]/g, "");
  const ok = !tel || PHONE_RE.test(tel);
  el.phoneError.textContent = ok ? "" : "เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก";
  el.phone.toggleAttribute("aria-invalid", !ok);
  return ok;
}

el.name.addEventListener("input", () => el.name.hasAttribute("aria-invalid") && validateName());
el.phone.addEventListener("blur", validatePhone);
el.phone.addEventListener("input", () => {
  el.phone.value = el.phone.value.replace(/[^\d\s-]/g, "");
  if (el.phone.hasAttribute("aria-invalid")) validatePhone();
});

function slipHTML(ticket, ahead) {
  return `<p class="slip-clinic">คลินิกบ้านใบเตย</p>
    <p class="slip-dept">${esc(ticket.serviceLabel)}</p>
    <p class="slip-number">${esc(ticket.number)}</p>
    <p class="slip-name">${esc(ticket.patientName)}</p>
    <p class="slip-ahead">${ahead ? `มีคิวก่อนหน้า ${ahead} คิว` : "คุณคือคิวถัดไป"}</p>
    <p class="slip-time">${dateFmt.format(new Date(ticket.createdAt))} · ${time(ticket.createdAt)} น.</p>`;
}

el.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.formError.textContent = "";
  const nameOk = validateName();
  const phoneOk = validatePhone();
  if (!nameOk || !phoneOk) {
    (nameOk ? el.phone : el.name).focus();
    return;
  }

  const data = Object.fromEntries(new FormData(el.form));
  el.submit.disabled = true;
  el.submit.setAttribute("aria-busy", "true");
  try {
    const ticket = await post("/api/queue", data);
    const service = state.summary?.services.find((s) => s.id === ticket.service);
    const ahead = (service?.waiting || 0) + (service?.current ? 1 : 0);
    state.lastIssued = { ticket, ahead };

    el.ticket.innerHTML = slipHTML(ticket, ahead);
    el.issued.hidden = false;

    el.form.reset();
    el.form.service.value = data.service;
    el.name.focus();
    toast(`ออกบัตร ${ticket.number} ให้ ${ticket.patientName}`);
    announceChange();
    await refreshNow();
  } catch (error) {
    el.formError.textContent = error.message;
  } finally {
    el.submit.disabled = false;
    el.submit.removeAttribute("aria-busy");
  }
});

$("#issued-close").addEventListener("click", () => {
  el.issued.hidden = true;
  el.name.focus();
});

$("#print-ticket").addEventListener("click", () => {
  if (!state.lastIssued) return;
  el.printSlip.innerHTML = slipHTML(state.lastIssued.ticket, state.lastIssued.ahead);
  window.print();
});

/* ---------- ล้างคิว ---------- */

$("#reset").addEventListener("click", () => el.resetDialog.showModal());

el.resetDialog.addEventListener("close", () => {
  if (el.resetDialog.returnValue !== "ok") return;
  el.issued.hidden = true;
  run(null, async () => {
    await post("/api/queue/reset");
    return "ล้างคิวทั้งหมดแล้ว";
  });
});
