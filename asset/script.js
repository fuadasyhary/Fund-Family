    const firebaseConfig = {
        apiKey: "AIzaSyDt0WscAnI4LJSRXMUqEabrIkYDBPt4qfA",
        authDomain: "fund-family-ff366.firebaseapp.com",
        projectId: "fund-family-ff366",
        storageBucket: "fund-family-ff366.firebasestorage.app",
        messagingSenderId: "868950298235",
        appId: "1:868950298235:web:0db67b77b4ad6fb8d4dcde",
        measurementId: "G-36PLWL3THY"
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch((error) => {
        console.error("Gagal mengatur persistence session:", error);
    });

    db.enablePersistence().catch((err) => {
        if (err.code == 'unimplemented') {
            console.log('Browser tidak mendukung persistence cache.');
        }
    });

    let isEditMode = false;
    let idEditSekarang = '';

    let base64ImageToSend = '';
    let base64TabunganImage = '';
    let base64BuktiImage = '';
    let base64HutangJaminanImage = '';
    let base64HutangKtpImage = '';
    let base64NewUserImage = '';
    let base64EditUserImage = '';
    let base64AnakEditImage = '';

    let cryptoProfitChartInstance = null;
    let debtPelunasanChartInstance = null;
    let familyDebtPelunasanChartInstance = null;
    let pieChartInstance = null;
    let cacheDataAset = [];

    let latestPnlByUser = { 'Ayah': 0, 'Bunda': 0, 'Anak': 0 };
    let latestDebtSummary = { totalHutang: 0, totalTerbayar: 0, sisaHutang: 0, debtors: [] };
    let latestFamilyDebtSummary = { totalHutang: 0, totalTerbayar: 0, sisaHutang: 0, debtors: [] };
    let currentUserJenisAkun = '';

    let activeChatTarget = 'group'; 
    let activeChatName = 'Chat Keluarga Realtime';
    let unsubscribeChat = null;
    let unsubscribeTyping = null;
    let typingTimeout = null;
    let lastMessageCount = 0;
    let initialLoadComplete = false;

    function toggleTheme() {
        const htmlRoot = document.getElementById('html-root');
        const bodyRoot = document.getElementById('body-root');
        const themeIcon = document.getElementById('theme-icon');

        if (htmlRoot.classList.contains('dark')) {
            htmlRoot.classList.remove('dark');
            bodyRoot.className = "bg-gray-100 text-gray-900 font-sans pb-20 transition-colors duration-300";
            if(themeIcon) themeIcon.innerText = '🌙';
            localStorage.setItem('theme', 'light');
        } else {
            htmlRoot.classList.add('dark');
            bodyRoot.className = "bg-slate-900 text-gray-100 font-sans pb-20 transition-colors duration-300";
            if(themeIcon) themeIcon.innerText = '☀️';
            localStorage.setItem('theme', 'dark');
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const savedTheme = localStorage.getItem('theme');
        const htmlRoot = document.getElementById('html-root');
        const bodyRoot = document.getElementById('body-root');
        const themeIcon = document.getElementById('theme-icon');

        if (savedTheme === 'light') {
            htmlRoot.classList.remove('dark');
            bodyRoot.className = "bg-gray-100 text-gray-900 font-sans pb-20 transition-colors duration-300";
            if(themeIcon) themeIcon.innerText = '🌙';
        } else {
            htmlRoot.classList.add('dark');
            bodyRoot.className = "bg-slate-900 text-gray-100 font-sans pb-20 transition-colors duration-300";
            if(themeIcon) themeIcon.innerText = '☀️';
        }
        
        fetchCryptoNews();
        inisialisasiRealtimeAset();
    });

    function handleLoginKeyPress(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            login();
        }
    }

    function login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorText = document.getElementById('login-error');

        if(!email || !password) {
            errorText.innerText = "Semua field harus diisi!";
            errorText.classList.remove('hidden');
            return;
        }

        const loader = document.getElementById('loader');
        loader.classList.remove('hidden', 'fade-out');
        
        auth.signInWithEmailAndPassword(email, password).catch((err) => {
            loader.classList.add('hidden');
            errorText.innerText = "Gagal login: Cek kembali email & password.";
            errorText.classList.remove('hidden');
        });
    }

    function logout() { 
        if (auth.currentUser) {
            db.collection("users").doc(auth.currentUser.uid).update({ isOnline: false }).catch(() => {});
        }
        auth.signOut(); 
    }

    const loader = document.getElementById('loader');
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const debtorDashboardSection = document.getElementById('debtor-dashboard-section');

    auth.onAuthStateChanged((user) => {
        loader.classList.add('fade-out');
        setTimeout(() => loader.classList.add('hidden'), 500);

        if (user) {
            loginSection.classList.add('hidden');
            setupPresence(user);
            muatProfilPenggunaDanAturTampilan(user);
        } else {
            loginSection.classList.remove('hidden');
            dashboardSection.classList.add('hidden');
            debtorDashboardSection.classList.add('hidden');
            document.getElementById('floating-chat-wrapper').classList.add('hidden');
        }
    });

    function setupPresence(user) {
        const userRef = db.collection("users").doc(user.uid);
        userRef.set({ isOnline: true, email: user.email, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
        
        const heartbeat = setInterval(() => {
            if (auth.currentUser) {
                db.collection("users").doc(auth.currentUser.uid).update({
                    email: auth.currentUser.email,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});
            } else {
                clearInterval(heartbeat);
            }
        }, 30000);

        window.addEventListener('beforeunload', () => {
            if (auth.currentUser) {
                db.collection("users").doc(auth.currentUser.uid).update({ isOnline: false }).catch(() => {});
            }
        });
    }

    function muatProfilPenggunaDanAturTampilan(user) {
        const userDocRef = db.collection("users").doc(user.uid);
        userDocRef.get().then((docSnap) => {
            if (!docSnap.exists) {
                userDocRef.set({
                    nama: user.email.split('@')[0],
                    email: user.email,
                    jenisAkun: 'Ayah',
                    foto: '',
                    isOnline: true
                }, { merge: true });
            } else {
                userDocRef.update({ email: user.email }).catch(()=>{});
            }
        });

        userDocRef.onSnapshot((doc) => {
            const displayNameEl = document.getElementById('user-display-name');
            const accTypeEl = document.getElementById('user-account-type');
            const photoEl = document.getElementById('user-photo');
            const initialEl = document.getElementById('user-initial');

            if (doc.exists) {
                const data = doc.data();
                const nama = data.nama || user.email.split('@')[0];
                const jenisAkun = data.jenisAkun || 'Keluarga';
                currentUserJenisAkun = jenisAkun;

                const formAreaEl = document.getElementById('form-area');
                const debtSectionEl = document.getElementById('debt-section-wrapper');
                const debtChartCard = document.getElementById('debt-chart-card');
                const familyDebtChartCard = document.getElementById('family-debt-chart-card');

                if (jenisAkun === 'Penghutang') {
                    dashboardSection.classList.add('hidden');
                    debtorDashboardSection.classList.remove('hidden');
                    document.getElementById('floating-chat-wrapper').classList.remove('hidden');
                    document.getElementById('debtor-display-name').innerText = nama;
                    muatDataHutangPenghutang(user.email, nama);
                    muatDataChat();
                } else {
                    debtorDashboardSection.classList.add('hidden');
                    dashboardSection.classList.remove('hidden');
                    document.getElementById('floating-chat-wrapper').classList.remove('hidden');

                    if (jenisAkun === 'Anak') {
                        if (formAreaEl) formAreaEl.classList.add('hidden');
                        if (debtSectionEl) debtSectionEl.classList.add('hidden');
                        if (debtChartCard) debtChartCard.classList.add('hidden');
                        if (familyDebtChartCard) familyDebtChartCard.className = "bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 md:col-span-2";
                    } else {
                        if (formAreaEl) formAreaEl.classList.remove('hidden');
                        if (debtSectionEl) debtSectionEl.classList.remove('hidden');
                        if (debtChartCard) debtChartCard.classList.remove('hidden');
                        if (familyDebtChartCard) familyDebtChartCard.className = "bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700";
                    }

                    if(displayNameEl) displayNameEl.innerText = nama;
                    if(accTypeEl) accTypeEl.innerText = jenisAkun;

                    if (data.foto && data.foto !== '') {
                        if(photoEl) {
                            photoEl.src = data.foto;
                            photoEl.classList.remove('hidden');
                        }
                        if(initialEl) initialEl.classList.add('hidden');
                    } else {
                        if(photoEl) photoEl.classList.add('hidden');
                        if(initialEl) {
                            initialEl.classList.remove('hidden');
                            initialEl.innerText = nama.charAt(0).toUpperCase();
                        }
                    }

                    muatDataTransaksi();
                    muatDataTabungan();
                    muatDataCrypto();
                    muatDataHutangKeluarga();
                    muatDataChat(); 
                    if (jenisAkun !== 'Anak') {
                        muatDataHutang();
                    }

                    setTimeout(() => {
                        renderCryptoProfitChart(latestPnlByUser);
                        if (jenisAkun !== 'Anak') {
                            renderDebtPelunasanChart(latestDebtSummary);
                        }
                        renderFamilyDebtPelunasanChart(latestFamilyDebtSummary);
                    }, 300);
                }
            }
        });
    }

    function bukaModalProfil() {
        const adminSec = document.getElementById('admin-user-management-section');
        const anakSec = document.getElementById('anak-self-edit-section');
        const headerTitle = document.getElementById('modal-profil-header-title');

        if (currentUserJenisAkun === 'Anak') {
            if(headerTitle) headerTitle.innerText = "✏️ Edit Profil Akun Saya";
            if(adminSec) adminSec.classList.add('hidden');
            if(anakSec) anakSec.classList.remove('hidden');

            db.collection("users").doc(auth.currentUser.uid).get().then((docSnap) => {
                if(docSnap.exists) {
                    const data = docSnap.data();
                    document.getElementById('anak-edit-nama').value = data.nama || '';
                    document.getElementById('anak-edit-password').value = '';
                    base64AnakEditImage = data.foto || '';
                    if(base64AnakEditImage) {
                        document.getElementById('anak-edit-foto-preview').src = base64AnakEditImage;
                        document.getElementById('anak-edit-foto-preview').classList.remove('hidden');
                        document.getElementById('anak-edit-foto-icon').classList.add('hidden');
                    } else {
                        document.getElementById('anak-edit-foto-preview').classList.add('hidden');
                        document.getElementById('anak-edit-foto-icon').classList.remove('hidden');
                    }
                }
            });
        } else {
            if(headerTitle) headerTitle.innerText = "👥 Manajemen List Akun & Detail Keluarga";
            if(adminSec) adminSec.classList.remove('hidden');
            if(anakSec) anakSec.classList.add('hidden');
            muatListUserManajemen();
        }

        document.getElementById('modal-profil').classList.remove('hidden');
    }

    function tutupModalProfil() {
        document.getElementById('modal-profil').classList.add('hidden');
    }

    function previewAnakEditFoto(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                base64AnakEditImage = e.target.result;
                document.getElementById('anak-edit-foto-preview').src = base64AnakEditImage;
                document.getElementById('anak-edit-foto-preview').classList.remove('hidden');
                document.getElementById('anak-edit-foto-icon').classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function simpanAnakSelfProfile() {
        const namaBaru = document.getElementById('anak-edit-nama').value.trim();
        const passwordBaru = document.getElementById('anak-edit-password').value.trim();

        if (!namaBaru) return alert("Nama tidak boleh kosong!");

        db.collection("users").doc(auth.currentUser.uid).update({
            nama: namaBaru,
            foto: base64AnakEditImage || ''
        }).then(() => {
            if (passwordBaru && auth.currentUser) {
                return auth.currentUser.updatePassword(passwordBaru);
            }
        }).then(() => {
            alert("Profil Anda berhasil diperbarui!");
            tutupModalProfil();
        }).catch(err => {
            alert("Gagal memperbarui profil: " + err.message);
            tutupModalProfil();
        });
    }

    function muatListUserManajemen() {
        db.collection("users").onSnapshot((snapshot) => {
            const tbody = document.getElementById('tabel-list-user-manajemen');
            if(!tbody) return;
            tbody.innerHTML = '';

            snapshot.forEach((doc) => {
                const data = doc.data();
                const uid = doc.id;
                const nama = data.nama || 'Tanpa Nama';
                const email = data.email || '-';
                const jenisAkun = data.jenisAkun || 'Keluarga';
                const foto = data.foto;

                let fotoHtml = `<div class="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">${nama.charAt(0).toUpperCase()}</div>`;
                if (foto) {
                    fotoHtml = `<img src="${foto}" class="h-8 w-8 rounded-full object-cover border border-slate-600">`;
                }

                let safeNama = nama.replace(/'/g, "\\'");
                let safeJenis = jenisAkun.replace(/'/g, "\\'");
                let safeFoto = (foto || '').replace(/'/g, "\\'");

                tbody.innerHTML += `
                    <tr class="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td class="p-3 flex items-center gap-2">
                            ${fotoHtml}
                            <span class="font-bold">${nama}</span>
                        </td>
                        <td class="p-3 text-gray-500 dark:text-gray-400">${email}</td>
                        <td class="p-3"><span class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2.5 py-1 rounded-full font-semibold text-[10px]">${jenisAkun}</span></td>
                        <td class="p-3 text-center">
                            <div class="flex justify-center gap-1.5">
                                <button onclick="bukaModalEditUserDetail('${uid}', '${safeNama}', '${email}', '${safeJenis}', '${safeFoto}')" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition">Edit</button>
                                <button onclick="hapusUserKeluarga('${uid}', '${safeNama}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition">Hapus</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        });
    }

    function hapusUserKeluarga(uid, nama) {
        if (confirm(`Hapus akun user ${nama} dari daftar sistem?`)) {
            db.collection("users").doc(uid).delete().then(() => {
                alert("Akun berhasil dihapus!");
            }).catch(err => alert("Gagal menghapus: " + err.message));
        }
    }

    function bukaModalEditUserDetail(uid, nama, email, jenisAkun, foto) {
        document.getElementById('edit-user-uid').value = uid;
        document.getElementById('edit-user-nama').value = nama;
        document.getElementById('edit-user-email').value = email;
        document.getElementById('edit-user-jenis').value = jenisAkun;
        document.getElementById('edit-user-password').value = '';
        base64EditUserImage = foto;

        if (foto) {
            document.getElementById('edit-user-foto-preview').src = foto;
            document.getElementById('edit-user-foto-preview').classList.remove('hidden');
            document.getElementById('edit-user-foto-icon').classList.add('hidden');
        } else {
            document.getElementById('edit-user-foto-preview').classList.add('hidden');
            document.getElementById('edit-user-foto-icon').classList.remove('hidden');
        }

        document.getElementById('modal-edit-user-detail').classList.remove('hidden');
    }

    function tutupModalEditUserDetail() {
        document.getElementById('modal-edit-user-detail').classList.add('hidden');
    }

    function previewEditUserFoto(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                base64EditUserImage = e.target.result;
                document.getElementById('edit-user-foto-preview').src = base64EditUserImage;
                document.getElementById('edit-user-foto-preview').classList.remove('hidden');
                document.getElementById('edit-user-foto-icon').classList.add('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function simpanPerubahanEditUserDetail() {
        const uid = document.getElementById('edit-user-uid').value;
        const namaBaru = document.getElementById('edit-user-nama').value.trim();
        const jenisBaru = document.getElementById('edit-user-jenis').value;
        const passwordBaru = document.getElementById('edit-user-password').value.trim();

        if (!namaBaru) return alert("Nama tidak boleh kosong!");

        db.collection("users").doc(uid).update({
            nama: namaBaru,
            jenisAkun: jenisBaru,
            foto: base64EditUserImage || ''
        }).then(() => {
            if (passwordBaru && auth.currentUser && auth.currentUser.uid === uid) {
                return auth.currentUser.updatePassword(passwordBaru);
            }
        }).then(() => {
            alert("Data akun berhasil diperbarui!");
            tutupModalEditUserDetail();
        }).catch(err => {
            alert("Gagal memperbarui akun: " + err.message);
            tutupModalEditUserDetail();
        });
    }

    function previewNewUserFoto(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('new-user-file-name').innerText = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                base64NewUserImage = e.target.result;
                document.getElementById('new-user-preview').src = base64NewUserImage;
                document.getElementById('new-user-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function batalNewUserFoto() {
        base64NewUserImage = '';
        document.getElementById('new-user-preview-container').classList.add('hidden');
        document.getElementById('new-user-file-input').value = '';
        document.getElementById('new-user-file-name').innerText = 'Tidak ada file';
    }

    function tambahUserKeluarga() {
        const nama = document.getElementById('new-user-nama').value.trim();
        const email = document.getElementById('new-user-email').value.trim().toLowerCase();
        const password = document.getElementById('new-user-password').value.trim();
        const jenisAkun = document.getElementById('new-user-jenis').value;

        if (!nama || !email || !password || !jenisAkun) {
            return alert("Semua field form tambah user harus diisi dengan lengkap!");
        }

        if (password.length < 6) {
            return alert("Password minimal harus 6 karakter!");
        }

        let secondaryApp;
        const appName = "Auth_Family_" + Date.now();
        try {
            secondaryApp = firebase.initializeApp(firebaseConfig, appName);
        } catch(err) {
            secondaryApp = firebase.app(appName);
        }

        const secondaryAuth = secondaryApp.auth();
        secondaryAuth.createUserWithEmailAndPassword(email, password)
            .then((userCred) => {
                const newUid = userCred.user.uid;
                db.collection("users").doc(newUid).set({
                    nama: nama,
                    email: email,
                    jenisAkun: jenisAkun,
                    foto: base64NewUserImage || '',
                    isOnline: false
                }).then(() => {
                    secondaryAuth.signOut();
                    alert(`Berhasil membuat akun baru untuk ${jenisAkun} (${nama})!`);
                    document.getElementById('new-user-nama').value = '';
                    document.getElementById('new-user-email').value = '';
                    document.getElementById('new-user-password').value = '';
                    batalNewUserFoto();
                });
            })
            .catch((error) => {
                alert("Gagal membuat akun keluarga: " + error.message);
            });
    }

    function bukaModalGambarBesar(url) {
        if(!url) return;
        document.getElementById('gambar-zoom-view').src = url;
        document.getElementById('modal-gambar-besar').classList.remove('hidden');
    }

    function tutupModalGambarBesar() {
        document.getElementById('modal-gambar-besar').classList.add('hidden');
    }

    function getCurrentMonthKey() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}`;
    }

    function bukaModalSetLimit() {
        document.getElementById('input-limit-bulanan').value = '';
        document.getElementById('modal-set-limit').classList.remove('hidden');
    }

    function tutupModalSetLimit() {
        document.getElementById('modal-set-limit').classList.add('hidden');
    }

    function simpanLimitBulanan() {
        const limitVal = unformatRupiah(document.getElementById('input-limit-bulanan').value);
        if (isNaN(limitVal) || limitVal < 0) return alert("Masukkan nominal limit yang valid!");
        
        const bulanKey = getCurrentMonthKey();
        db.collection("settings").doc(`limit_${bulanKey}`).set({
            limit: limitVal,
            bulan: bulanKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            tutupModalSetLimit();
            alert("Limit kas bulanan berhasil disimpan untuk bulan ini!");
            muatDataTransaksi();
        }).catch(e => alert("Gagal menyimpan limit: " + e.message));
    }

    function formatInputRupiah(input) {
        let val = input.value.replace(/[^0-9]/g, '');
        if(val !== "") input.value = parseInt(val, 10).toLocaleString('id-ID');
        else input.value = "";
    }
    function unformatRupiah(str) {
        if(!str) return 0;
        return parseInt(str.toString().replace(/[^0-9]/g, ''), 10);
    }
    function formatFloat(num) {
        return Number(num).toLocaleString('id-ID', { maximumFractionDigits: 6 });
    }
    function formatWaktu(firebaseTimestamp) {
        if(!firebaseTimestamp) return 'Baru saja';
        return firebaseTimestamp.toDate().toLocaleDateString('id-ID', {
            day: 'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'
        });
    }
    function formatTanggal(dateString) {
        if(!dateString) return '-';
        const d = new Date(dateString);
        return d.toLocaleDateString('id-ID', { day: 'numeric', month:'short', year:'numeric' });
    }

    function gantiKategoriKas(select) {
        const jenisSelect = document.getElementById('jenis');
        if (select.value === 'limit_bulanan') {
            jenisSelect.value = 'keluar';
            jenisSelect.disabled = true;
            jenisSelect.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            jenisSelect.disabled = false;
            jenisSelect.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

    function resetFilter() {
        document.getElementById('filter-bulan').value = '';
        muatDataTransaksi();
    }

    function simpanTransaksi() {
        if (currentUserJenisAkun === 'Anak') {
            return alert("Akses ditolak: Akun anak tidak diizinkan menginput kas!");
        }

        const kategoriKas = document.getElementById('kategori-kas').value;
        let jenis = document.getElementById('jenis').value;
        if (kategoriKas === 'limit_bulanan') {
            jenis = 'keluar';
        }
        const jumlah = unformatRupiah(document.getElementById('jumlah').value);
        const keterangan = document.getElementById('keterangan').value;
        
        if (!jumlah || !keterangan) return alert("Nominal dan keterangan harus diisi!");

        const currentBulanKey = getCurrentMonthKey();
        db.collection("settings").doc(`limit_${currentBulanKey}`).get().then((docLimit) => {
            let monthlyLimit = docLimit.exists ? (docLimit.data().limit || 0) : 0;

            db.collection("transaksi").get().then((querySnapshot) => {
                let currentMonthExpense = 0;
                querySnapshot.forEach(doc => {
                    const d = doc.data();
                    if ((d.kategoriKas || 'limit_bulanan') === 'limit_bulanan' && d.jenis === 'keluar') {
                        const tObj = d.tanggal ? d.tanggal.toDate() : new Date();
                        const y = tObj.getFullYear();
                        const m = String(tObj.getMonth() + 1).padStart(2, '0');
                        if (`${y}-${m}` === currentBulanKey) {
                            if (!isEditMode || doc.id !== idEditSekarang) {
                                currentMonthExpense += d.jumlah;
                            }
                        }
                    }
                });

                const remainingLimit = Math.max(0, monthlyLimit - currentMonthExpense);
                if (kategoriKas === 'limit_bulanan' && monthlyLimit > 0 && jumlah > remainingLimit) {
                    return alert(`Gagal menyimpan! Nominal pengeluaran melebihi sisa limit bulanan (Rp ${remainingLimit.toLocaleString('id-ID')}).`);
                }

                if (isEditMode) {
                    db.collection("transaksi").doc(idEditSekarang).update({
                        kategoriKas: kategoriKas, jenis: jenis, jumlah: jumlah, keterangan: keterangan, status: 'Diupdate',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: document.getElementById('user-display-name').innerText
                    }).then(() => {
                        alert("Transaksi berhasil diperbarui!");
                        batalEdit();
                    }).catch(e => alert("Error: " + e.message));
                } else {
                    db.collection("transaksi").add({
                        kategoriKas: kategoriKas, jenis: jenis, jumlah: jumlah, keterangan: keterangan, status: 'Baru',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: document.getElementById('user-display-name').innerText,
                        tanggal: firebase.firestore.FieldValue.serverTimestamp() 
                    }).then(() => {
                        alert("Transaksi berhasil disimpan!");
                        document.getElementById('jumlah').value = ''; 
                        document.getElementById('keterangan').value = '';
                    }).catch(e => alert("Error: " + e.message));
                }
            });
        });
    }

    function siapkanEdit(id, kategoriKas, jenis, jumlah, keterangan) {
        if (currentUserJenisAkun === 'Anak') {
            return alert("Akses ditolak: Akun anak tidak diizinkan mengedit transaksi!");
        }
        isEditMode = true; idEditSekarang = id;
        const katEl = document.getElementById('kategori-kas');
        katEl.value = kategoriKas || 'limit_bulanan';
        gantiKategoriKas(katEl);

        document.getElementById('jenis').value = jenis; 
        document.getElementById('jumlah').value = jumlah.toLocaleString('id-ID'); 
        document.getElementById('keterangan').value = keterangan;
        
        document.getElementById('form-title').innerText = "Edit Transaksi (Update)";
        const btnSimpan = document.getElementById('btn-simpan');
        btnSimpan.innerText = "Update Data"; btnSimpan.className = "bg-yellow-500 hover:bg-yellow-600 text-white p-3 rounded-xl transition flex-1 font-bold shadow-md text-sm";
        document.getElementById('btn-batal').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function batalEdit() {
        isEditMode = false; idEditSekarang = '';
        document.getElementById('jumlah').value = ''; document.getElementById('keterangan').value = '';
        const katEl = document.getElementById('kategori-kas');
        katEl.value = 'limit_bulanan';
        gantiKategoriKas(katEl);
        
        document.getElementById('form-title').innerText = "Tambah Transaksi Baru";
        const btnSimpan = document.getElementById('btn-simpan');
        btnSimpan.innerText = "Simpan"; btnSimpan.className = "bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition flex-1 font-bold shadow-md text-sm";
        document.getElementById('btn-batal').classList.add('hidden');
    }

    function hapusTransaksi(id) {
        if (currentUserJenisAkun === 'Anak') {
            return alert("Akses ditolak: Akun anak tidak diizinkan menghapus transaksi!");
        }
        if (confirm("Hapus transaksi ini permanen?")) {
            db.collection("transaksi").doc(id).delete().then(() => {
                alert("Transaksi berhasil dihapus!");
            });
        }
    }

    let unsubscribeTransaksi = null;
    function muatDataTransaksi() {
        if (unsubscribeTransaksi) unsubscribeTransaksi();
        const filterValue = document.getElementById('filter-bulan').value; 
        const currentBulanKey = getCurrentMonthKey();

        db.collection("settings").doc(`limit_${currentBulanKey}`).get().then((docLimit) => {
            let monthlyLimit = docLimit.exists ? (docLimit.data().limit || 0) : 0;

            unsubscribeTransaksi = db.collection("transaksi").orderBy("tanggal", "desc").onSnapshot((querySnapshot) => {
                const tabel = document.getElementById('tabel-transaksi');
                if(!tabel) return;
                tabel.innerHTML = ''; 
                
                let totalKeluargaMasuk = 0, totalKeluargaKeluar = 0;
                let filterTabelMasuk = 0, filterTabelKeluar = 0;
                let rowCount = 0;

                querySnapshot.forEach((doc) => {
                    const data = doc.data(); const docId = doc.id;
                    const kategori = data.kategoriKas || 'limit_bulanan'; 
                    
                    const waktuTransaksiObj = data.tanggal ? data.tanggal.toDate() : new Date();
                    const yyyyTrans = waktuTransaksiObj.getFullYear();
                    const mmTrans = String(waktuTransaksiObj.getMonth() + 1).padStart(2, '0');
                    const bulanTahunTransaksi = `${yyyyTrans}-${mmTrans}`;

                    if (kategori === 'permanen') {
                        if(data.jenis === 'masuk') totalKeluargaMasuk += data.jumlah;
                        if(data.jenis === 'keluar') totalKeluargaKeluar += data.jumlah;
                    }

                    if (filterValue === '' || filterValue === bulanTahunTransaksi) {
                        rowCount++;
                        if(data.jenis === 'masuk') filterTabelMasuk += data.jumlah;
                        if(data.jenis === 'keluar') filterTabelKeluar += data.jumlah;

                        let statusBadge = "";
                        const pembuat = data.createdBy || data.user || "Anonim";
                        if (data.status === 'Diupdate' && data.updatedAt) {
                            statusBadge = `<div class="mt-1 inline-block bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">🔄 Diupdate: ${formatWaktu(data.updatedAt)}</div>`;
                        } else {
                            statusBadge = `<div class="mt-1 inline-block bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">✨ Baru: ${formatWaktu(data.createdAt || data.tanggal)}</div>`;
                        }

                        const textColor = data.jenis === 'masuk' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                        const simbol = data.jenis === 'masuk' ? '+' : '-';
                        const ketAman = data.keterangan.replace(/'/g, "\\'");
                        const badgeKategori = kategori === 'permanen' 
                            ? `<span class="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold block mt-1 w-max">🟢 Kas Keluarga</span>` 
                            : `<span class="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold block mt-1 w-max">🟣 Limit Bulanan</span>`;

                        let actionButtonsHtml = '';
                        if (currentUserJenisAkun !== 'Anak') {
                            actionButtonsHtml = `
                                <div class="flex justify-center space-x-2">
                                    <button onclick="siapkanEdit('${docId}', '${kategori}', '${data.jenis}', ${data.jumlah}, '${ketAman}')" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm">Edit</button>
                                    <button onclick="hapusTransaksi('${docId}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm">Hapus</button>
                                </div>
                            `;
                        } else {
                            actionButtonsHtml = `<span class="text-xs text-gray-400 italic">Hanya Baca</span>`;
                        }

                        tabel.innerHTML += `
                            <tr class="border-b dark:border-slate-700 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors">
                                <td class="p-4 text-sm text-gray-700 dark:text-gray-300 font-medium">
                                    ${formatWaktu(data.tanggal).split(',')[0]}
                                    ${badgeKategori}
                                </td>
                                <td class="p-4 text-gray-900 dark:text-gray-200"><span class="font-bold">${data.keterangan}</span><br>${statusBadge}</td>
                                <td class="p-4 capitalize text-sm font-semibold">${data.jenis}</td>
                                <td class="p-4 font-bold ${textColor} text-base">${simbol} Rp ${data.jumlah.toLocaleString('id-ID')}</td>
                                <td class="p-4 text-center">
                                    ${actionButtonsHtml}
                                </td>
                            </tr>
                        `;
                    }
                });

                if (rowCount === 0) {
                    tabel.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500 dark:text-gray-400 font-medium">Belum ada catatan transaksi pada bulan/filter ini.</td></tr>`;
                }

                const saldoKeluarga = totalKeluargaMasuk - totalKeluargaKeluar;
                
                let currentMonthExpense = 0;
                querySnapshot.forEach(doc => {
                    const d = doc.data();
                    if ((d.kategoriKas || 'limit_bulanan') === 'limit_bulanan' && d.jenis === 'keluar') {
                        const tObj = d.tanggal ? d.tanggal.toDate() : new Date();
                        const y = tObj.getFullYear();
                        const m = String(tObj.getMonth() + 1).padStart(2, '0');
                        if (`${y}-${m}` === currentBulanKey) {
                            currentMonthExpense += d.jumlah;
                        }
                    }
                });
                const remainingLimit = Math.max(0, monthlyLimit - currentMonthExpense);

                document.getElementById('total-kas-permanen').innerText = 'Rp ' + saldoKeluarga.toLocaleString('id-ID');
                document.getElementById('total-kas-bulanan').innerText = 'Rp ' + remainingLimit.toLocaleString('id-ID');
                document.getElementById('info-limit-bulanan').innerText = `Batasan Limit: Rp ${monthlyLimit.toLocaleString('id-ID')}`;
                document.getElementById('filter-masuk').innerText = 'Rp ' + filterTabelMasuk.toLocaleString('id-ID');
                document.getElementById('filter-keluar').innerText = 'Rp ' + filterTabelKeluar.toLocaleString('id-ID');
            });
        });
    }

    function simpanHutangKeluarga() {
        const pemberi = document.getElementById('family-debt-pemberi').value;
        const penerima = document.getElementById('family-debt-penerima').value;
        const nominal = unformatRupiah(document.getElementById('family-debt-nominal').value);
        const keterangan = document.getElementById('family-debt-keterangan').value.trim();

        if (pemberi === penerima) {
            return alert("Pemberi dan penerima pinjaman tidak boleh orang yang sama!");
        }
        if (!nominal || nominal <= 0 || !keterangan) {
            return alert("Nominal dan keterangan harus diisi dengan benar!");
        }

        db.collection("hutang_keluarga").add({
            pemberi: pemberi,
            penerima: penerima,
            nominal: nominal,
            terbayar: 0,
            keterangan: keterangan,
            status: 'Belum Lunas',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: document.getElementById('user-display-name')?.innerText || 'Keluarga'
        }).then(() => {
            alert("Berhasil mencatat hutang internal keluarga!");
            document.getElementById('family-debt-nominal').value = '';
            document.getElementById('family-debt-keterangan').value = '';
        }).catch(e => alert("Gagal menyimpan: " + e.message));
    }

    function bayarHutangKeluarga(id) {
        const bayarStr = prompt("Masukkan nominal cicilan/pembayaran hutang (Rp):");
        if (bayarStr !== null) {
            const bayar = unformatRupiah(bayarStr);
            if (!isNaN(bayar) && bayar > 0) {
                db.collection("hutang_keluarga").doc(id).get().then(doc => {
                    if (!doc.exists) return;
                    const data = doc.data();
                    const terbayarBaru = (data.terbayar || 0) + bayar;
                    const statusBaru = terbayarBaru >= data.nominal ? 'Lunas' : 'Belum Lunas';

                    db.collection("hutang_keluarga").doc(id).update({
                        terbayar: terbayarBaru,
                        status: statusBaru,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        alert("Pembayaran berhasil dicatat!");
                    });
                });
            } else {
                alert("Nominal tidak valid.");
            }
        }
    }

    function hapusHutangKeluarga(id) {
        if (confirm("Hapus catatan hutang keluarga ini?")) {
            db.collection("hutang_keluarga").doc(id).delete().then(() => {
                alert("Catatan hutang internal berhasil dihapus!");
            });
        }
    }

    function muatDataHutangKeluarga() {
        const container = document.getElementById('list-family-debt');
        if (!container) return;

        db.collection("hutang_keluarga").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
            container.innerHTML = '';
            let count = 0;
            let sumTotalHutang = 0;
            let sumTerbayar = 0;
            let debtorsArray = [];

            snapshot.forEach(doc => {
                count++;
                const data = doc.data();
                const id = doc.id;
                const nominal = data.nominal || 0;
                const terbayar = data.terbayar || 0;
                const sisa = Math.max(0, nominal - terbayar);
                const persen = nominal > 0 ? Math.min(100, (terbayar / nominal) * 100) : 0;
                const isLunas = sisa <= 0;

                sumTotalHutang += nominal;
                sumTerbayar += terbayar;

                debtorsArray.push({
                    nama: `${data.penerima} (ke ${data.pemberi}) - ${data.keterangan}`,
                    total: nominal,
                    terbayar: terbayar,
                    sisa: sisa
                });

                let badgeStatus = isLunas 
                    ? '<span class="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 px-3 py-1 rounded-full text-[10px] font-bold">LUNAS ✓</span>' 
                    : '<span class="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 px-3 py-1 rounded-full text-[10px] font-bold">Belum Lunas</span>';

                container.innerHTML += `
                    <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col justify-between">
                        <div>
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 px-3 py-1 rounded-full text-xs font-bold">🔄 ${data.penerima} berhutang ke ${data.pemberi}</span>
                                </div>
                                <button onclick="hapusHutangKeluarga('${id}')" class="text-gray-400 hover:text-red-500 font-bold text-xs bg-gray-100 dark:bg-slate-700 h-7 w-7 rounded-full flex items-center justify-center transition">✕</button>
                            </div>
                            <p class="text-sm font-bold text-gray-900 dark:text-white mb-1">${data.keterangan}</p>
                            <div class="text-xs text-gray-500 dark:text-gray-400 mb-3">Dicatat oleh: ${data.createdBy || 'Keluarga'}</div>
                            <div class="mb-3">${badgeStatus}</div>

                            <div class="my-4 p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 text-xs space-y-1.5">
                                <div class="flex justify-between"><span class="text-gray-500">Total Pinjaman:</span> <strong class="text-gray-900 dark:text-white">Rp ${nominal.toLocaleString('id-ID')}</strong></div>
                                <div class="flex justify-between"><span class="text-gray-500">Sudah Dibayar:</span> <strong class="text-green-600 dark:text-green-400">Rp ${terbayar.toLocaleString('id-ID')}</strong></div>
                                <div class="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-1.5 mt-1.5"><span class="text-gray-700 dark:text-gray-300 font-bold">Sisa Hutang:</span> <strong class="text-red-500 dark:text-red-400 font-bold">Rp ${sisa.toLocaleString('id-ID')}</strong></div>
                            </div>

                            <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 mb-1.5">
                                <div class="bg-cyan-500 h-2.5 rounded-full transition-all duration-300" style="width: ${persen}%"></div>
                            </div>
                            <div class="text-[10px] text-right text-gray-400 font-semibold mb-4">${persen.toFixed(1)}% Lunas</div>
                        </div>

                        <button onclick="bayarHutangKeluarga('${id}')" class="w-full bg-cyan-50 dark:bg-slate-700 hover:bg-cyan-100 dark:hover:bg-cyan-600 text-cyan-700 dark:text-cyan-300 font-bold py-2.5 rounded-xl text-xs transition border border-cyan-200 dark:border-slate-600 shadow-sm">
                            💸 Cicil / Bayar Hutang
                        </button>
                    </div>
                `;
            });

            if (count === 0) {
                container.innerHTML = `<div class="bg-white dark:bg-slate-800 p-8 rounded-2xl text-center text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-700 md:col-span-2">Belum ada catatan hutang internal keluarga.</div>`;
            }

            latestFamilyDebtSummary = {
                totalHutang: sumTotalHutang,
                totalTerbayar: sumTerbayar,
                sisaHutang: Math.max(0, sumTotalHutang - sumTerbayar),
                debtors: debtorsArray
            };
            renderFamilyDebtPelunasanChart(latestFamilyDebtSummary);
        });
    }

    function previewHutangJaminanFile(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('hutang-jaminan-file-name').innerText = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                base64HutangJaminanImage = e.target.result;
                document.getElementById('hutang-jaminan-preview').src = base64HutangJaminanImage;
                document.getElementById('hutang-jaminan-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function batalHutangJaminanFoto() {
        base64HutangJaminanImage = '';
        document.getElementById('hutang-jaminan-preview-container').classList.add('hidden');
        document.getElementById('hutang-file-jaminan-input').value = '';
        document.getElementById('hutang-jaminan-file-name').innerText = 'Tidak ada file';
    }

    function previewHutangKtpFile(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('hutang-ktp-file-name').innerText = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                base64HutangKtpImage = e.target.result;
                document.getElementById('hutang-ktp-preview').src = base64HutangKtpImage;
                document.getElementById('hutang-ktp-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function batalHutangKtpFoto() {
        base64HutangKtpImage = '';
        document.getElementById('hutang-ktp-preview-container').classList.add('hidden');
        document.getElementById('hutang-file-ktp-input').value = '';
        document.getElementById('hutang-ktp-file-name').innerText = 'Tidak ada file';
    }

    function simpanHutang() {
        if (currentUserJenisAkun === 'Anak') return alert("Akses ditolak!");
        const nama = document.getElementById('hutang-nama').value.trim();
        const emailPenghutang = document.getElementById('hutang-email').value.trim().toLowerCase();
        const total = unformatRupiah(document.getElementById('hutang-total').value);
        const jaminan = document.getElementById('hutang-jaminan').value.trim();
        const tempo = document.getElementById('hutang-tempo').value;
        
        if (!nama || !emailPenghutang || !total || !tempo) {
            return alert("Nama, Email, Total Hutang, dan Tanggal Jatuh Tempo harus diisi!");
        }

        let secondaryApp;
        const appName = "Auth_" + Date.now();
        try {
            secondaryApp = firebase.initializeApp(firebaseConfig, appName);
        } catch(err) {
            secondaryApp = firebase.app(appName);
        }

        const secondaryAuth = secondaryApp.auth();
        secondaryAuth.createUserWithEmailAndPassword(emailPenghutang, "12345678")
            .then((userCred) => {
                const newUid = userCred.user.uid;
                db.collection("users").doc(newUid).set({
                    nama: nama,
                    email: emailPenghutang,
                    jenisAkun: 'Penghutang',
                    foto: '',
                    isOnline: false
                }).then(() => {
                    secondaryAuth.signOut();
                    simpanDataHutangKeDb(newUid, nama, emailPenghutang, total, jaminan, tempo);
                });
            })
            .catch((error) => {
                if (error.code === 'auth/email-already-in-use') {
                    db.collection("users").where("email", "==", emailPenghutang).get().then((querySnapshot) => {
                        let foundUid = "";
                        querySnapshot.forEach(doc => { foundUid = doc.id; });
                        simpanDataHutangKeDb(foundUid, nama, emailPenghutang, total, jaminan, tempo);
                    });
                } else {
                    alert("Gagal mendaftarkan akun login: " + error.message);
                }
            });
    }

    function simpanDataHutangKeDb(authUid, nama, emailPenghutang, total, jaminan, tempo) {
        db.collection("hutang").add({ 
            authUid: authUid || '',
            nama: nama, 
            email: emailPenghutang,
            total: total, 
            terbayar: 0, 
            jaminan: jaminan || 'Tidak ada jaminan',
            fotoJaminan: base64HutangJaminanImage || '',
            fotoKtp: base64HutangKtpImage || '',
            jatuhTempo: tempo,
            riwayatBayar: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        }).then(() => { 
            alert("Berhasil mencatat hutang dan mengaktifkan akun login penghutang (Password default: 12345678)!");
            document.getElementById('hutang-nama').value = ''; 
            document.getElementById('hutang-email').value = '';
            document.getElementById('hutang-total').value = ''; 
            document.getElementById('hutang-jaminan').value = '';
            document.getElementById('hutang-tempo').value = '';
            batalHutangJaminanFoto();
            batalHutangKtpFoto();
        }).catch(e => alert("Error database: " + e.message));
    }

    function hapusHutang(docId, authUid) {
        if (currentUserJenisAkun === 'Anak') return alert("Akses ditolak!");
        if (confirm("Hapus data hutang ini dan hapus permanen akun penghutang dari sistem?")) {
            db.collection("hutang").doc(docId).delete().then(() => {
                if (authUid) {
                    db.collection("users").doc(authUid).delete().catch(err => console.log(err));
                }
                alert("Data hutang berhasil dihapus!");
            }).catch(e => alert("Gagal menghapus: " + e.message));
        }
    }

    function bukaModalEditHutang(id, nama, email, total, jaminan, jatuhTempo) {
        if (currentUserJenisAkun === 'Anak') return alert("Akses ditolak!");
        document.getElementById('edit-hutang-doc-id').value = id;
        document.getElementById('edit-hutang-nama').value = nama;
        document.getElementById('edit-hutang-email').value = email;
        document.getElementById('edit-hutang-total').value = total.toLocaleString('id-ID');
        document.getElementById('edit-hutang-jaminan').value = jaminan;
        document.getElementById('edit-hutang-tempo').value = jatuhTempo;
        document.getElementById('modal-edit-hutang').classList.remove('hidden');
    }

    function tutupModalEditHutang() {
        document.getElementById('modal-edit-hutang').classList.add('hidden');
    }

    function prosesSimpanEditHutang() {
        const id = document.getElementById('edit-hutang-doc-id').value;
        const nama = document.getElementById('edit-hutang-nama').value.trim();
        const email = document.getElementById('edit-hutang-email').value.trim();
        const total = unformatRupiah(document.getElementById('edit-hutang-total').value);
        const jaminan = document.getElementById('edit-hutang-jaminan').value.trim();
        const jatuhTempo = document.getElementById('edit-hutang-tempo').value;

        if(!nama || !total || !jatuhTempo) {
            return alert("Nama, Total, dan Jatuh Tempo wajib diisi!");
        }

        db.collection("hutang").doc(id).update({
            nama: nama,
            email: email,
            total: total,
            jaminan: jaminan,
            jatuhTempo: jatuhTempo,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            alert("Data hutang berhasil diperbarui!");
            tutupModalEditHutang();
        }).catch(e => alert("Gagal mengupdate hutang: " + e.message));
    }

    function bukaModalDetailHutang(id) {
        db.collection("hutang").doc(id).get().then((doc) => {
            if(!doc.exists) return;
            const data = doc.data();
            const total = data.total || 0;
            const terbayar = data.terbayar || 0;
            const sisa = Math.max(0, total - terbayar);
            const persen = total > 0 ? Math.min(100, (terbayar / total) * 100) : 0;

            let fotoJaminanTag = data.fotoJaminan ? `<div class="mt-2"><p class="text-xs text-gray-400 mb-1 font-semibold">Foto Jaminan:</p><img src="${data.fotoJaminan}" class="h-32 object-cover rounded-xl cursor-pointer border border-slate-700 shadow" onclick="bukaModalGambarBesar(this.src)"></div>` : '<p class="text-xs text-gray-500">Tidak ada foto jaminan.</p>';
            let fotoKtpTag = data.fotoKtp ? `<div class="mt-2"><p class="text-xs text-gray-400 mb-1 font-semibold">Foto KTP:</p><img src="${data.fotoKtp}" class="h-32 object-cover rounded-xl cursor-pointer border border-slate-700 shadow" onclick="bukaModalGambarBesar(this.src)"></div>` : '<p class="text-xs text-gray-500">Tidak ada foto KTP.</p>';

            let riwayatHtml = '';
            if(data.riwayatBayar && data.riwayatBayar.length > 0) {
                data.riwayatBayar.forEach((log, idx) => {
                    let buktiLink = log.bukti ? `<span class="text-blue-400 underline cursor-pointer ml-2" onclick="bukaModalGambarBesar('${log.bukti}')">🖼️ Bukti</span>` : '';
                    let tglStr = new Date(log.tanggal).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                    let olehUser = log.userName ? ` (Oleh: ${log.userName})` : '';
                    riwayatHtml += `<div class="bg-slate-900 p-3 rounded-xl border border-slate-700 text-xs flex justify-between items-center mb-1"><div><strong class="text-green-400">Rp ${log.nominal.toLocaleString('id-ID')}</strong><span class="text-yellow-300">${olehUser}</span><br><span class="text-gray-400">${tglStr}</span></div><div>${buktiLink}</div></div>`;
                });
            } else {
                riwayatHtml = `<p class="text-xs text-gray-500 italic">Belum ada riwayat pembayaran.</p>`;
            }

            document.getElementById('detail-hutang-content').innerHTML = `
                <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 space-y-2">
                    <p><strong>👤 Nama:</strong> ${data.nama}</p>
                    <p><strong>✉️ Email Akun:</strong> ${data.email || '-'}</p>
                    <p><strong>📅 Jatuh Tempo:</strong> ${formatTanggal(data.jatuhTempo)}</p>
                    <p><strong>💰 Total Hutang:</strong> Rp ${total.toLocaleString('id-ID')}</p>
                    <p><strong>✅ Terbayar:</strong> Rp ${terbayar.toLocaleString('id-ID')}</p>
                    <p><strong>⚠️ Sisa Hutang:</strong> <span class="text-red-400 font-bold">Rp ${sisa.toLocaleString('id-ID')}</span> (${persen.toFixed(1)}% Lunas)</p>
                    <p><strong>🔒 Jaminan:</strong> ${data.jaminan || '-'}</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>${fotoJaminanTag}</div>
                    <div>${fotoKtpTag}</div>
                </div>
                <div>
                    <p class="font-bold text-yellow-400 mb-2">📜 Riwayat / Log Pembayaran:</p>
                    <div class="max-h-40 overflow-y-auto space-y-1">${riwayatHtml}</div>
                </div>
            `;
            document.getElementById('modal-detail-hutang').classList.remove('hidden');
        });
    }

    function tutupModalDetailHutang() {
        document.getElementById('modal-detail-hutang').classList.add('hidden');
    }

    function bukaModalHutang(id, sisa, terbayarLama) {
        document.getElementById('modal-hutang-id').value = id;
        document.getElementById('modal-hutang-terbayar-lama').value = terbayarLama;
        document.getElementById('modal-sisa-hutang').innerText = 'Rp ' + sisa.toLocaleString('id-ID');
        document.getElementById('input-bayar-hutang').value = '';
        batalBuktiFoto();
        document.getElementById('modal-bayar-hutang').classList.remove('hidden');
    }

    function tutupModalHutang() {
        document.getElementById('modal-bayar-hutang').classList.add('hidden');
    }

    function previewBuktiBayar(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                base64BuktiImage = e.target.result;
                document.getElementById('bukti-preview').src = base64BuktiImage;
                document.getElementById('bukti-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function batalBuktiFoto() {
        base64BuktiImage = '';
        document.getElementById('bukti-preview-container').classList.add('hidden');
        document.getElementById('bukti-bayar-file').value = '';
    }

    function prosesBayarHutang() {
        const id = document.getElementById('modal-hutang-id').value;
        const terbayarLama = parseFloat(document.getElementById('modal-hutang-terbayar-lama').value);
        const bayarBaru = unformatRupiah(document.getElementById('input-bayar-hutang').value);
        
        if (!bayarBaru || bayarBaru <= 0) return alert("Masukkan nominal pembayaran!");
        
        const currentUserName = document.getElementById('user-display-name')?.innerText || 'Keluarga';

        db.collection("hutang").doc(id).get().then((docSnapshot) => {
            if(!docSnapshot.exists) return;

            const logBaru = {
                nominal: bayarBaru,
                tanggal: new Date().toISOString(),
                bukti: base64BuktiImage || '',
                userName: currentUserName
            };

            db.collection("hutang").doc(id).update({ 
                terbayar: terbayarLama + bayarBaru,
                riwayatBayar: firebase.firestore.FieldValue.arrayUnion(logBaru),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
            }).then(() => {
                tutupModalHutang();
                alert("Berhasil mencatat pembayaran!");
            }).catch(e => alert("Gagal membayar: " + e.message));
        });
    }

    function prosesBayarOlehPenghutang(docId, sisaTagihan, terbayarLama) {
        const inputNominalEl = document.getElementById(`debtor-input-bayar-${docId}`);
        const inputFileEl = document.getElementById(`debtor-file-bukti-${docId}`);
        const bayarBaru = unformatRupiah(inputNominalEl.value);

        if (!bayarBaru || bayarBaru <= 0) {
            return alert("Masukkan nominal pembayaran yang valid!");
        }

        const file = inputFileEl.files[0];
        const currentUserName = document.getElementById('debtor-display-name')?.innerText || 'Penghutang';

        const executeUpdate = (buktiBase64) => {
            const logBaru = {
                nominal: bayarBaru,
                tanggal: new Date().toISOString(),
                bukti: buktiBase64 || '',
                userName: currentUserName
            };

            db.collection("hutang").doc(docId).update({
                terbayar: terbayarLama + bayarBaru,
                riwayatBayar: firebase.firestore.FieldValue.arrayUnion(logBaru),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                alert("Pembayaran dan bukti berhasil dikirim ke admin keluarga!");
                inputNominalEl.value = '';
                inputFileEl.value = '';
            }).catch(e => alert("Gagal mengirim pembayaran: " + e.message));
        };

        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                executeUpdate(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            executeUpdate('');
        }
    }

    function muatDataHutang() {
        if (currentUserJenisAkun === 'Anak') return;
        const filterStatus = document.getElementById('filter-status-hutang') ? document.getElementById('filter-status-hutang').value : 'semua';

        db.collection("hutang").orderBy("createdAt", "desc").onSnapshot((querySnapshot) => {
            const container = document.getElementById('list-hutang');
            if(!container) return;
            container.innerHTML = ''; 
            
            let sumTotalHutang = 0;
            let sumTerbayar = 0;
            let countRender = 0;
            let debtorsArray = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data(); const docId = doc.id;
                const totalHutang = data.total || 0;
                const terbayarHutang = data.terbayar || 0;
                const sisaHutang = Math.max(0, totalHutang - terbayarHutang);

                sumTotalHutang += totalHutang;
                sumTerbayar += terbayarHutang;

                debtorsArray.push({
                    nama: data.nama || 'Tanpa Nama',
                    total: totalHutang,
                    terbayar: terbayarHutang,
                    sisa: sisaHutang
                });

                let persen = (terbayarHutang / totalHutang) * 100;
                if(persen > 100) persen = 100;
                
                let sisa = totalHutang - terbayarHutang;
                if(sisa < 0) sisa = 0;

                const isLunas = persen >= 100;

                if (filterStatus === 'lunas' && !isLunas) return;
                if (filterStatus === 'belum' && isLunas) return;

                countRender++;

                let status = "Belum Lunas";
                let bgStatus = "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
                if (isLunas) {
                    status = "Lunas ✓";
                    bgStatus = "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300";
                }

                const today = new Date().setHours(0,0,0,0);
                const tempoDate = new Date(data.jatuhTempo).setHours(0,0,0,0);
                if(!isLunas && tempoDate < today) {
                    status = "Lewat Jatuh Tempo ⚠️";
                    bgStatus = "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400 font-bold animate-pulse";
                }

                let emailInfo = data.email ? `<p class="text-xs text-blue-400 font-medium mb-1">✉️ ${data.email}</p>` : '';
                let safeNama = (data.nama || '').replace(/'/g, "\\'");
                let safeEmail = (data.email || '').replace(/'/g, "\\'");
                let safeJaminan = (data.jaminan || '').replace(/'/g, "\\'");

                container.innerHTML += `
                    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col justify-between overflow-hidden relative">
                        <div class="absolute top-4 right-4 flex gap-1.5">
                            <button onclick="bukaModalDetailHutang('${docId}')" class="bg-gray-100 dark:bg-slate-700 hover:bg-blue-500 hover:text-white transition text-xs font-bold rounded-full h-7 w-7 flex items-center justify-center shadow" title="Detail Lengkap">👁️</button>
                            <button onclick="bukaModalEditHutang('${docId}', '${safeNama}', '${safeEmail}', ${totalHutang}, '${safeJaminan}', '${data.jatuhTempo || ''}')" class="bg-gray-100 dark:bg-slate-700 hover:bg-yellow-500 hover:text-white transition text-xs font-bold rounded-full h-7 w-7 flex items-center justify-center shadow" title="Edit Data">✏️</button>
                            <button onclick="hapusHutang('${docId}', '${data.authUid || ''}')" class="bg-gray-100 dark:bg-slate-700 hover:bg-red-500 hover:text-white transition text-xs font-bold rounded-full h-7 w-7 flex items-center justify-center shadow" title="Hapus Hutang & Akun">✖</button>
                        </div>
                        
                        <div class="p-6">
                            <h4 class="font-bold text-gray-900 dark:text-white text-lg mb-0.5">👤 ${data.nama}</h4>
                            ${emailInfo}
                            <p class="text-xs text-gray-500 dark:text-gray-400 mb-3 font-semibold">Jatuh Tempo: ${formatTanggal(data.jatuhTempo)}</p>
                            <span class="px-3 py-1 rounded-full text-[10px] font-bold ${bgStatus}">${status}</span>

                            <div class="mt-4 mb-2 p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-700 text-xs space-y-1.5">
                                <div class="flex justify-between"><span class="text-gray-500">Total:</span> <strong class="text-gray-900 dark:text-white">Rp ${totalHutang.toLocaleString('id-ID')}</strong></div>
                                <div class="flex justify-between"><span class="text-gray-500">Terbayar:</span> <strong class="text-green-600 dark:text-green-400">Rp ${terbayarHutang.toLocaleString('id-ID')}</strong></div>
                                <div class="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-1.5 mt-1.5"><span class="text-gray-700 dark:text-gray-300 font-bold">Sisa:</span> <strong class="text-red-500 dark:text-red-400 font-bold">Rp ${sisa.toLocaleString('id-ID')}</strong></div>
                            </div>
                            
                            <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 mb-1 mt-4">
                                <div class="bg-orange-500 h-2.5 rounded-full transition-all duration-500" style="width: ${persen}%"></div>
                            </div>
                            <div class="text-[10px] text-right text-orange-500 dark:text-orange-400 font-extrabold mb-2">📊 ${persen.toFixed(1)}% Lunas</div>
                        </div>
                        
                        <div class="px-6 pb-6 pt-0">
                            <button onclick="bukaModalHutang('${docId}', ${sisa}, ${terbayarHutang})" class="w-full bg-orange-50 dark:bg-slate-700 hover:bg-orange-100 dark:hover:bg-slate-600 text-orange-600 dark:text-orange-400 font-bold py-2.5 rounded-xl transition border border-orange-200 dark:border-slate-600 shadow-sm text-xs flex items-center justify-center gap-2">
                                💸 Upload Bukti & Bayar
                            </button>
                        </div>
                    </div>
                `;
            });

            if (countRender === 0) {
                container.innerHTML = `<div class="bg-white dark:bg-slate-800 p-8 rounded-2xl text-center text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-700 md:col-span-2">Belum ada data hutang sesuai filter yang dipilih.</div>`;
            }

            latestDebtSummary = {
                totalHutang: sumTotalHutang,
                totalTerbayar: sumTerbayar,
                sisaHutang: Math.max(0, sumTotalHutang - sumTerbayar),
                debtors: debtorsArray
            };
            renderDebtPelunasanChart(latestDebtSummary);
        });
    }

    function muatDataHutangPenghutang(userEmail, namaUser) {
        db.collection("hutang").onSnapshot((querySnapshot) => {
            const container = document.getElementById('debtor-portal-content');
            if(!container) return;
            container.innerHTML = '';

            let found = false;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const docId = doc.id;
                const emailHutang = (data.email || "").toLowerCase().trim();
                const namaHutang = (data.nama || "").toLowerCase().trim();

                if (emailHutang === userEmail.toLowerCase().trim() || namaHutang === namaUser.toLowerCase().trim()) {
                    found = true;
                    let persen = (data.terbayar / data.total) * 100;
                    if(persen > 100) persen = 100;
                    let sisa = data.total - data.terbayar;
                    if(sisa < 0) sisa = 0;

                    let fotoJaminanTag = data.fotoJaminan ? `<div class="mt-2"><p class="text-[11px] text-gray-400 font-semibold mb-1">Foto Jaminan:</p><img src="${data.fotoJaminan}" alt="Foto Jaminan" class="h-32 w-full object-cover rounded-xl border border-slate-700 shadow-sm cursor-pointer" onclick="bukaModalGambarBesar(this.src)"></div>` : '';
                    let fotoKtpTag = data.fotoKtp ? `<div class="mt-2"><p class="text-[11px] text-blue-400 font-semibold mb-1">Foto KTP:</p><img src="${data.fotoKtp}" alt="Foto KTP" class="h-32 w-full object-cover rounded-xl border border-slate-700 shadow-sm cursor-pointer" onclick="bukaModalGambarBesar(this.src)"></div>` : '';

                    let riwayatHtml = '';
                    if(data.riwayatBayar && data.riwayatBayar.length > 0) {
                        data.riwayatBayar.forEach((log, idx) => {
                            let buktiImg = log.bukti ? `<span class="text-blue-400 underline cursor-pointer block mt-1" onclick="bukaModalGambarBesar('${log.bukti}')">🖼️ Lihat Bukti Transfer ↗</span>` : '';
                            let tglStr = new Date(log.tanggal).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                            let olehUser = log.userName ? ` (Oleh: ${log.userName})` : '';
                            riwayatHtml += `
                                <div class="bg-slate-900 p-3.5 rounded-xl border border-slate-700 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                    <div>
                                        <p class="font-bold text-green-400">Pembayaran #${idx+1}: Rp ${log.nominal.toLocaleString('id-ID')} <span class="text-yellow-300">${olehUser}</span></p>
                                        <p class="text-gray-400 text-[10px]">🕒 ${tglStr}</p>
                                        ${buktiImg}
                                    </div>
                                </div>
                            `;
                        });
                    } else {
                        riwayatHtml = `<p class="text-xs text-gray-500 italic">Belum ada riwayat pembayaran tercatat.</p>`;
                    }

                    container.innerHTML += `
                        <div class="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 p-6 space-y-6">
                            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-700 pb-4">
                                <div>
                                    <h3 class="text-lg font-bold text-white">Tagihan Atas Nama: ${data.nama}</h3>
                                    <p class="text-xs text-gray-400">Jatuh Tempo: ${formatTanggal(data.jatuhTempo)}</p>
                                </div>
                                <div class="text-right">
                                    <span class="px-3.5 py-1.5 rounded-full text-xs font-bold ${persen >= 100 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}">
                                        ${persen >= 100 ? 'LUNAS ✓' : 'Belum Lunas'}
                                    </span>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div class="space-y-4">
                                    <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 space-y-2 text-sm">
                                        <div class="flex justify-between"><span class="text-gray-400">Total Hutang:</span> <strong class="text-white">Rp ${data.total.toLocaleString('id-ID')}</strong></div>
                                        <div class="flex justify-between"><span class="text-gray-400">Total Terbayar:</span> <strong class="text-green-400">Rp ${data.terbayar.toLocaleString('id-ID')}</strong></div>
                                        <div class="flex justify-between border-t border-slate-800 pt-2"><span class="text-gray-300 font-bold">Sisa Tagihan:</span> <strong class="text-red-400 text-base">Rp ${sisa.toLocaleString('id-ID')}</strong></div>
                                    </div>
                                    <div class="bg-slate-900 p-3.5 rounded-xl border border-slate-700 text-xs">
                                        <div class="flex justify-between items-center mb-1">
                                            <span class="text-gray-400 font-semibold">Persentase Pelunasan:</span>
                                            <strong class="text-orange-400 font-extrabold text-sm">${persen.toFixed(1)}% Lunas</strong>
                                        </div>
                                        <div class="w-full bg-slate-800 rounded-full h-2 mb-2">
                                            <div class="bg-orange-500 h-2 rounded-full transition-all duration-500" style="width: ${persen}%"></div>
                                        </div>
                                    </div>
                                    <div class="text-xs bg-slate-900 p-3.5 rounded-xl border border-slate-700 text-slate-300 space-y-2">
                                        🔒 <strong>Jaminan:</strong> ${data.jaminan || 'Tidak ada'}
                                        ${fotoJaminanTag}
                                        ${fotoKtpTag}
                                    </div>
                                </div>

                                <div>
                                    <h4 class="font-bold text-sm text-orange-400 mb-3">💸 Form Bayar / Cicil & Upload Bukti</h4>
                                    <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 space-y-3">
                                        <div>
                                            <label class="block text-xs font-semibold text-gray-300 mb-1">Nominal Pembayaran (Rp)</label>
                                            <input type="text" id="debtor-input-bayar-${docId}" oninput="formatInputRupiah(this)" placeholder="Misal: 100.000" class="w-full p-3 border border-slate-600 rounded-xl bg-slate-800 text-white text-sm focus:ring-2 focus:ring-orange-500">
                                        </div>
                                        <div>
                                            <label class="block text-xs font-semibold text-gray-300 mb-1">Upload Bukti Transfer</label>
                                            <input type="file" id="debtor-file-bukti-${docId}" accept="image/*" class="w-full text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-orange-950 file:text-orange-300">
                                        </div>
                                        <button onclick="prosesBayarOlehPenghutang('${docId}', ${sisa}, ${data.terbayar})" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl text-xs transition shadow-md">Kirim Pembayaran & Bukti</button>
                                    </div>
                                </div>
                            </div>

                            <div class="border-t border-slate-700 pt-4">
                                <h4 class="font-bold text-sm text-yellow-400 mb-3">📜 Log / Riwayat Pembayaran Hutang</h4>
                                <div class="space-y-2">
                                    ${riwayatHtml}
                                </div>
                            </div>
                        </div>
                    `;
                }
            });

            if(!found) {
                container.innerHTML = `<div class="bg-slate-800 p-8 rounded-2xl text-center text-gray-400 border border-slate-700">Belum ada data hutang yang terhubung dengan email akun Anda (${userEmail}).</div>`;
            }
        });
    }

    function previewTabunganFile(event) {
        const file = event.target.files[0];
        if (file) {
            document.getElementById('tabungan-file-name').innerText = file.name;
            const reader = new FileReader();
            reader.onload = function(e) {
                base64TabunganImage = e.target.result;
                document.getElementById('tabungan-preview').src = base64TabunganImage;
                document.getElementById('tabungan-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function batalTabunganFoto() {
        base64TabunganImage = '';
        document.getElementById('tabungan-preview-container').classList.add('hidden');
        document.getElementById('tabungan-file-input').value = '';
        document.getElementById('tabungan-file-name').innerText = 'Belum ada file dipilih';
    }

    function simpanTabungan() {
        const pemilik = document.getElementById('pemilik-tabungan').value;
        const nama = document.getElementById('nama-tabungan').value;
        const target = unformatRupiah(document.getElementById('target-tabungan').value);
        
        if (!nama || !target || target <= 0) return alert("Nama dan Nominal Target harus diisi!");
        
        const defaultImage = "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=500&auto=format&fit=crop&q=80";

        db.collection("tabungan").add({ 
            pemilik: pemilik || 'Keluarga Bersama',
            nama: nama, 
            target: target, 
            terkumpul: 0, 
            foto: base64TabunganImage || defaultImage,
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        }).then(() => { 
            alert("Target tabungan berhasil dibuat!");
            document.getElementById('nama-tabungan').value = ''; 
            document.getElementById('target-tabungan').value = ''; 
            batalTabunganFoto();
        }).catch(e => alert("Error: " + e.message));
    }

    function tambahSaldoTabungan(id, terkumpulSekarang) {
        const nominalStr = prompt("Berapa Rupiah yang ditabung?\n(Ketik angka saja tanpa titik)");
        if (nominalStr !== null) {
            const nominal = unformatRupiah(nominalStr);
            if (!isNaN(nominal) && nominal > 0) {
                db.collection("tabungan").doc(id).update({ 
                    terkumpul: terkumpulSekarang + nominal, 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                }).then(() => {
                    alert("Saldo tabungan berhasil ditambahkan!");
                });
            } else {
                alert("Nominal tidak valid.");
            }
        }
    }

    function hapusTabungan(id) {
        if (confirm("Hapus rencana tabungan ini?")) {
            db.collection("tabungan").doc(id).delete().then(() => {
                alert("Target tabungan berhasil dihapus!");
            });
        }
    }

    function muatDataTabungan() {
        const filterUser = document.getElementById('filter-user-tabungan') ? document.getElementById('filter-user-tabungan').value : 'Semua';

        db.collection("tabungan").orderBy("createdAt", "desc").onSnapshot((querySnapshot) => {
            const container = document.getElementById('list-tabungan');
            const tabelDetail = document.getElementById('tabel-list-tabungan-detail');
            if(!container || !tabelDetail) return;

            container.innerHTML = ''; 
            tabelDetail.innerHTML = '';
            let count = 0;

            querySnapshot.forEach((doc) => {
                const data = doc.data(); const docId = doc.id;
                const pemilik = data.pemilik || 'Keluarga Bersama';

                if (filterUser !== 'Semua' && pemilik !== filterUser) return;

                count++;
                let persen = (data.terkumpul / data.target) * 100;
                if(persen > 100) persen = 100;
                let barColor = persen >= 100 ? 'bg-green-500' : (persen > 50 ? 'bg-indigo-500' : 'bg-blue-500');
                let fotoUrl = data.foto || "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=500&auto=format&fit=crop&q=80";

                let ownerBadgeColor = 'bg-blue-900 text-blue-200';
                if (pemilik === 'Bunda') ownerBadgeColor = 'bg-pink-900 text-pink-200';
                if (pemilik === 'Anak') ownerBadgeColor = 'bg-emerald-900 text-emerald-200';
                if (pemilik === 'Keluarga Bersama') ownerBadgeColor = 'bg-purple-900 text-purple-200';

                container.innerHTML += `
                    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col justify-between overflow-hidden hover:shadow-md transition">
                        <div>
                            <div class="h-40 overflow-hidden relative bg-slate-900">
                                <img src="${fotoUrl}" alt="Foto Target" class="w-full h-full object-cover hover:scale-105 transition duration-300 cursor-pointer" onclick="bukaModalGambarBesar(this.src)">
                                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent pointer-events-none"></div>
                                <span class="absolute top-3 left-3 text-[10px] font-bold px-3 py-1 rounded-full ${ownerBadgeColor} shadow">👤 ${pemilik}</span>
                                <h4 class="absolute bottom-3 left-4 right-4 font-bold text-white text-base drop-shadow-md truncate pointer-events-none">${data.nama}</h4>
                                <button onclick="hapusTabungan('${docId}')" class="absolute top-3 right-3 bg-black/60 hover:bg-red-600 text-white transition text-xs font-bold rounded-full h-7 w-7 flex items-center justify-center shadow">✖</button>
                            </div>
                            
                            <div class="p-6">
                                <div class="flex justify-between text-sm mb-1.5">
                                    <span class="text-gray-600 dark:text-gray-400 text-xs">Terkumpul: <strong class="text-gray-900 dark:text-gray-200">Rp ${data.terkumpul.toLocaleString('id-ID')}</strong></span>
                                    <span class="text-gray-500 dark:text-gray-400 text-xs">Target: Rp ${data.target.toLocaleString('id-ID')}</span>
                                </div>
                                <div class="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 mb-2 mt-2">
                                    <div class="${barColor} h-2.5 rounded-full transition-all duration-500" style="width: ${persen}%"></div>
                                </div>
                                <p class="text-xs text-right text-gray-500 dark:text-gray-400 mb-2 font-semibold">${persen.toFixed(1)}% Tercapai</p>
                            </div>
                        </div>
                        
                        <div class="px-6 pb-6 pt-0">
                            <button onclick="tambahSaldoTabungan('${docId}', ${data.terkumpul})" class="w-full bg-indigo-50 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-slate-600 text-indigo-700 dark:text-indigo-300 font-semibold py-2.5 rounded-xl transition border border-indigo-200 dark:border-slate-600 shadow-sm text-xs">
                                + Tambah Saldo Tabungan
                            </button>
                        </div>
                    </div>
                `;

                tabelDetail.innerHTML += `
                    <tr class="border-b dark:border-slate-700 hover:bg-gray-50/50 dark:hover:bg-slate-700/50">
                        <td class="p-3.5"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${ownerBadgeColor}">${pemilik}</span></td>
                        <td class="p-3.5 font-bold">${data.nama}</td>
                        <td class="p-3.5">Rp ${data.target.toLocaleString('id-ID')}</td>
                        <td class="p-3.5 text-emerald-600 dark:text-emerald-400 font-bold">Rp ${data.terkumpul.toLocaleString('id-ID')}</td>
                        <td class="p-3.5 font-semibold">${persen.toFixed(1)}%</td>
                        <td class="p-3.5 text-center">
                            <div class="flex justify-center gap-2">
                                <button onclick="tambahSaldoTabungan('${docId}', ${data.terkumpul})" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition">Tabung</button>
                                <button onclick="hapusTabungan('${docId}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold transition">Hapus</button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            if (count === 0) {
                container.innerHTML = `<div class="bg-white dark:bg-slate-800 p-8 rounded-2xl text-center text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-700 md:col-span-2">Belum ada data rencana tabungan untuk anggota ini.</div>`;
                tabelDetail.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-500 dark:text-gray-400">Belum ada data rencana tabungan.</td></tr>`;
            }
        });
    }

    function cekPilihanKoin(select) {
        const customInput = document.getElementById('custom-koin');
        if (select.value === 'Lainnya') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
            customInput.value = '';
        }
    }

    function simpanCrypto() {
        const pemilik = document.getElementById('pemilik-crypto').value;
        let selectVal = document.getElementById('jenis-crypto').value;
        let koin = selectVal;
        if (selectVal === 'Lainnya') {
            koin = document.getElementById('custom-koin').value.trim();
            if (!koin) return alert("Silakan ketik nama koin custom terlebih dahulu!");
        }

        const jumlahKoin = parseFloat(document.getElementById('jumlah-koin').value);
        const hargaBeli = unformatRupiah(document.getElementById('harga-beli-crypto').value);
        const hargaSekarang = unformatRupiah(document.getElementById('harga-sekarang-crypto').value);
        
        if (!koin || !jumlahKoin || !hargaBeli || !hargaSekarang) {
            return alert("Mohon lengkapi semua data pembelian Koin Crypto!");
        }

        db.collection("crypto").add({ 
            pemilik: pemilik,
            koin: koin, 
            jumlahKoin: jumlahKoin, 
            hargaBeli: hargaBeli,
            hargaSekarang: hargaSekarang,
            status: 'Hold', 
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        }).then(() => { 
            alert("Portofolio crypto berhasil dicatat!");
            document.getElementById('jenis-crypto').value = ''; 
            document.getElementById('custom-koin').classList.add('hidden');
            document.getElementById('custom-koin').value = '';
            document.getElementById('jumlah-koin').value = ''; 
            document.getElementById('harga-beli-crypto').value = ''; 
            document.getElementById('harga-sekarang-crypto').value = ''; 
        }).catch(e => alert("Error: " + e.message));
    }

    function updateHargaCrypto(id, hargaLama) {
        const nominalStr = prompt("Masukkan harga market koin SAAT INI per koin (Rp):", hargaLama);
        if (nominalStr !== null) {
            const hargaBaru = unformatRupiah(nominalStr);
            if (!isNaN(hargaBaru) && hargaBaru > 0) {
                db.collection("crypto").doc(id).update({ 
                    hargaSekarang: hargaBaru, 
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                }).then(() => {
                    alert("Harga crypto berhasil diperbarui!");
                });
            } else {
                alert("Nominal tidak valid.");
            }
        }
    }

    function jualCrypto(id, jumlahKoin) {
        const konfirmasi = confirm(`Apakah Anda yakin telah MENJUAL ${jumlahKoin} koin ini dan ingin mengunci profit/loss portofolio ini?`);
        if (konfirmasi) {
            const nominalStr = prompt("Masukkan harga JUAL FINAL per koin (Rp):");
            if (nominalStr !== null) {
                const hargaJual = unformatRupiah(nominalStr);
                if (!isNaN(hargaJual) && hargaJual > 0) {
                    db.collection("crypto").doc(id).update({ 
                        hargaSekarang: hargaJual, 
                        status: 'Terjual', 
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                    }).then(() => {
                        alert("Penjualan crypto berhasil dicatat!");
                    });
                } else {
                    alert("Nominal jual tidak valid. Batal menjual.");
                }
            }
        }
    }

    function hapusCrypto(id) {
        if (confirm("Hapus data portofolio crypto ini secara permanen?")) {
            db.collection("crypto").doc(id).delete().then(() => {
                alert("Portofolio crypto berhasil dihapus!");
            });
        }
    }

    function muatDataCrypto() {
        const filterUser = document.getElementById('filter-user-crypto').value;

        db.collection("crypto").orderBy("createdAt", "desc").onSnapshot((querySnapshot) => {
            const container = document.getElementById('list-crypto');
            if(!container) return;
            container.innerHTML = ''; 
            
            let grandTotalPnlRp = 0;
            let grandTotalModal = 0;
            let dataCount = 0;

            latestPnlByUser = { 'Ayah': 0, 'Bunda': 0, 'Anak': 0 };

            querySnapshot.forEach((doc) => {
                const data = doc.data(); const docId = doc.id;
                const pemilik = data.pemilik || 'Ayah';

                const totalModal = data.jumlahKoin * data.hargaBeli;
                const totalSekarang = data.jumlahKoin * data.hargaSekarang;
                const pnlRp = totalSekarang - totalModal;

                if (latestPnlByUser[pemilik] !== undefined) {
                    latestPnlByUser[pemilik] += pnlRp;
                }

                if (filterUser === 'Semua' || filterUser === pemilik) {
                    dataCount++;
                    const pnlPersen = totalModal > 0 ? (pnlRp / totalModal) * 100 : 0;
                    
                    grandTotalPnlRp += pnlRp;
                    grandTotalModal += totalModal;

                    const isProfit = pnlRp >= 0;
                    const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
                    const pnlSimbol = isProfit ? '+' : '';
                    
                    const isHold = data.status === 'Hold';
                    const statusBadge = isHold 
                        ? `<span class="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">🟢 HOLDING</span>` 
                        : `<span class="bg-gray-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">⚪ TERJUAL</span>`;
                    
                    const cardBg = isHold ? 'bg-slate-900 border-slate-700' : 'bg-slate-800 border-gray-600 opacity-90';
                    const labelNilai = isHold ? 'Nilai Saat Ini' : 'Total Hasil Jual';
                    const labelHarga = isHold ? 'Harga Skrg/Koin' : 'Harga Jual/Koin';

                    let ownerBadgeColor = 'bg-blue-900 text-blue-200';
                    if (pemilik === 'Bunda') ownerBadgeColor = 'bg-pink-900 text-pink-200';
                    if (pemilik === 'Anak') ownerBadgeColor = 'bg-emerald-900 text-emerald-200';

                    const actionButtons = isHold 
                        ? `
                            <div class="grid grid-cols-2 gap-2 mt-5 relative z-10">
                                <button onclick="updateHargaCrypto('${docId}', ${data.hargaSekarang})" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2.5 rounded-xl text-xs transition border border-slate-500 shadow">🔄 Update Harga</button>
                                <button onclick="jualCrypto('${docId}', ${data.jumlahKoin})" class="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-lg">💰 Jual Koin</button>
                            </div>
                            ` 
                        : `<div class="mt-4 text-center text-xs text-gray-400 italic">Portofolio Koin Ini Sudah Ditutup</div>`;

                    container.innerHTML += `
                        <div class="${cardBg} text-white p-6 rounded-2xl shadow-xl border flex flex-col justify-between hover:shadow-2xl transition relative overflow-hidden">
                            <div class="absolute -right-4 -bottom-4 opacity-10 text-9xl pointer-events-none">${isProfit ? '📈' : '📉'}</div>
                            
                            <div class="relative z-10">
                                <div class="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold px-3 py-1 rounded-full ${ownerBadgeColor}">👤 ${pemilik}</span>
                                        <h4 class="font-bold text-yellow-400 text-base">🚀 ${data.koin}</h4>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        ${statusBadge}
                                        <button onclick="hapusCrypto('${docId}')" class="text-slate-400 hover:text-red-400 transition text-sm bg-slate-800 rounded-full h-7 w-7 flex items-center justify-center font-bold shadow border border-slate-600">✖</button>
                                    </div>
                                </div>
                                
                                <div class="text-sm text-slate-300 bg-slate-800 p-3.5 rounded-xl mb-4 flex justify-between">
                                    <span>Jumlah Koin:</span>
                                    <strong class="text-white">${formatFloat(data.jumlahKoin)} Koin</strong>
                                </div>
                                
                                <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                                    <div>
                                        <p class="text-slate-400 text-xs">Modal Pembelian</p>
                                        <p class="font-semibold text-white text-sm">Rp ${totalModal.toLocaleString('id-ID')}</p>
                                    </div>
                                    <div>
                                        <p class="text-slate-400 text-xs">${labelNilai}</p>
                                        <p class="font-semibold text-white text-sm">Rp ${totalSekarang.toLocaleString('id-ID')}</p>
                                    </div>
                                    <div>
                                        <p class="text-slate-500 text-[10px] mt-2">Harga Beli/Koin</p>
                                        <p class="text-slate-300 text-xs">Rp ${data.hargaBeli.toLocaleString('id-ID')}</p>
                                    </div>
                                    <div>
                                        <p class="text-slate-500 text-[10px] mt-2">${labelHarga}</p>
                                        <p class="text-slate-300 text-xs">Rp ${data.hargaSekarang.toLocaleString('id-ID')}</p>
                                    </div>
                                </div>
                                
                                <div class="mt-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                                    <p class="text-slate-400 text-xs mb-1">Profit / Loss (PnL)</p>
                                    <p class="${pnlColor} font-extrabold text-base tracking-wide">
                                        ${pnlSimbol} Rp ${Math.abs(pnlRp).toLocaleString('id-ID')} 
                                        <span class="text-xs font-medium ml-1">(${pnlSimbol}${pnlPersen.toFixed(2)}%)</span>
                                    </p>
                                </div>
                            </div>
                            
                            ${actionButtons}
                        </div>
                    `;
                }
            });
            
            const badgeEl = document.getElementById('total-crypto-pnl-badge');
            if(badgeEl) {
                const grandTotalPersen = grandTotalModal > 0 ? (grandTotalPnlRp / grandTotalModal) * 100 : 0;
                const isGrandProfit = grandTotalPnlRp >= 0;
                const grandSymbol = isGrandProfit ? '+' : '';
                
                badgeEl.innerText = `Total PnL: ${grandSymbol}Rp ${Math.abs(grandTotalPnlRp).toLocaleString('id-ID')} (${grandSymbol}${grandTotalPersen.toFixed(2)}%)`;
                badgeEl.className = isGrandProfit 
                    ? "bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow border border-green-500" 
                    : "bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow border border-red-500";
            }

            if (dataCount === 0) {
                container.innerHTML = `<p class="text-gray-400 text-sm md:col-span-2 text-center p-8 bg-slate-800 rounded-2xl border border-dashed border-slate-700">Belum ada portofolio investasi crypto untuk anggota ini.</p>`;
                if(badgeEl) {
                    badgeEl.innerText = "Total PnL: Rp 0 (0%)";
                    badgeEl.className = "bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow border border-slate-700";
                }
            }

            renderCryptoProfitChart(latestPnlByUser);
        });
    }

    async function fetchCryptoNews() {
        const container = document.getElementById('crypto-news-container');
        if(!container) return;
        container.innerHTML = `<p class="text-slate-400 text-center py-8 md:col-span-2 animate-pulse text-sm">Menarik 10 berita terbaru Watcher Guru...</p>`;

        let rssUrl = 'https://watcher.guru/news/feed';

        try {
            const apiRssUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
            const response = await fetch(apiRssUrl);
            const data = await response.json();

            if (data.status === 'ok' && data.items && data.items.length > 0) {
                container.innerHTML = '';
                const top10News = data.items.slice(0, 10);

                top10News.forEach((item, index) => {
                    let desc = item.description ? item.description.replace(/<[^>]*>?/gm, '') : '';
                    if (desc.length > 100) desc = desc.substring(0, 100) + '...';

                    let imageUrl = item.thumbnail || (item.enclosure ? item.enclosure.link : '');
                    if (!imageUrl || imageUrl === '') {
                        const fallbackImages = [
                            "https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=500&auto=format&fit=crop&q=80",
                            "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=500&auto=format&fit=crop&q=80"
                        ];
                        imageUrl = fallbackImages[index % fallbackImages.length];
                    }

                    const dateObj = new Date(item.pubDate);
                    const tanggalFormatted = !isNaN(dateObj) ? (dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' • ' + dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })) : 'Terbaru';

                    container.innerHTML += `
                        <div class="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 hover:border-yellow-500/50 transition flex flex-col justify-between shadow-lg">
                            <div>
                                <div class="h-36 overflow-hidden relative bg-slate-900">
                                    <img src="${imageUrl}" alt="Thumbnail" class="w-full h-full object-cover hover:scale-105 transition duration-300 cursor-pointer" onclick="bukaModalGambarBesar(this.src)">
                                    <span class="absolute top-3 left-3 bg-black/70 text-yellow-400 text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none">#${index + 1} WATCHER</span>
                                </div>
                                <div class="p-5">
                                    <div class="text-[11px] text-slate-400 mb-1.5 font-semibold">🕒 ${tanggalFormatted} WIB</div>
                                    <h4 class="font-bold text-white text-sm mb-2 leading-snug hover:text-yellow-400 transition">
                                        <a href="${item.link}" target="_blank">${item.title}</a>
                                    </h4>
                                    <p class="text-slate-300 text-xs leading-relaxed mb-3">${desc}</p>
                                </div>
                            </div>
                            <div class="px-5 pb-5 pt-0">
                                <a href="${item.link}" target="_blank" class="text-xs bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold py-2 px-4 rounded-xl inline-block transition w-full text-center shadow">
                                    Baca Artikel Asli ↗
                                </a>
                            </div>
                        </div>
                    `;
                });
            } else {
                container.innerHTML = `<p class="text-slate-400 text-center text-xs py-8 md:col-span-2">Gagal memuat berita dari Watcher Guru.</p>`;
            }
        } catch (err) {
            container.innerHTML = `<p class="text-slate-400 text-center text-xs py-8 md:col-span-2">Terjadi kesalahan koneksi jaringan.</p>`;
        }
    }

    function renderCryptoProfitChart(pnlData) {
        const canvasEl = document.getElementById('cryptoProfitChart');
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (cryptoProfitChartInstance) cryptoProfitChartInstance.destroy();

        const labels = Object.keys(pnlData);
        const values = Object.values(pnlData);
        const backgroundColors = values.map(val => val >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)');

        cryptoProfitChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total PnL (Rp)',
                    data: values,
                    backgroundColor: backgroundColors,
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } }
                }
            }
        });
    }

    function renderDebtPelunasanChart(debtSummary) {
        const canvasEl = document.getElementById('debtPelunasanChart');
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (debtPelunasanChartInstance) debtPelunasanChartInstance.destroy();

        const debtors = debtSummary.debtors || [];
        const labels = debtors.map(d => d.nama);
        const terbayarData = debtors.map(d => d.terbayar);
        const sisaData = debtors.map(d => d.sisa);

        const grandTotal = debtSummary.totalHutang || 0;
        const grandTerbayar = debtSummary.totalTerbayar || 0;
        const overallPercent = grandTotal > 0 ? ((grandTerbayar / grandTotal) * 100).toFixed(1) : 0;
        
        let lunasCount = debtors.filter(d => d.sisa <= 0).length;
        let belumCount = debtors.filter(d => d.sisa > 0).length;

        const badgeEl = document.getElementById('debt-summary-badge');
        if (badgeEl) {
            badgeEl.innerText = `Lunas: ${lunasCount} | Belum: ${belumCount} (${overallPercent}%)`;
        }

        debtPelunasanChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length > 0 ? labels : ['Tidak Ada Data'],
                datasets: [
                    {
                        label: 'Sudah Terbayar (Rp)',
                        data: terbayarData.length > 0 ? terbayarData : [0],
                        backgroundColor: 'rgba(34, 197, 94, 0.8)',
                        borderRadius: 4
                    },
                    {
                        label: 'Sisa Hutang / Belum Lunas (Rp)',
                        data: sisaData.length > 0 ? sisaData : [0],
                        backgroundColor: 'rgba(249, 115, 22, 0.8)',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (debtors.length === 0) return ' Tidak ada data hutang';
                                const index = context.dataIndex;
                                const debtor = debtors[index];
                                const datasetLabel = context.dataset.label;
                                const val = context.raw;
                                const repPercent = debtor.total > 0 ? ((debtor.terbayar / debtor.total) * 100).toFixed(1) : 0;
                                const statusText = debtor.sisa <= 0 ? 'Lunas ✓' : 'Belum Lunas';
                                return [
                                    ` Status: ${statusText}`,
                                    ` ${datasetLabel}: Rp ${val.toLocaleString('id-ID')}`,
                                    ` Total Hutang: Rp ${debtor.total.toLocaleString('id-ID')}`,
                                    ` Progres Pelunasan: ${repPercent}%`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: false, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
                    y: { stacked: false, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
    }

    function formatRupiah(angka) {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);
    }

    function ambilLokasiGPS() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                document.getElementById('aset-lokasi').value = `${lat}, ${lon}`;
            }, (err) => {
                alert("Gagal mendapatkan lokasi GPS: " + err.message);
            }, { enableHighAccuracy: true });
        } else {
            alert("Geolocation tidak didukung oleh browser ini.");
        }
    }

    function bukaModalAset(id = '', nama = '', kategori = 'Emas', kepemilikan = 'Ayah', nilai = '', lokasi = '') {
        document.getElementById('aset-id').value = id;
        document.getElementById('aset-nama').value = nama;
        document.getElementById('aset-kategori').value = kategori;
        document.getElementById('aset-kepemilikan').value = kepemilikan || 'Ayah';
        document.getElementById('aset-nilai').value = nilai ? Number(nilai).toLocaleString('id-ID') : '';
        document.getElementById('aset-lokasi').value = lokasi;
        document.getElementById('modal-aset-title').innerText = id ? 'Edit Aset Keluarga' : 'Tambah Aset Baru';
        document.getElementById('modal-aset').classList.remove('hidden');
    }

    function tutupModalAset() {
        document.getElementById('modal-aset').classList.add('hidden');
    }

    function simpanAset(e) {
        e.preventDefault();
        const id = document.getElementById('aset-id').value;
        const dataAset = {
            nama: document.getElementById('aset-nama').value,
            kategori: document.getElementById('aset-kategori').value,
            kepemilikan: document.getElementById('aset-kepemilikan').value,
            nilai: unformatRupiah(document.getElementById('aset-nilai').value),
            lokasi: document.getElementById('aset-lokasi').value,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        const dbRef = db.collection("aset_keluarga");
        let promise = id ? dbRef.doc(id).update(dataAset) : dbRef.add(dataAset);

        promise.then(() => {
            tutupModalAset();
        }).catch(err => {
            alert("Gagal menyimpan aset: " + err.message);
        });
    }

    function hapusAset(id) {
        if (confirm("Apakah Anda yakin ingin menghapus data aset ini dari daftar keluarga?")) {
            db.collection("aset_keluarga").doc(id).delete().catch(err => {
                alert("Gagal menghapus: " + err.message);
            });
        }
    }

    function inisialisasiRealtimeAset() {
        db.collection("aset_keluarga").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
            const tbody = document.getElementById('tabel-aset-body');
            if(!tbody) return;
            tbody.innerHTML = '';
            cacheDataAset = [];

            if (snapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400">Belum ada data aset keluarga yang tersimpan.</td></tr>`;
                updateDashboardAset([]);
                return;
            }

            let totalNilai = 0;
            let kategoriSet = new Set();

            snapshot.forEach(doc => {
                const data = doc.id ? { id: doc.id, ...doc.data() } : null;
                if (data) {
                    cacheDataAset.push(data);
                    totalNilai += (data.nilai || 0);
                    kategoriSet.add(data.kategori);

                    let safeNama = (data.nama || '').replace(/'/g, "\\'");
                    let safeKategori = (data.kategori || '').replace(/'/g, "\\'");
                    let safeKepemilikan = (data.kepemilikan || 'Ayah').replace(/'/g, "\\'");
                    let safeLokasi = (data.lokasi || '').replace(/'/g, "\\'");

                    let pemilikBadgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
                    if (data.kepemilikan === 'Bunda') pemilikBadgeColor = 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300';
                    if (data.kepemilikan === 'Anak') pemilikBadgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';

                    let lokasiDisplay = '-';
                    if (data.lokasi) {
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.lokasi)}`;
                        lokasiDisplay = `<a href="${mapsUrl}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium text-xs" title="Buka di Google Maps">📍 ${data.lokasi} ↗</a>`;
                    }

                    tbody.innerHTML += `
                        <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition">
                            <td class="p-4 font-semibold text-gray-800 dark:text-white">${data.nama}</td>
                            <td class="p-4"><span class="px-3 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">${data.kategori}</span></td>
                            <td class="p-4"><span class="px-3 py-1 text-xs rounded-full ${pemilikBadgeColor} font-bold">👤 ${data.kepemilikan || 'Ayah'}</span></td>
                            <td class="p-4 text-xs">${lokasiDisplay}</td>
                            <td class="p-4 text-right font-bold text-gray-800 dark:text-white">${formatRupiah(data.nilai || 0)}</td>
                            <td class="p-4 text-center space-x-2">
                                <button onclick="bukaModalAset('${data.id}', '${safeNama}', '${safeKategori}', '${safeKepemilikan}', ${data.nilai}, '${safeLokasi}')" class="text-blue-500 hover:text-blue-700 font-medium text-xs">Edit</button>
                                <button onclick="hapusAset('${data.id}')" class="text-red-500 hover:text-red-700 font-medium text-xs">Hapus</button>
                            </td>
                        </tr>
                    `;
                }
            });

            updateDashboardAset(cacheDataAset);
        });
    }
    
    function updateDashboardAset(dataList) {
        const kategoriRekap = {};
        let totalAsetDisesuaikan = 0;
        
        dataList.forEach(item => {
            kategoriRekap[item.kategori] = (kategoriRekap[item.kategori] || 0) + item.nilai;
            
            // Perhitungan: Motor, Mobil, Smartphone, Tablet, Smartwatch dihitung 50%
            const kat = item.kategori;
            const nilaiItem = item.nilai || 0;
            if (['Motor', 'Mobil', 'Smartphone', 'Tablet', 'Smartwatch'].includes(kat)) {
                totalAsetDisesuaikan += nilaiItem * 0.5;
            } else {
                totalAsetDisesuaikan += nilaiItem;
            }
        });

        // Update kartu total aset keluarga
        const totalAsetEl = document.getElementById('total-aset-keluarga');
        if (totalAsetEl) {
            totalAsetEl.innerText = formatRupiah(totalAsetDisesuaikan);
        }

        const labels = Object.keys(kategoriRekap);
        const dataValues = Object.values(kategoriRekap);
        const backgroundColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

        const legendContainer = document.getElementById('pie-legend-custom');
        if (legendContainer) {
            legendContainer.innerHTML = '';
            labels.forEach((label, idx) => {
                const color = backgroundColors[idx % backgroundColors.length];
                legendContainer.innerHTML += `
                    <div class="flex justify-between items-center">
                        <span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full" style="background-color: ${color};"></span> ${label}</span>
                        <span class="font-bold">${formatRupiah(kategoriRekap[label])}</span>
                    </div>
                `;
            });
        }

        const canvasPie = document.getElementById('pieChartAset');
        if (canvasPie) {
            const ctx = canvasPie.getContext('2d');
            if (pieChartInstance) {
                pieChartInstance.destroy();
            }

            pieChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels.length ? labels : ['Belum ada data'],
                    datasets: [{
                        data: dataValues.length ? dataValues : [1],
                        backgroundColor: labels.length ? backgroundColors : ['#e2e8f0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    cutout: '70%'
                }
            });
        }
    }

    function filterTabelAset() {
        const keyword = document.getElementById('search-aset').value.toLowerCase();
        const filtered = cacheDataAset.filter(item => 
            item.nama.toLowerCase().includes(keyword) || 
            item.kategori.toLowerCase().includes(keyword) || 
            (item.kepemilikan && item.kepemilikan.toLowerCase().includes(keyword)) ||
            (item.lokasi && item.lokasi.toLowerCase().includes(keyword))
        );

        const tbody = document.getElementById('tabel-aset-body');
        tbody.innerHTML = '';

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400">Tidak ada aset yang cocok dengan pencarian.</td></tr>`;
            return;
        }

        filtered.forEach(data => {
            let safeNama = (data.nama || '').replace(/'/g, "\\'");
            let safeKategori = (data.kategori || '').replace(/'/g, "\\'");
            let safeKepemilikan = (data.kepemilikan || 'Ayah').replace(/'/g, "\\'");
            let safeLokasi = (data.lokasi || '').replace(/'/g, "\\'");

            let pemilikBadgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
            if (data.kepemilikan === 'Bunda') pemilikBadgeColor = 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300';
            if (data.kepemilikan === 'Anak') pemilikBadgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';

            let lokasiDisplay = '-';
            if (data.lokasi) {
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.lokasi)}`;
                lokasiDisplay = `<a href="${mapsUrl}" target="_blank" class="text-blue-500 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium text-xs" title="Buka di Google Maps">📍 ${data.lokasi} ↗</a>`;
            }

            tbody.innerHTML += `
                <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition">
                    <td class="p-4 font-semibold text-gray-800 dark:text-white">${data.nama}</td>
                    <td class="p-4"><span class="px-3 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">${data.kategori}</span></td>
                    <td class="p-4"><span class="px-3 py-1 text-xs rounded-full ${pemilikBadgeColor} font-bold">👤 ${data.kepemilikan || 'Ayah'}</span></td>
                    <td class="p-4 text-xs">${lokasiDisplay}</td>
                    <td class="p-4 text-right font-bold text-gray-800 dark:text-white">${formatRupiah(data.nilai || 0)}</td>
                    <td class="p-4 text-center space-x-2">
                        <button onclick="bukaModalAset('${data.id}', '${safeNama}', '${safeKategori}', '${safeKepemilikan}', ${data.nilai}, '${safeLokasi}')" class="text-blue-500 hover:text-blue-700 font-medium text-xs">Edit</button>
                        <button onclick="hapusAset('${data.id}')" class="text-red-500 hover:text-red-700 font-medium text-xs">Hapus</button>
                    </td>
                </tr>
            `;
        });
    }

    function renderFamilyDebtPelunasanChart(familyDebtSummary) {
        const canvasEl = document.getElementById('familyDebtPelunasanChart');
        if (!canvasEl) return;
        const ctx = canvasEl.getContext('2d');
        if (familyDebtPelunasanChartInstance) familyDebtPelunasanChartInstance.destroy();

        const debtors = familyDebtSummary.debtors || [];
        const labels = debtors.map(d => d.nama);
        const terbayarData = debtors.map(d => d.terbayar);
        const sisaData = debtors.map(d => d.sisa);

        const grandTotal = familyDebtSummary.totalHutang || 0;
        const grandTerbayar = familyDebtSummary.totalTerbayar || 0;
        const overallPercent = grandTotal > 0 ? ((grandTerbayar / grandTotal) * 100).toFixed(1) : 0;
        
        let lunasCount = debtors.filter(d => d.sisa <= 0).length;
        let belumCount = debtors.filter(d => d.sisa > 0).length;

        const badgeEl = document.getElementById('family-debt-summary-badge');
        if (badgeEl) {
            badgeEl.innerText = `Lunas: ${lunasCount} | Belum: ${belumCount} (${overallPercent}%)`;
        }

        familyDebtPelunasanChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.length > 0 ? labels : ['Tidak Ada Data'],
                datasets: [
                    {
                        label: 'Sudah Terbayar (Rp)',
                        data: terbayarData.length > 0 ? terbayarData : [0],
                        backgroundColor: 'rgba(34, 197, 94, 0.8)',
                        borderRadius: 4
                    },
                    {
                        label: 'Sisa Hutang / Belum Lunas (Rp)',
                        data: sisaData.length > 0 ? sisaData : [0],
                        backgroundColor: 'rgba(6, 182, 212, 0.8)',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (debtors.length === 0) return ' Tidak ada data hutang keluarga';
                                const index = context.dataIndex;
                                const debtor = debtors[index];
                                const datasetLabel = context.dataset.label;
                                const val = context.raw;
                                const repPercent = debtor.total > 0 ? ((debtor.terbayar / debtor.total) * 100).toFixed(1) : 0;
                                const statusText = debtor.sisa <= 0 ? 'Lunas ✓' : 'Belum Lunas';
                                return [
                                    ` Status: ${statusText}`,
                                    ` ${datasetLabel}: Rp ${val.toLocaleString('id-ID')}`,
                                    ` Total Pinjaman: Rp ${debtor.total.toLocaleString('id-ID')}`,
                                    ` Progres Pelunasan: ${repPercent}%`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: { stacked: false, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
                    y: { stacked: false, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                }
            }
        });
    }

    function playNotificationSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        } catch(e) {}
    }

    function showChatToast(senderName, messageText) {
        const container = document.getElementById('chat-toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = "bg-slate-800 text-white border border-blue-500/50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 w-72 animate-slide-in pointer-events-auto cursor-pointer";
        toast.onclick = () => {
            const popup = document.getElementById('chat-popup-box');
            if (popup && popup.classList.contains('hidden')) toggleChatPopup();
            toast.remove();
        };

        toast.innerHTML = `
            <div class="text-2xl flex-shrink-0">💬</div>
            <div class="flex-1 overflow-hidden">
                <p class="text-xs font-bold text-blue-400 truncate">${senderName}</p>
                <p class="text-[11px] text-gray-300 truncate">${messageText || 'Mengirim gambar'}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-white font-bold text-xs p-1">✕</button>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 500);
            }
        }, 4000);
    }

    function toggleChatPopup() {
        const popup = document.getElementById('chat-popup-box');
        const badge = document.getElementById('chat-badge');
        if(!popup) return;
        popup.classList.toggle('hidden');
        if (!popup.classList.contains('hidden')) {
            if(badge) badge.classList.add('hidden');
            muatSidebarChat();
            const chatContainer = document.getElementById('chat-container');
            if(chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }

    function switchChatTarget(targetId, targetName) {
        activeChatTarget = targetId;
        activeChatName = targetName;
        document.getElementById('chat-header-title').innerText = targetName;
        initialLoadComplete = false;
        
        const chatContainer = document.getElementById('chat-container');
        if(chatContainer) chatContainer.innerHTML = '<p class="text-center text-xs text-gray-400 animate-pulse">Memuat percakapan...</p>';
        
        muatSidebarChat();
        muatDataChat();
    }

    function muatSidebarChat() {
        const sidebar = document.getElementById('chat-sidebar-list');
        if (!sidebar) return;
        sidebar.innerHTML = '';

        db.collection("users").onSnapshot((snapshot) => {
            let userHtml = '';
            const currentUser = auth.currentUser;
            let validTargetsFound = 0;

            snapshot.forEach((doc) => {
                const data = doc.data();
                const uid = doc.id;
                if (currentUser && uid === currentUser.uid) return;

                const role = data.jenisAkun;

                if (currentUserJenisAkun === 'Penghutang' && role !== 'Ayah' && role !== 'Bunda') {
                    return;
                }

                validTargetsFound++;
                const isOnline = data.lastSeen && (Date.now() - data.lastSeen.toDate().getTime() < 45000);
                const isActive = activeChatTarget === uid;
                const dotColor = isOnline ? 'bg-green-500' : 'bg-gray-400';
                const name = data.nama || (data.email ? data.email.split('@')[0] : 'User');

                userHtml += `
                    <div onclick="switchChatTarget('${uid}', 'Chat dengan ${name}')" class="p-3 border-b border-gray-100 dark:border-slate-800 cursor-pointer transition ${isActive ? 'bg-blue-600 text-white font-bold' : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-800 dark:text-gray-200'}">
                        <div class="flex items-center justify-between text-xs truncate">
                            <span class="truncate">👤 ${name}</span>
                            <span class="h-2 w-2 rounded-full ${dotColor} flex-shrink-0" title="${isOnline ? 'Online' : 'Offline'}"></span>
                        </div>
                    </div>
                `;
            });

            let groupChatHtml = '';
            if (currentUserJenisAkun !== 'Penghutang') {
                const isGroupActive = activeChatTarget === 'group';
                groupChatHtml = `
                    <div onclick="switchChatTarget('group', 'Chat Keluarga Realtime')" class="p-3 border-b border-gray-100 dark:border-slate-800 cursor-pointer transition ${isGroupActive ? 'bg-blue-600 text-white font-bold' : 'hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-800 dark:text-gray-200'}">
                        <div class="flex items-center gap-2 text-xs truncate">
                            <span>🌍</span>
                            <span class="truncate">Grup Keluarga</span>
                        </div>
                    </div>
                `;
            }

            sidebar.innerHTML = groupChatHtml + userHtml;
        });
    }

    function previewFile(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                base64ImageToSend = e.target.result;
                document.getElementById('image-preview').src = base64ImageToSend;
                document.getElementById('image-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    }

    function batalKirimFoto() {
        base64ImageToSend = '';
        document.getElementById('image-preview-container').classList.add('hidden');
        document.getElementById('chat-file-input').value = '';
    }

    function handleChatInputTyping() {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const typingDocId = activeChatTarget === 'group' ? 'typing_group' : `typing_${[currentUser.uid, activeChatTarget].sort().join('_')}`;
        const typingRef = db.collection("typing").doc(typingDocId);
        
        typingRef.set({
            [currentUser.uid]: { name: document.getElementById('user-display-name')?.innerText || 'User', timestamp: Date.now() }
        }, { merge: true });

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            typingRef.set({
                [currentUser.uid]: firebase.firestore.FieldValue.delete()
            }, { merge: true });
        }, 2500);
    }

    function listenTypingIndicator() {
        if (unsubscribeTyping) unsubscribeTyping();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const typingDocId = activeChatTarget === 'group' ? 'typing_group' : `typing_${[currentUser.uid, activeChatTarget].sort().join('_')}`;
        
        unsubscribeTyping = db.collection("typing").doc(typingDocId).onSnapshot((doc) => {
            const indicator = document.getElementById('typing-indicator');
            if (!doc.exists || !indicator) {
                if(indicator) indicator.classList.add('hidden');
                return;
            }
            const data = doc.data();
            let typingNames = [];
            const now = Date.now();
            for (let uid in data) {
                if (uid === currentUser.uid) continue;
                if (now - data[uid].timestamp < 3500) {
                    typingNames.push(data[uid].name);
                }
            }
            if (typingNames.length > 0) {
                indicator.innerText = `${typingNames.join(', ')} lagi ngetik...`;
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        });
    }

    function kirimPesanChat() {
        const inputEl = document.getElementById('chat-input');
        const pesan = inputEl.value.trim();
        if (!pesan && !base64ImageToSend) return;

        const currentUser = auth.currentUser;
        const senderEmail = currentUser ? currentUser.email : "Anonim";
        const senderName = document.getElementById('user-display-name')?.innerText || senderEmail.split('@')[0];

        if (activeChatTarget === 'group') {
            db.collection("chats").add({
                sender: senderName,
                email: senderEmail,
                senderId: currentUser.uid,
                text: pesan,
                imageUrl: base64ImageToSend || '',
                seenBy: [currentUser.uid],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                inputEl.value = '';
                batalKirimFoto();
            }).catch(e => alert("Gagal mengirim pesan: " + e.message));
        } else {
            const chatId = [currentUser.uid, activeChatTarget].sort().join('_');
            db.collection("private_chats").add({
                chatId: chatId,
                senderId: currentUser.uid,
                senderName: senderName,
                senderEmail: senderEmail,
                recipientId: activeChatTarget,
                text: pesan,
                imageUrl: base64ImageToSend || '',
                seen: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                inputEl.value = '';
                batalKirimFoto();
            }).catch(e => alert("Gagal mengirim pesan: " + e.message));
        }
    }

    function handleChatKeyPress(event) {
        if (event.key === 'Enter') kirimPesanChat();
    }

    function editPesanChat(id, teksLama, isPrivate = false) {
        const teksBaru = prompt("Edit pesan Anda:", teksLama);
        if (teksBaru !== null && teksBaru.trim() !== "") {
            const colName = isPrivate ? "private_chats" : "chats";
            db.collection(colName).doc(id).update({
                text: teksBaru.trim(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(e => alert("Gagal mengedit pesan: " + e.message));
        }
    }

    function hapusPesanChat(id, isPrivate = false) {
        if (confirm("Hapus pesan ini?")) {
            const colName = isPrivate ? "private_chats" : "chats";
            db.collection(colName).doc(id).delete().catch(e => alert("Gagal menghapus pesan: " + e.message));
        }
    }

    function hapusChatAktif() {
        if (!confirm(activeChatTarget === 'group' ? "Hapus semua pesan di Grup Keluarga?" : "Hapus semua riwayat pesan di chat privat ini?")) return;
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        if (activeChatTarget === 'group') {
            db.collection("chats").get().then((snapshot) => {
                const batch = db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                return batch.commit();
            }).then(() => {
                alert("Semua pesan grup berhasil dihapus!");
            }).catch(e => alert("Gagal menghapus chat: " + e.message));
        } else {
            const chatId = [currentUser.uid, activeChatTarget].sort().join('_');
            db.collection("private_chats").where("chatId", "==", chatId).get().then((snapshot) => {
                const batch = db.batch();
                snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                return batch.commit();
            }).then(() => {
                alert("Semua pesan privat berhasil dihapus!");
            }).catch(e => alert("Gagal menghapus chat: " + e.message));
        }
    }

    function muatDataChat() {
        if (unsubscribeChat) unsubscribeChat();
        listenTypingIndicator();

        const currentUser = auth.currentUser;
        if (!currentUser) return;

        if (currentUserJenisAkun === 'Penghutang' && activeChatTarget === 'group') {
            db.collection("users").where("jenisAkun", "in", ["Ayah", "Bunda"]).limit(1).get().then(snap => {
                if (!snap.empty) {
                    activeChatTarget = snap.docs[0].id;
                    activeChatName = "Chat dengan " + snap.docs[0].data().nama;
                    document.getElementById('chat-header-title').innerText = activeChatName;
                    muatDataChat();
                }
            });
            return;
        }

        const container = document.getElementById('chat-container');
        if (!container) return;
        container.innerHTML = '<p class="text-center text-xs text-gray-400 animate-pulse">Memuat percakapan...</p>';

        if (activeChatTarget === 'group') {
            unsubscribeChat = db.collection("chats").onSnapshot((snapshot) => {
                container.innerHTML = '';
                let messages = [];
                const batchSeen = db.batch();
                let hasUnseen = false;

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    messages.push({ id: doc.id, ...data });

                    if (data.senderId !== currentUser.uid && (!data.seenBy || !data.seenBy.includes(currentUser.uid))) {
                        batchSeen.update(doc.ref, {
                            seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
                        });
                        hasUnseen = true;
                    }
                });

                if (hasUnseen) {
                    batchSeen.commit().catch(() => {});
                }
                
                messages.sort((a, b) => {
                    const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                    const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                    return tA - tB;
                });

                let count = 0;
                messages.forEach((data) => {
                    count++;
                    const docId = data.id;
                    const isMe = (data.senderId && data.senderId === currentUser.uid) || (data.email && data.email === currentUser.email);
                    const align = isMe ? 'ml-auto bg-blue-600 text-white' : 'mr-auto bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-gray-100';
                    const timeStr = data.createdAt ? formatWaktu(data.createdAt) : 'Baru saja';
                    const imageTag = data.imageUrl ? `<img src="${data.imageUrl}" class="h-32 object-cover rounded-xl mt-2 cursor-pointer border border-slate-600 shadow" onclick="bukaModalGambarBesar(this.src)">` : '';

                    let statusBadge = '';
                    if (isMe) {
                        if (!data.createdAt) {
                            statusBadge = `<span class="inline-block px-1.5 py-0.5 rounded bg-yellow-500/30 text-yellow-200 text-[10px] font-bold ml-1">⏳ Mengirim</span>`;
                        } else if (data.seenBy && data.seenBy.length > 1) {
                            statusBadge = `<span class="inline-block px-1.5 py-0.5 rounded bg-green-500/30 text-green-200 text-[10px] font-bold ml-1">✓✓ Dilihat</span>`;
                        } else {
                            statusBadge = `<span class="inline-block px-1.5 py-0.5 rounded bg-black/20 text-gray-200 text-[10px] font-bold ml-1">✓ Terkirim</span>`;
                        }
                    }

                    let actionMenu = '';
                    if (isMe) {
                        const safeText = (data.text || '').replace(/'/g, "\\'");
                        actionMenu = `
                            <div class="flex gap-2 text-[10px] mt-1 opacity-70">
                                <span class="underline cursor-pointer hover:opacity-100" onclick="editPesanChat('${docId}', '${safeText}', false)">Edit</span>
                                <span class="underline cursor-pointer hover:opacity-100" onclick="hapusPesanChat('${docId}', false)">Hapus</span>
                            </div>
                        `;
                    }

                    container.innerHTML += `
                        <div class="max-w-[80%] p-3.5 rounded-2xl ${align} shadow-sm text-xs relative">
                            <p class="font-bold text-[10px] opacity-80 mb-0.5">${data.sender || 'User'}</p>
                            <p class="break-words leading-relaxed">${data.text || ''}</p>
                            ${imageTag}
                            <div class="flex items-center justify-end gap-1 text-[9px] opacity-90 text-right mt-1">
                                <span>${timeStr}</span>
                                ${statusBadge}
                            </div>
                            ${actionMenu}
                        </div>
                    `;
                });

                if (count === 0) {
                    container.innerHTML = `<p class="text-center text-xs text-gray-400 py-6">Belum ada pesan di grup.</p>`;
                }

                if (initialLoadComplete && count > lastMessageCount) {
                    playNotificationSound();
                    const lastMsg = messages[messages.length - 1];
                    if (lastMsg && lastMsg.email !== currentUser.email) {
                        showChatToast(lastMsg.sender, lastMsg.text);
                    }
                }
                lastMessageCount = count;
                initialLoadComplete = true;
                container.scrollTop = container.scrollHeight;
            });
        } else {
            const chatId = [currentUser.uid, activeChatTarget].sort().join('_');
            unsubscribeChat = db.collection("private_chats").where("chatId", "==", chatId).onSnapshot((snapshot) => {
                container.innerHTML = '';
                let messages = [];
                const batchSeen = db.batch();
                let hasUnseen = false;

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    messages.push({ id: doc.id, ...data });

                    if (data.recipientId === currentUser.uid && !data.seen) {
                        batchSeen.update(doc.ref, { seen: true });
                        hasUnseen = true;
                    }
                });

                if (hasUnseen) {
                    batchSeen.commit().catch(() => {});
                }

                messages.sort((a, b) => {
                    const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                    const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                    return tA - tB;
                });

                let count = 0;
                messages.forEach((data) => {
                    count++;
                    const docId = data.id;
                    const isMe = (data.senderId && data.senderId === currentUser.uid) || (data.senderEmail && data.senderEmail === currentUser.email);
                    const align = isMe ? 'ml-auto bg-blue-600 text-white' : 'mr-auto bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-gray-100';
                    const timeStr = data.createdAt ? formatWaktu(data.createdAt) : 'Baru saja';
                    const imageTag = data.imageUrl ? `<img src="${data.imageUrl}" class="h-32 object-cover rounded-xl mt-2 cursor-pointer border border-slate-600 shadow" onclick="bukaModalGambarBesar(this.src)">` : '';

                    let statusBadge = '';
                    if (isMe) {
                        if (!data.createdAt) {
                            statusBadge = `<span class="inline-block px-1.5 py-0.5 rounded bg-yellow-500/30 text-yellow-200 text-[10px] font-bold ml-1">⏳ Mengirim</span>`;
                        } else if (data.seen) {
                            statusBadge = `<span class="inline-block px-1.5 py-0.5 rounded bg-green-500/30 text-green-200 text-[10px] font-bold ml-1">✓✓ Dilihat</span>`;
                        } else {
                            statusBadge = `<span class="inline-block px-1.5 py-0.5 rounded bg-black/20 text-gray-200 text-[10px] font-bold ml-1">✓ Terkirim</span>`;
                        }
                    }

                    let actionMenu = '';
                    if (isMe) {
                        const safeText = (data.text || '').replace(/'/g, "\\'");
                        actionMenu = `
                            <div class="flex gap-2 text-[10px] mt-1 opacity-70">
                                <span class="underline cursor-pointer hover:opacity-100" onclick="editPesanChat('${docId}', '${safeText}', true)">Edit</span>
                                <span class="underline cursor-pointer hover:opacity-100" onclick="hapusPesanChat('${docId}', true)">Hapus</span>
                            </div>
                        `;
                    }

                    container.innerHTML += `
                        <div class="max-w-[80%] p-3.5 rounded-2xl ${align} shadow-sm text-xs relative">
                            <p class="font-bold text-[10px] opacity-80 mb-0.5">${data.senderName || 'User'}</p>
                            <p class="break-words leading-relaxed">${data.text || ''}</p>
                            ${imageTag}
                            <div class="flex items-center justify-end gap-1 text-[9px] opacity-90 text-right mt-1">
                                <span>${timeStr}</span>
                                ${statusBadge}
                            </div>
                            ${actionMenu}
                        </div>
                    `;
                });

                if (count === 0) {
                    container.innerHTML = `<p class="text-center text-xs text-gray-400 py-6">Belum ada riwayat pesan privat.</p>`;
                }

                if (initialLoadComplete && count > lastMessageCount) {
                    playNotificationSound();
                    const lastMsg = messages[messages.length - 1];
                    if (lastMsg && lastMsg.senderId !== currentUser.uid) {
                        showChatToast(lastMsg.senderName, lastMsg.text);
                    }
                }
                lastMessageCount = count;
                initialLoadComplete = true;
                container.scrollTop = container.scrollHeight;
            });
        }
    }