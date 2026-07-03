

```js
/* NovaPayout — simple front-end demo (Supabase auth + basic UI wiring)
   NOTE: This file expects:
   - index.html
   - styles.css
   - config.js (window.NOVAPAYOUT_CONFIG)
*/

const C = window.NOVAPAYOUT_CONFIG;
if (!C) alert("Missing config.js (NOVAPAYOUT_CONFIG).");

const $ = (id) => document.getElementById(id);
const fmt = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");

const screens = {
  auth: $("screenAuth"),
  dash: $("screenDash"),
  withdraw: $("screenWithdraw"),
  upgrade: $("screenUpgrade"),
  admin: $("screenAdmin"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function toast(title, desc = "") {
  const host = $("toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<div class="t">${title}</div>${desc ? `<div class="d">${desc}</div>` : ""}`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function addNotif(title, desc) {
  const list = $("notifList");
  const el = document.createElement("div");
  el.className = "notif";
  el.innerHTML = `<div class="t">${title}</div><div class="d">${desc}</div>`;
  list.prepend(el);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeReferralCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const b = "23456789";
  const pick = (s) => s[rand(0, s.length - 1)];
  return `${pick(a)}${pick(a)}${pick(a)}-${pick(b)}${pick(b)}${pick(a)}${pick(b)}`;
}

function isAdmin(email) {
  return (email || "").toLowerCase() === (C.adminEmail || "").toLowerCase();
}

// Supabase client (loaded from CDN in index.html)
const supabase = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);

// --- UI: tabs
$("tabLogin").onclick = () => {
  $("tabLogin").classList.add("active");
  $("tabSignup").classList.remove("active");
  $("formLogin").classList.remove("hidden");
  $("formSignup").classList.add("hidden");
};
$("tabSignup").onclick = () => {
  $("tabSignup").classList.add("active");
  $("tabLogin").classList.remove("active");
  $("formSignup").classList.remove("hidden");
  $("formLogin").classList.add("hidden");
};

// --- OTP flow (email)
let pendingEmail = null;

$("formSignup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("signupName").value.trim();
  const email = $("signupEmail").value.trim();
  const password = $("signupPassword").value;
  const ref = $("signupRef").value.trim();

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, referral_input: ref || null },
        emailRedirectTo: window.location.href,
      },
    });
    if (error) throw error;

    pendingEmail = email;
    $("otpEmailLabel").textContent = email;
    $("formSignup").classList.add("hidden");
    $("formOtp").classList.remove("hidden");
    toast("OTP sent", "Check your email for the 6-digit code.");
  } catch (err) {
    toast("Signup failed", String(err.message || err));
  }
});

$("btnResendOtp").addEventListener("click", async () => {
  if (!pendingEmail) return toast("No email", "Please sign up again.");
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
    });
    if (error) throw error;
    toast("OTP resent", "Check your email again.");
  } catch (err) {
    toast("Resend failed", String(err.message || err));
  }
});

$("formOtp").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("otpCode").value.trim();
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token,
      type: "signup",
    });
    if (error) throw error;
    toast("Verified", "Email verified successfully.");
    pendingEmail = null;
    $("formOtp").classList.add("hidden");
    $("formLogin").classList.remove("hidden");
    $("tabLogin").click();
  } catch (err) {
    toast("OTP failed", String(err.message || err));
  }
});

// --- Login / logout
$("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    toast("Welcome back", "Logged in.");
  } catch (err) {
    toast("Login failed", String(err.message || err));
  }
});

$("btnLogout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  toast("Logged out");
});

// --- Forgot password (simple)
$("btnForgot").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  if (!email) return toast("Enter email", "Type your email then tap Forgot password.");
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href,
    });
    if (error) throw error;
    toast("Reset email sent", "Check your inbox.");
  } catch (err) {
    toast("Failed", String(err.message || err));
  }
});

// --- Local user state (until DB tables are added)
function loadLocalProfile(user) {
  const key = `np_profile_${user.id}`;
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);

  const profile = {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || "User",
    level: "Bronze",
    balance: 0,
    withdrawnToday: 0,
    referralCode: makeReferralCode(),
    suspended: false,
  };
  localStorage.setItem(key, JSON.stringify(profile));
  return profile;
}

function saveLocalProfile(profile) {
  const key = `np_profile_${profile.id}`;
  localStorage.setItem(key, JSON.stringify(profile));
}

function dailyLimitFor(level) {
  const L = C.levels[level];
  if (!L) return 0;
  return L.dailyLimit === Infinity ? Infinity : Number(L.dailyLimit);
}

// --- Mining
let miningTimer = null;

$("btnMine").addEventListener("click", async () => {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  const profile = loadLocalProfile(user);
  if (profile.suspended) return toast("Account suspended", "Contact support.");

  if (miningTimer) return toast("Mining already running", "Please wait for it to finish.");

  const mins = Number(C.mining.intervalMinutes || 5);
  $("btnMine").textContent = `Mining... (${mins} mins)`;
  $("btnMine").disabled = true;

  miningTimer = setTimeout(() => {
    profile.balance += Number(C.mining.amountPerMine || 35000);
    saveLocalProfile(profile);
    renderDash(profile);
    addNotif("Mining complete", `You earned ${fmt(C.mining.amountPerMine)}.`);
    toast("Mining complete", `+${fmt(C.mining.amountPerMine)}`);
    $("btnMine").textContent = "Start Mining (5 mins)";
    $("btnMine").disabled = false;
    miningTimer = null;
  }, mins * 60 * 1000);

  addNotif("Mining started", `Come back in ${mins} minutes.`);
  toast("Mining started", `Earning ${fmt(C.mining.amountPerMine)} in ${mins} minutes.`);
});

// --- Navigation buttons
$("btnWithdraw").onclick = () => showScreen("withdraw");
$("btnUpgrade").onclick = () => showScreen("upgrade");
$("btnBackDash1").onclick = () => showScreen("dash");
$("btnBackDash2").onclick = () => showScreen("dash");
$("btnBackDash3").onclick = () => showScreen("dash");

$("btnClearNotifs").onclick = () => ($("notifList").innerHTML = "");

// Bottom nav
document.querySelectorAll(".navBtn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".navBtn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    const nav = b.dataset.nav;
    if (nav === "admin") showScreen("admin");
    else showScreen("dash");
  });
});

// Copy referral
$("btnCopyRef").addEventListener("click", async () => {
  const txt = $("refLink").textContent;
  try {
    await navigator.clipboard.writeText(txt);
    toast("Copied", "Referral link copied.");
  } catch {
    toast("Copy failed", "Your browser blocked clipboard.");
  }
});

// --- Withdraw submit (stores request locally for now)
$("formWithdraw").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  const profile = loadLocalProfile(user);
  const amount = Number($("wAmount").value || 0);
  const limit = dailyLimitFor(profile.level);

  if (profile.suspended) return toast("Account suspended", "Contact support.");
  if (amount <= 0) return toast("Invalid amount");
  if (amount > profile.balance) return toast("Insufficient balance", "Mine more to increase balance.");
  if (limit !== Infinity && profile.withdrawnToday + amount > limit) {
    return toast("Daily limit reached", `Your ${profile.level} limit is ${fmt(limit)} per day.`);
  }

  // Receipt file is required but we won't upload yet (needs storage + DB)
  const receipt = $("wReceipt").files?.[0];
  if (!receipt) return toast("Receipt required", "Upload your payment receipt.");

  // Save a pending request locally (admin will approve later once we add DB)
  const reqKey = "np_withdraw_requests";
  const list = JSON.parse(localStorage.getItem(reqKey) || "[]");
  list.unshift({
    id: crypto.randomUUID(),
    type: "WITHDRAW_ID",
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    amount,
    bank: {
      accountName: $("wAcctName").value.trim(),
      accountNumber: $("wAcctNumber").value.trim(),
      bankName: $("wBankName").value.trim(),
    },
    receiptName: receipt.name,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(reqKey, JSON.stringify(list));

  addNotif("Withdrawal submitted", "Pending admin approval for Withdrawal ID.");
  toast("Submitted", "Wait for admin approval.");
  $("formWithdraw").reset();
  showScreen("dash");
});

// --- Upgrade submit (local pending)
document.querySelectorAll(".level").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("uLevel").value = btn.dataset.level;
    toast("Selected", `Upgrade to ${btn.dataset.level}`);
  });
});

$("formUpgrade").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  const profile = loadLocalProfile(user);
  if (profile.suspended) return toast("Account suspended", "Contact support.");

  const level = $("uLevel").value;
  if (!level) return toast("Select a level", "Tap a level first.");
  const receipt = $("uReceipt").files?.[0];
  if (!receipt) return toast("Receipt required", "Upload your receipt.");

  const reqKey = "np_upgrade_requests";
  const list = JSON.parse(localStorage.getItem(reqKey) || "[]");
  list.unshift({
    id: crypto.randomUUID(),
    type: "UPGRADE",
    userId: profile.id,
    email: profile.email,
    name: profile.name,
    level,
    receiptName: receipt.name,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(reqKey, JSON.stringify(list));

  addNotif("Upgrade submitted", "Pending admin approval.");
  toast("Submitted", "Wait for admin approval.");
  $("formUpgrade").reset();
  $("uLevel").value = "";
  showScreen("dash");
});

// --- Admin panel (local demo)
function renderAdmin(user) {
  const adminOk = isAdmin(user.email);
  $("navAdmin").style.display = adminOk ? "block" : "none";
  if (!adminOk) return;

  const w = JSON.parse(localStorage.getItem("np_withdraw_requests") || "[]");
  const u = JSON.parse(localStorage.getItem("np_upgrade_requests") || "[]");

  $("adminWithdrawals").innerHTML = w.length
    ? w.map((r) => adminItemHtml(r, "withdraw")).join("")
    : `<div class="muted tiny">No pending items.</div>`;

  $("adminUpgrades").innerHTML = u.length
    ? u.map((r) => adminItemHtml(r, "upgrade")).join("")
    : `<div class="muted tiny">No pending items.</div>`;

  // Users list (local)
  const users = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("np_profile_")) {
      try { users.push(JSON.parse(localStorage.getItem(k))); } catch {}
    }
  }
  $("adminUsers").innerHTML = users.length
    ? users.map(userItemHtml).join("")
    : `<div class="muted tiny">No users yet.</div>`;

  // bind buttons
  bindAdminButtons();
}

function adminItemHtml(r, kind) {
  return `
  <div class="adminItem" data-kind="${kind}" data-id="${r.id}">
    <div class="row between">
      <div>
        <div class="h3">${kind === "withdraw" ? "Withdrawal ID" : "Upgrade"} • ${r.status}</div>
        <div class="tiny muted">${r.name} • ${r.email}</div>
        <div class="tiny muted">Receipt: ${r.receiptName}</div>
        ${kind === "withdraw" ? `<div class="tiny muted">Amount: ${fmt(r.amount)}</div>` : `<div class="tiny muted">Level: ${r.level}</div>`}
      </div>
      <div class="row">
        <button class="smallBtn good" data-action="approve">Approve</button>
        <button class="smallBtn bad" data-action="reject">Reject</button>
      </div>
    </div>
  </div>`;
}

function userItemHtml(p) {
  const lim = dailyLimitFor(p.level);
  return `
  <div class="adminItem" data-user="${p.id}">
    <div class="row between">
      <div>
        <div class="h3">${p.name} • ${p.level}</div>
        <div class="tiny muted">${p.email}</div>
        <div class="tiny muted">Balance: ${fmt(p.balance)} • Limit: ${lim === Infinity ? "Unlimited" : fmt(lim)}</div>
      </div>
      <div class="row">
        <button class="smallBtn warn" data-action="toggleSuspend">${p.suspended ? "Unsuspend" : "Suspend"}</button>
      </div>
    </div>
  </div>`;
}

function bindAdminButtons() {
  document.querySelectorAll(".adminItem .smallBtn").forEach((btn) => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      const item = btn.closest(".adminItem");
      const kind = item.dataset.kind;

      if (action === "toggleSuspend") {
        const userId = item.dataset.user;
        const key = `np_profile_${userId}`;
        const p = JSON.parse(localStorage.getItem(key));
        p.suspended = !p.suspended;
        localStorage.setItem(key, JSON.stringify(p));
        toast("Updated", p.suspended ? "User suspended." : "User unsuspended.");
        renderAdmin({ email: C.adminEmail });
        return;
      }

      const id = item.dataset.id;
      if (kind === "withdraw") {
        const list = JSON.parse(localStorage.getItem("np_withdraw_requests") || "[]");
        const r = list.find((x) => x.id === id);
        if (!r) return;

        r.status = action === "approve" ? "APPROVED" : "REJECTED";
        localStorage.setItem("np_withdraw_requests", JSON.stringify(list));
        toast("Updated", `Withdrawal request ${r.status}.`);
        // Email sending + real Withdrawal ID will be added when we add Netlify function + DB.
        renderAdmin({ email: C.adminEmail });
      }

      if (kind === "upgrade") {
        const list = JSON.parse(localStorage.getItem("np_upgrade_requests") || "[]");
        const r = list.find((x) => x.id === id);
        if (!r) return;

        r.status = action === "approve" ? "APPROVED" : "REJECTED";
        localStorage.setItem("np_upgrade_requests", JSON.stringify(list));

        if (r.status === "APPROVED") {
          const key = `np_profile_${r.userId}`;
          const p = JSON.parse(localStorage.getItem(key));
          p.level = r.level;
          localStorage.setItem(key, JSON.stringify(p));
        }

        toast("Updated", `Upgrade request ${r.status}.`);
        renderAdmin({ email: C.adminEmail });
      }
    };
  });
}

// --- Social proof
let spTimer = null;
function startSocialProof() {
  if (!C.socialProof?.enabled) return;
  const box = $("socialProof");
  const names = C.socialProof.names || [];
  const cities = C.socialProof.cities || [];

  const tick = () => {
    const name = names[rand(0, names.length - 1)] || "User";
    const city = cities[rand(0, cities.length - 1)] || "Nigeria";
    const amt = rand(C.socialProof.amountMin || 15000, C.socialProof.amountMax || 90000);
    box.innerHTML = `<div class="t">${name} from ${city}</div><div class="d">just withdrew ${fmt(amt)}.</div>`;
    box.classList.remove("hidden");
    setTimeout(() => box.classList.add("hidden"), 6500);

    const next = rand(C.socialProof.everyMsMin || 20000, C.socialProof.everyMsMax || 45000);
    spTimer = setTimeout(tick, next);
  };

  const first = rand(8000, 14000);
  spTimer = setTimeout(tick, first);
}

// --- Render dashboard
function renderDash(profile) {
  $("dashName").textContent = profile.name;
  $("dashLevel").textContent = profile.level;
  $("dashBalance").textContent = fmt(profile.balance);
  $("dashWithdrawnToday").textContent = fmt(profile.withdrawnToday);

  const lim = dailyLimitFor(profile.level);
  $("dashDailyLimit").textContent = lim === Infinity ? "Unlimited" : fmt(lim);

  const ref = `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(profile.referralCode)}`;
  $("refLink").textContent = ref;
}

// --- Session watcher
supabase.auth.onAuthStateChange(async (_event, session) => {
  const user = session?.user;
  if (!user) {
    $("btnLogout").classList.add("hidden");
    showScreen("auth");
    return;
  }

  $("btnLogout").classList.remove("hidden");

  // Create/load local profile
  const profile = loadLocalProfile(user);

  // Referral capture (first visit)
  const url = new URL(window.location.href);
  const ref = url.searchParams.get("ref");
  if (ref && !profile.refCaptured) {
    profile.refCaptured = ref;
    profile.balance += Number(C.referral.bonusAmount || 5000);
    saveLocalProfile(profile);
    addNotif("Referral bonus", `You received ${fmt(C.referral.bonusAmount)}.`);
  }

  renderDash(profile);
  renderAdmin(user);
  showScreen("dash");
  startSocialProof();
});

// Initial screen
showScreen("auth");
```

