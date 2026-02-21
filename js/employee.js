import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentSelectedId = null;
let currentMode = "in"; 
let currentEditingId = null; 

onAuthStateChanged(auth, async (user) => {
    if (!user) { location.href = "index.html"; return; }
    const snap = await getDoc(doc(db, "users", user.uid));
    loadProducts();
    loadMyRequests();
});

window.logout = () => signOut(auth).then(() => location.href = "index.html");

window.openActionModal = (id, name, mode) => {
    currentSelectedId = id;
    currentMode = mode;
    currentEditingId = null; 
    const badge = document.getElementById("modalTypeBadge");
    badge.innerText = mode === "in" ? "STOCK IN" : "STOCK OUT";
    badge.className = mode === "in" ? "badge badge-approved" : "badge badge-rejected";
    document.getElementById("modalProdName").innerText = name;
    document.getElementById("reqQty").value = "";
    document.getElementById("reqNote").value = ""; // Reset note
    document.getElementById("actionModal").style.display = "flex";
};

window.openEditModal = (reqId, name, qty) => {
    currentEditingId = reqId;
    currentMode = qty >= 0 ? "in" : "out";
    const badge = document.getElementById("modalTypeBadge");
    badge.innerText = "EDIT REQUEST";
    badge.className = "badge badge-pending"; 
    document.getElementById("modalProdName").innerText = name;
    document.getElementById("reqQty").value = Math.abs(qty);
    document.getElementById("actionModal").style.display = "flex";
};

window.openNewProductModal = () => document.getElementById("newProductModal").style.display = "flex";
window.closeModals = () => { 
    document.getElementById("actionModal").style.display = "none"; 
    document.getElementById("newProductModal").style.display = "none";
    currentEditingId = null;
};

window.submitStockRequest = async function() {
    const qty = document.getElementById("reqQty").value;
    const note = document.getElementById("reqNote").value; // Capture note
    if (!qty || qty <= 0) return alert("Enter valid quantity");
    const finalQty = currentMode === "out" ? -Math.abs(qty) : Math.abs(qty);

    try {
        if (currentEditingId) {
            await updateDoc(doc(db, "requests", currentEditingId), {
                quantity: Number(finalQty),
                note: note,
                updatedAt: serverTimestamp()
            });
            alert("Request Updated!");
        } else {
            const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
            const userData = userSnap.exists() ? userSnap.data() : {};
            const empName = userData.name || userData.displayName || auth.currentUser.email || "Unknown Employee";

            await addDoc(collection(db, "requests"), {
                productId: currentSelectedId,
                productName: document.getElementById("modalProdName").innerText,
                employeeName: empName, 
                quantity: Number(finalQty),
                note: note, // Save note to Firestore
                status: "pending",
                createdBy: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            alert("Request Sent!");
        }
        closeModals();
        loadMyRequests();
    } catch (e) { 
        alert("Error: " + e.message); 
    }
};

window.submitNewProductRequest = async function() {
    const name = document.getElementById("newProdName").value;
    const qty = document.getElementById("newProdQty").value;
    if (!name || !qty) return alert("Fill all fields");
    try {
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const empName = userData.name || userData.displayName || auth.currentUser.email || "Unknown Employee";
        await addDoc(collection(db, "requests"), {
            productName: name,
            employeeName: empName,
            quantity: Number(qty),
            action: "new_product",
            status: "pending",
            createdBy: auth.currentUser.uid,
            createdAt: serverTimestamp()
        });
        closeModals();
        loadMyRequests();
    } catch (e) { alert(e.message); }
};

async function loadProducts() {
    const tbody = document.getElementById("productList");
    const snap = await getDocs(collection(db, "products"));
    tbody.innerHTML = "";
    snap.forEach(d => {
        const p = d.data();
        tbody.innerHTML += `
            <tr>
                <td>
                    <strong>${p.name}</strong><br>
                    <small style="color:#64748b">${p.size || 'No Size'}</small>
                </td>
                <td><span style="font-weight:bold">${p.stock}</span></td>
                <td style="text-align:right">
                    <div class="btn-group">
                        <button class="btn-in" onclick="openActionModal('${d.id}', '${p.name}', 'in')">IN</button>
                        <button class="btn-out" onclick="openActionModal('${d.id}', '${p.name}', 'out')">OUT</button>
                    </div>
                </td>
            </tr>`;
    });
}

async function loadMyRequests() {
    const box = document.getElementById("myRequests");
    const user = auth.currentUser;
    if(!user) return;
    const q = query(collection(db, "requests"), where("createdBy", "==", user.uid));
    const snap = await getDocs(q);
    box.innerHTML = "";
    snap.forEach(d => {
        const r = d.data();
        const type = r.quantity > 0 ? "IN" : "OUT";
        box.innerHTML += `
            <div class="req-item">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="font-weight:bold; font-size:0.85rem">${r.productName}</span>
                    <span class="badge badge-${r.status}">${r.status}</span>
                </div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:4px">
                    Qty: ${Math.abs(r.quantity)} | ${type}
                </div>
                ${r.note ? `<div style="font-size:0.7rem; color:#94a3b8; font-style:italic; margin-top:2px;">Note: ${r.note}</div>` : ''}
            </div>`;
    });
}

window.searchProduct = () => {
    const val = document.getElementById("search").value.toLowerCase();
    const rows = document.querySelectorAll("#productList tr");
    rows.forEach(r => r.style.display = r.innerText.toLowerCase().includes(val) ? "" : "none");
};