import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, onSnapshot, addDoc, updateDoc, doc, getDoc, getDocs, 
    serverTimestamp, query, where, deleteDoc, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL STATE ---
let allProducts = [];
let lowStockFilterActive = false;
let itemsLimit = 8; // MOBILE: Start with 8 items for performance

// --- 1. AUTH & INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists() || snap.data().role !== "admin") {
            signOut(auth).then(() => location.href = "index.html");
            return;
        }
        listenProducts();
        listenRequests();
        listenStatsRealtime(); 
    } catch (err) { console.error("Auth Error:", err); }
});

// --- 2. PRODUCT MODAL LOGIC ---
window.openModal = () => {
    document.getElementById("modalTitle").innerText = "Add New Product";
    document.getElementById("editId").value = "";
    document.getElementById("pname").value = "";
    document.getElementById("psize").value = "";
    document.getElementById("pstock").value = "";
    document.getElementById("productModal").style.display = "flex";
};

window.openEditModal = (id) => {
    const p = allProducts.find(x => x.id === id);
    document.getElementById("modalTitle").innerText = "Edit Product";
    document.getElementById("editId").value = id;
    document.getElementById("pname").value = p.name;
    document.getElementById("psize").value = p.size || "";
    document.getElementById("pstock").value = p.stock;
    document.getElementById("productModal").style.display = "flex";
};

window.closeModal = () => {
    document.getElementById("productModal").style.display = "none";
};

window.handleSave = async () => {
    const id = document.getElementById("editId").value;
    const name = document.getElementById("pname").value;
    const size = document.getElementById("psize").value;
    const stock = Number(document.getElementById("pstock").value);

    if (!name || isNaN(stock)) return showToast("Check inputs!");

    const data = { name, size, stock, updatedAt: serverTimestamp() };

    try {
        if (id) {
            await updateDoc(doc(db, "products", id), data);
            showToast("Updated!");
        } else {
            await addDoc(collection(db, "products"), data);
            showToast("Added!");
        }
        closeModal();
    } catch (e) { showToast("Error saving"); }
};

// --- 3. COMPACT STOCK ADJUST (ADMIN QUICK ACTIONS) ---
window.adminAdjust = (prodId, type) => {
    const p = allProducts.find(item => item.id === prodId);
    if (!p) return;

    document.getElementById("stockProdId").value = prodId;
    document.getElementById("stockType").value = type;
    document.getElementById("stockItemName").innerText = `${type}: ${p.name}`;
    document.getElementById("stockAmount").value = "";
    document.getElementById("stockNote").value = ""; 
    
    const confirmBtn = document.getElementById("stockConfirmBtn");
    confirmBtn.style.background = type === 'IN' ? 'var(--success)' : 'var(--danger)';
    confirmBtn.innerText = `Confirm ${type}`;

    document.getElementById("stockModal").style.display = "flex";
};

window.closeStockModal = () => {
    document.getElementById("stockModal").style.display = "none";
};

window.confirmStockAdjust = async () => {
    const prodId = document.getElementById("stockProdId").value;
    const type = document.getElementById("stockType").value;
    const amount = Number(document.getElementById("stockAmount").value);
    const note = document.getElementById("stockNote").value || "Admin Adjustment";
    
    if (!amount || amount <= 0) return showToast("Enter quantity");

    const p = allProducts.find(item => item.id === prodId);
    const qtyChange = type === 'IN' ? amount : -amount;
    const newStock = Number(p.stock) + qtyChange;

    if (newStock < 0) return showToast("Low Stock Error!");

    try {
        await updateDoc(doc(db, "products", prodId), { stock: newStock });
        await addDoc(collection(db, "requests"), {
            productId: prodId,
            productName: p.name,
            employeeName: "Admin",
            quantity: qtyChange,
            status: "approved",
            createdAt: serverTimestamp(),
            processedAt: serverTimestamp(),
            note: note
        });
        
        closeStockModal();
        showToast("Stock Synced");
    } catch (e) { showToast("Error"); }
};

// --- 4. RENDER INVENTORY (8 ITEM LIMIT + PAGINATION) ---
function listenProducts() {
    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderInventory();
    });
}

function renderInventory() {
    const box = document.getElementById("products-list");
    const searchVal = document.getElementById("search").value.toLowerCase();
    if(!box) return;
    box.innerHTML = "";
    
    let filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchVal) || (p.size && p.size.toLowerCase().includes(searchVal));
        const matchesLowStock = lowStockFilterActive ? (Number(p.stock) < 10) : true;
        return matchesSearch && matchesLowStock;
    });

    const displayList = filtered.slice(0, itemsLimit);

    displayList.forEach(p => {
        const isLow = Number(p.stock) < 10;
        const div = document.createElement("div");
        div.className = `item-card ${isLow ? 'low-stock-alert' : ''}`;
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <span style="font-size:0.6rem; font-weight:800; color:#94a3b8;">${p.size || 'N/A'}</span>
                <div>
                    <button onclick="openEditModal('${p.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem;">✏️</button>
                    <button onclick="confirmDelete('${p.id}')" style="background:none; border:none; cursor:pointer; opacity:0.2; font-size:0.8rem;">🗑️</button>
                </div>
            </div>
            <div style="font-weight:700; font-size:0.85rem; color:var(--primary); margin-bottom:4px;">${p.name}</div>
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <div class="stock-tag" style="color: ${isLow ? 'var(--danger)' : 'var(--primary)'}; font-size: 1.2rem;">${p.stock}</div>
                <div style="display:flex; gap:4px;">
                    <button onclick="adminAdjust('${p.id}', 'IN')" style="background:var(--success); color:white; border:none; padding:4px 8px; border-radius:4px; font-weight:800; font-size:0.65rem;">IN</button>
                    <button onclick="adminAdjust('${p.id}', 'OUT')" style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:4px; font-weight:800; font-size:0.65rem;">OUT</button>
                </div>
            </div>
            ${isLow ? '<div style="color:var(--danger); font-size:0.55rem; font-weight:900; margin-top:2px;">⚠️ LOW STOCK</div>' : ''}
        `;
        box.appendChild(div);
    });

    if (filtered.length > itemsLimit) {
        const moreBtn = document.createElement("button");
        moreBtn.className = "btn btn-outline";
        moreBtn.style = "width:100%; margin-top:10px; font-size:0.8rem; grid-column: 1/-1;";
        moreBtn.innerText = `Show More (+${filtered.length - itemsLimit})`;
        moreBtn.onclick = () => { itemsLimit += 12; renderInventory(); };
        box.appendChild(moreBtn);
    }
}

// --- 5. ANALYTICS (PREV MONTH & TOP SELLERS RESTORED) ---
function listenStatsRealtime() {
    const q = query(collection(db, "requests"), where("status", "==", "approved"));
    onSnapshot(q, (snap) => {
        const now = new Date();
        const todayStr = now.toDateString();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        
        const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        let salesMap = {}; 
        let s = { inToday: 0, outToday: 0, inMonth: 0, outMonth: 0, outPrev: 0 };

        snap.forEach(d => {
            const r = d.data();
            const date = r.createdAt?.toDate();
            if(!date) return; 

            const qty = Math.abs(Number(r.quantity));
            const isOut = Number(r.quantity) < 0;

            if (date.toDateString() === todayStr) {
                if (isOut) s.outToday += qty; else s.inToday += qty;
            }
            if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) {
                if (isOut) s.outMonth += qty; else s.inMonth += qty;
            }
            if (date.getMonth() === prevMonth && date.getFullYear() === prevYear) {
                if (isOut) s.outPrev += qty;
            }

            // Top Sellers (Last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            if (isOut && date > thirtyDaysAgo) {
                salesMap[r.productName] = (salesMap[r.productName] || 0) + qty;
            }
        });

        const setVal = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val.toLocaleString(); };
        setVal("inToday", s.inToday); setVal("outToday", s.outToday);
        setVal("inMonth", s.inMonth); setVal("outMonth", s.outMonth);
        setVal("outPrev", s.outPrev);
        updateTopSellersUI(salesMap);
    });
}

function updateTopSellersUI(salesMap) {
    const listContainer = document.getElementById("top-sellers-list");
    if(!listContainer) return;
    const sorted = Object.entries(salesMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 3);
    listContainer.innerHTML = sorted.length > 0 ? "" : "<p style='font-size:0.7rem; color:#94a3b8;'>No sales data</p>";
    sorted.forEach((item, i) => {
        const medals = ["🥇", "🥈", "🥉"];
        const row = document.createElement("div");
        row.style.cssText = "display:flex; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px;";
        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.8rem;">${medals[i]}</span>
                <span style="font-size:0.75rem; color:white; font-weight:600;">${item.name}</span>
            </div>
            <span style="font-size:0.7rem; font-weight:800; color:#818cf8;">${item.qty}</span>`;
        listContainer.appendChild(row);
    });
}

// --- 6. TASKS & SYSTEM ACTIONS ---
function listenRequests() {
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"), limit(20));
    onSnapshot(q, (snap) => {
        const box = document.getElementById("requests");
        const countBadge = document.getElementById("req-count");
        const pendingItems = snap.docs.filter(d => d.data().status === 'pending');
        
        if(countBadge) countBadge.innerText = pendingItems.length;
        if(!box) return;

        box.innerHTML = "";
        snap.forEach(d => {
            const r = d.data();
            const isApproved = r.status === 'approved';
            const div = document.createElement("div");
            
            div.style.cssText = `padding:10px; margin-bottom:8px; border-radius:8px; border-left:4px solid; background:${isApproved ? '#f0fdf4' : '#fff'}`;
            div.style.borderLeftColor = isApproved ? 'var(--success)' : (r.quantity > 0 ? 'var(--success)' : 'var(--danger)');
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; font-size:0.8rem;">${r.productName}</span>
                    <span style="font-weight:900; color:${r.quantity > 0 ? 'var(--success)' : 'var(--danger)'}">${r.quantity > 0 ? '+' : ''}${r.quantity}</span>
                </div>
                <div style="font-size:0.65rem; color:#64748b;">${r.employeeName} • ${r.note || ''}</div>
                ${!isApproved ? `
                    <div style="display:flex; gap:5px; margin-top:8px;">
                        <button class="btn btn-primary" style="padding:4px 8px; font-size:0.65rem; flex:1" onclick="approveRequest('${d.id}', '${r.productId}', ${r.quantity})">Approve</button>
                        <button class="btn btn-outline" style="padding:4px 8px; font-size:0.65rem; flex:1" onclick="rejectRequest('${d.id}')">Reject</button>
                    </div>
                ` : `<div style="color:var(--success); font-size:0.6rem; font-weight:800; margin-top:4px;">✅ APPROVED</div>`}
            `;
            box.appendChild(div);
        });
    });
}

window.approveRequest = async (reqId, prodId, qty) => {
    try {
        await updateDoc(doc(db, "requests", reqId), { status: "approved", processedAt: serverTimestamp() });
        if(prodId && prodId !== "undefined") {
            const pRef = doc(db, "products", prodId);
            const pSnap = await getDoc(pRef);
            if (pSnap.exists()) await updateDoc(pRef, { stock: Number(pSnap.data().stock) + Number(qty) });
        }
        showToast("Approved");
    } catch(e) { console.error(e); }
};

window.rejectRequest = async (id) => {
    await updateDoc(doc(db, "requests", id), { status: "rejected", processedAt: serverTimestamp() });
    showToast("Rejected");
};

window.confirmDelete = async (id) => {
    if (confirm("Delete permanently?")) {
        try {
            await deleteDoc(doc(db, "products", id));
            showToast("Deleted");
        } catch (e) { console.error(e); }
    }
};

window.downloadPDF = async function() {
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF('l', 'mm', 'a4'); 
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    
    const rows = snap.docs.map(d => {
        const r = d.data();
        const dateObj = r.createdAt?.toDate();
        const fullDate = dateObj ? `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : '...';
        return [fullDate, r.employeeName || 'Admin', r.productName || 'N/A', Math.abs(r.quantity), r.quantity > 0 ? 'IN' : 'OUT', r.status.toUpperCase(), r.note || '-' ];
    });

    docPdf.setFontSize(18);
    docPdf.text("Inventory Report", 14, 20);
    docPdf.autoTable({
        startY: 32,
        head: [['Date & Time', 'User', 'Product', 'Qty', 'Type', 'Status', 'Note']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], fontSize: 10 }
    });
    docPdf.save(`Report_${Date.now()}.pdf`);
};

function showToast(msg) {
    const t = document.getElementById("toast");
    if(!t) return;
    t.innerText = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

window.logout = () => signOut(auth).then(() => location.href = "index.html");
window.toggleLowStockFilter = () => { lowStockFilterActive = !lowStockFilterActive; itemsLimit = 8; renderInventory(); };
window.searchProduct = () => { itemsLimit = 8; renderInventory(); };