import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    collection, onSnapshot, addDoc, updateDoc, doc, getDoc, getDocs, 
    serverTimestamp, query, where, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. AUTH PROTECTION ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { location.href = "index.html"; return; }
    
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists() || snap.data().role !== "admin") {
            alert("Access Denied.");
            signOut(auth).then(() => location.href = "index.html");
            return;
        }
        cleanupOldTransactions();
        listenProducts();
        listenRequests();
        listenStatsRealtime(); 
    } catch (err) { console.error("Auth Error:", err); }
});

window.logout = () => signOut(auth).then(() => location.href = "index.html");

// --- 2. HOUSEKEEPING ---
async function cleanupOldTransactions() {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const qReq = query(collection(db, "requests"), where("status", "!=", "pending"), where("createdAt", "<", sixtyDaysAgo));
    const snapReq = await getDocs(qReq);
    snapReq.forEach(d => deleteDoc(doc(db, "requests", d.id)));
}

// --- 3. REAL-TIME ANALYTICS ---
function listenStatsRealtime() {
    const q = query(collection(db, "requests"), where("status", "==", "approved"));
    
    onSnapshot(q, (snap) => {
        const now = new Date();
        const todayStr = now.toDateString();
        const sevenDaysAgo = new Date(); 
        sevenDaysAgo.setDate(now.getDate() - 7);
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

        let s = {
            inToday: 0, in7d: 0, inMonth: 0, inPrev: 0,
            outToday: 0, out7d: 0, outMonth: 0, outPrev: 0
        };

        snap.forEach(d => {
            const r = d.data();
            const date = r.createdAt?.toDate();
            if(!date) return;

            const qty = Number(r.quantity);
            const absQty = Math.abs(qty);
            
            const isToday = date.toDateString() === todayStr;
            const isLast7 = date >= sevenDaysAgo;
            const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
            const isPrevMonth = date.getMonth() === prevMonth && date.getFullYear() === prevMonthYear;

            if (qty > 0) { 
                if (isToday) s.inToday += absQty;
                if (isLast7) s.in7d += absQty;
                if (isCurrentMonth) s.inMonth += absQty;
                if (isPrevMonth) s.inPrev += absQty;
            } else {
                if (isToday) s.outToday += absQty;
                if (isLast7) s.out7d += absQty;
                if (isCurrentMonth) s.outMonth += absQty;
                if (isPrevMonth) s.outPrev += absQty;
            }
        });

        const update = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.innerText = val;
        };
        update("inToday", s.inToday); update("in7", s.in7d); update("inMonth", s.inMonth); update("inPrev", s.inPrev);
        update("outToday", s.outToday); update("out7", s.out7d); update("outMonth", s.outMonth); update("outPrev", s.outPrev);
    });
}

// --- 4. EXPORT ---
window.downloadTransactions = async function() {
    const q = query(collection(db, "requests"), where("status", "!=", "pending"));
    const snap = await getDocs(q);
    let csv = "Date,Employee,Product,Quantity,Type,Status,Note\n";
    snap.forEach(doc => {
        const r = doc.data();
        const type = r.quantity > 0 ? "IN" : "OUT";
        const note = r.note ? r.note.replace(/,/g, " ") : ""; // Remove commas for CSV safety
        csv += `${r.createdAt?.toDate().toLocaleDateString()},${r.employeeName},${r.productName},${Math.abs(r.quantity)},${type},${r.status},${note}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StockReport_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
};

// --- 5. LISTENERS ---
function listenProducts() {
    onSnapshot(collection(db, "products"), (snap) => {
        const box = document.getElementById("products");
        box.innerHTML = "";
        snap.forEach(d => {
            const p = d.data();
            const isLow = p.stock < 5; 
            
            box.innerHTML += `
                <div class="prod-card ${isLow ? 'low-stock' : ''}" style="border-top: 4px solid ${isLow ? '#f43f5e' : '#10b981'}">
                    <div style="display:flex; justify-content:space-between">
                        <small style="font-weight:800; color:#64748b">SIZE: ${p.size || 'N/A'}</small>
                        <div>
                            <button onclick="editProductDirectly('${d.id}', '${p.name}', ${p.stock})" style="font-size:0.6rem">EDIT</button>
                            <button onclick="deleteProduct('${d.id}', '${p.name}')" style="font-size:0.6rem; color:red">DEL</button>
                        </div>
                    </div>
                    <div style="font-weight:800; margin:5px 0">${p.name}</div>
                    <span class="stock-badge">${p.stock}</span>
                    ${isLow ? '<br><small style="color:#f43f5e; font-weight:700; font-size:0.6rem">⚠️ LOW STOCK</small>' : ''}
                </div>`;
        });
    });
}

function listenRequests() {
    const q = query(collection(db, "requests"), where("status", "==", "pending"));
    onSnapshot(q, (snap) => {
        const box = document.getElementById("requests");
        box.innerHTML = snap.empty ? "<p style='text-align:center;color:#94a3b8'>Clear!</p>" : "";
        snap.forEach(d => {
            const r = d.data();
            box.innerHTML += `
                <div class="req-item" style="border-left: 4px solid ${r.quantity > 0 ? '#10b981' : '#f43f5e'}">
                    <small style="color:var(--primary); font-weight:bold;">@${r.employeeName}</small>
                    <div style="font-weight:800">${r.productName} (x${Math.abs(r.quantity)})</div>
                    
                    ${r.note ? `<div style="font-size:0.75rem; background:#f1f5f9; padding:6px; border-radius:4px; margin-top:6px; color:#475569; border: 1px dashed #cbd5e1">📝 ${r.note}</div>` : ''}

                    <div style="display:flex; gap:5px; margin-top:10px">
                        <button class="btn-approve" onclick="approveRequest('${d.id}', '${r.productId}', ${r.quantity})">OK</button>
                        <button class="btn-reject" onclick="rejectRequest('${d.id}')">X</button>
                    </div>
                </div>`;
        });
    });
}

// --- 6. ACTIONS ---
window.approveRequest = async (reqId, prodId, qty) => {
    try {
        await updateDoc(doc(db, "requests", reqId), { status: "approved", processedAt: serverTimestamp() });
        // Only update stock if it's a standard stock request (has prodId)
        if(prodId && prodId !== "undefined") {
            const pRef = doc(db, "products", prodId);
            const pSnap = await getDoc(pRef);
            if (pSnap.exists()) await updateDoc(pRef, { stock: Number(pSnap.data().stock) + Number(qty) });
        }
    } catch(e) { alert(e.message); }
};

window.rejectRequest = async (id) => {
    if(confirm("Reject this request?")) {
        await updateDoc(doc(db, "requests", id), { status: "rejected", processedAt: serverTimestamp() });
    }
};

window.deleteProduct = async (id, name) => {
    if(confirm(`Delete ${name} forever?`)) {
        await deleteDoc(doc(db, "products", id));
    }
};

window.addProduct = async function() {
    const name = document.getElementById("pname").value;
    const size = document.getElementById("psize").value; 
    const stock = document.getElementById("pstock").value;
    if(!name || !stock) return alert("Fill Name and Stock");
    await addDoc(collection(db, "products"), { 
        name, 
        size: size || "N/A", 
        stock: Number(stock), 
        updatedAt: serverTimestamp() 
    });
    document.getElementById("pname").value = ""; 
    document.getElementById("pstock").value = ""; 
    document.getElementById("psize").value = "";
};

window.searchProduct = () => {
    const val = document.getElementById("search").value.toLowerCase();
    document.querySelectorAll(".prod-card").forEach(c => {
        c.style.display = c.innerText.toLowerCase().includes(val) ? "" : "none";
    });
};

window.editProductDirectly = async (id, name, cur) => {
    const val = prompt(`Update stock for ${name}:`, cur);
    if (val !== null && val !== "") await updateDoc(doc(db, "products", id), { stock: Number(val) });
};