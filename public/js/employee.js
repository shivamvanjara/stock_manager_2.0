import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentSelectedId = null;
let currentMode = "in"; 
let currentEditingId = null; // Tracks if we are editing an existing request

onAuthStateChanged(auth, async (user) => {
    if (!user) { location.href = "login.html"; return; }
    
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists() || snap.data().role !== "employee") {
        // Optional: Redirect non-employees
    }

    loadProducts();
    loadMyRequests();
});

window.logout = () => signOut(auth).then(() => location.href = "login.html");

// --- MODAL CONTROLS ---
window.openActionModal = (id, name, mode) => {
    currentSelectedId = id;
    currentMode = mode;
    currentEditingId = null; // Reset editing mode
    
    const badge = document.getElementById("modalTypeBadge");
    badge.innerText = mode === "in" ? "STOCK IN" : "STOCK OUT";
    badge.className = mode === "in" ? "badge badge-approved" : "badge badge-rejected";
    
    document.getElementById("modalProdName").innerText = name;
    document.getElementById("reqQty").value = "";
    document.getElementById("actionModal").style.display = "flex";
};

// NEW: Open modal for editing a pending request
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

// --- DATABASE ACTIONS ---
window.submitStockRequest = async function() {
    const qty = document.getElementById("reqQty").value;
    if (!qty || qty <= 0) return alert("Enter valid quantity");

    const finalQty = currentMode === "out" ? -Math.abs(qty) : Math.abs(qty);

    try {
        if (currentEditingId) {
            // UPDATE EXISTING PENDING REQUEST
            await updateDoc(doc(db, "requests", currentEditingId), {
                quantity: Number(finalQty),
                updatedAt: serverTimestamp()
            });
            alert("Request Updated!");
        } else {
            // CREATE NEW REQUEST
            await addDoc(collection(db, "requests"), {
                productId: currentSelectedId,
                productName: document.getElementById("modalProdName").innerText,
                quantity: Number(finalQty),
                status: "pending",
                createdBy: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            alert("Request Sent!");
        }
        closeModals();
        loadMyRequests();
    } catch (e) { alert(e.message); }
};

window.submitNewProductRequest = async function() {
    const name = document.getElementById("newProdName").value;
    const qty = document.getElementById("newProdQty").value;
    if (!name || !qty) return alert("Fill all fields");

    await addDoc(collection(db, "requests"), {
        productName: name,
        quantity: Number(qty),
        action: "new_product",
        status: "pending",
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
    });
    closeModals();
    loadMyRequests();
};

// --- DATA RENDERING ---
async function loadProducts() {
    const tbody = document.getElementById("productList");
    const snap = await getDocs(collection(db, "products"));
    tbody.innerHTML = "";
    snap.forEach(d => {
        const p = d.data();
        tbody.innerHTML += `
            <tr>
                <td><strong>${p.name}</strong></td>
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
        const isPending = r.status === "pending";

        box.innerHTML += `
            <div class="req-item">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="font-weight:bold; font-size:0.85rem">${r.productName}</span>
                    <span class="badge badge-${r.status}">${r.status}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:8px;">
                    <div style="font-size:0.8rem; color:#64748b">
                        Type: ${type} | Qty: ${Math.abs(r.quantity)}
                    </div>
                    ${isPending ? `
                        <button onclick="openEditModal('${d.id}', '${r.productName}', ${r.quantity})" 
                                style="border:none; background:none; color:var(--primary); font-weight:bold; cursor:pointer; font-size:0.75rem;">
                            Edit
                        </button>
                    ` : ''}
                </div>
            </div>`;
    });
}

window.searchProduct = () => {
    const val = document.getElementById("search").value.toLowerCase();
    const rows = document.querySelectorAll("#productList tr");
    rows.forEach(r => r.style.display = r.innerText.toLowerCase().includes(val) ? "" : "none");
};