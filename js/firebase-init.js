import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZbl3lQ071AdtHMN2l2SW-wYWVBWj_RTI",
  authDomain: "tutorial-55cc6.firebaseapp.com",
  projectId: "tutorial-55cc6",
  storageBucket: "tutorial-55cc6.firebasestorage.app",
  messagingSenderId: "630184412788",
  appId: "1:630184412788:web:28140c1f5cee423fd2b321"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.fbAuth = auth;
window.fbDb = db;
window.fbSignOut = signOut;
window.fbCreateUser = createUserWithEmailAndPassword;
window.fbSignIn = signInWithEmailAndPassword;
window.fbDoc = doc;
window.fbGetDoc = getDoc;
window.fbSetDoc = setDoc;
window.fbUpdateDoc = updateDoc;
window.fbCollection = collection;
window.fbGetDocs = getDocs;

// Route Guards
const currentPath = window.location.pathname.split('/').pop() || 'index.html';
const publicPages = ['login.html', 'forms.html', 'register.html']; // forms.html is free and open

// Optional: Track visits for index.html globally
if (currentPath === 'index.html' && !sessionStorage.getItem('visited')) {
  sessionStorage.setItem('visited', 'true');
  const statsRef = doc(db, 'statistics', 'global');
  updateDoc(statsRef, { visits: increment(1) }).catch(err => {
    // If stats document doesn't exist, create it
    if (err.code === 'not-found') {
      setDoc(statsRef, { visits: 1 });
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        const isAdminUser = user.email === '2018sohadi@gmail.com';
        await setDoc(userDocRef, {
          name: user.displayName || (isAdminUser ? 'المدير' : 'مستخدم جديد'),
          email: user.email,
          status: isAdminUser ? 'approved' : 'pending',
          role: isAdminUser ? 'admin' : 'user',
          joined_at: new Date().toISOString(),
          subscription_expiry: null
        });
      }
    } catch (err) {
      console.error("Error auto-creating user doc", err);
    }
  }

  // Update Navbar based on Auth State
  const navActions = document.querySelector('.nav-actions');
  if (navActions) {
    if (user) {
      const adminHtml = user.email === '2018sohadi@gmail.com' ? '<a href="admin.html" class="nav-login-btn" style="margin-left: 10px;" title="لوحة التحكم"><i class="fa-solid fa-gauge"></i></a>' : '';
      navActions.innerHTML = adminHtml + `
        <a href="javascript:void(0)" onclick="window.fbSignOut(window.fbAuth).then(() => window.location.href='index.html')" class="nav-login-btn" title="تسجيل الخروج">
          <i class="fa-solid fa-right-from-bracket"></i>
        </a>
      `;
    } else {
      navActions.innerHTML = `
        <a href="login.html" class="nav-login-btn" title="تسجيل الدخول">
          <i class="fa-regular fa-user"></i>
        </a>
      `;
    }
  }

  if (publicPages.includes(currentPath)) {
    if (currentPath === 'login.html' && user) {
      window.location.href = 'index.html';
    }
    return;
  }

  const servicePages = ['chat.html', 'browse.html', 'court-finder.html', 'deadlines.html', 'classify.html', 'compare.html', 'memo.html', 'quiz.html', 'glossary.html'];

  if (servicePages.includes(currentPath)) {
    if (!user) {
      alert('يجب تسجيل الدخول لاستخدام هذه الخدمة');
      window.location.href = 'login.html';
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        alert('حسابك غير مفعل بالنظام  يرجى التواصل مع الإدارة.');
        window.location.href = 'index.html';
        return;
      }

      const userData = userDoc.data();
      const adminEmail = "2018sohadi@gmail.com";

      if (user.email === adminEmail || userData.role === 'admin') {
        return; // Admin gets full access
      }

      if (userData.status !== 'approved') {
        document.body.innerHTML = `
          <div style="display:flex; height:100vh; align-items:center; justify-content:center; text-align:center; padding: 20px; background:var(--navy-900); color:var(--white); font-family:var(--font-family);">
            <div>
              <i class="fa-solid fa-hourglass-half" style="font-size:4rem; color:var(--gold-400); margin-bottom:20px;"></i>
              <h2 style="color:var(--gold-400); margin-bottom:10px;">حسابك قيد المراجعة</h2>
              <p style="color:var(--white-70); max-width:400px; line-height:1.8;">نحن نقوم بمراجعة حسابك حالياً. لا يمكنك استخدام الخدمات حتى يتم تفعيل حسابك من قبل الإدارة.</p>
              <br><br>
              <button onclick="window.fbSignOut(window.fbAuth).then(() => window.location.href='index.html')" class="btn btn-primary">تسجيل الخروج والعودة</button>
            </div>
          </div>
        `;
        return;
      }

      // Check Expiry
      if (userData.subscription_expiry) {
        const expiryDate = new Date(userData.subscription_expiry);
        if (expiryDate < new Date()) {
          document.body.innerHTML = `
            <div style="display:flex; height:100vh; align-items:center; justify-content:center; text-align:center; padding: 20px; background:var(--navy-900); color:var(--white); font-family:var(--font-family);">
              <div>
                <i class="fa-solid fa-circle-exclamation" style="font-size:4rem; color:var(--rose-500); margin-bottom:20px;"></i>
                <h2 style="color:var(--rose-500); margin-bottom:10px;">باقة اشتراكك منتهية</h2>
                <p style="color:var(--white-70); max-width:400px; line-height:1.8;">لقد انتهت فترة اشتراكك في ${expiryDate.toLocaleDateString('ar-SA')}. يرجى التواصل مع الإدارة لتجديد باقتك.</p>
                <br><br>
                <button onclick="window.location.href='index.html'" class="btn btn-primary">العودة للرئيسية</button>
              </div>
            </div>
          `;
          return;
        }
      } else {
        document.body.innerHTML = `
            <div style="display:flex; height:100vh; align-items:center; justify-content:center; text-align:center; padding: 20px; background:var(--navy-900); color:var(--white); font-family:var(--font-family);">
              <div>
                <i class="fa-solid fa-box-open" style="font-size:4rem; color:var(--amber-500); margin-bottom:20px;"></i>
                <h2 style="color:var(--amber-500); margin-bottom:10px;">لا يوجد باقة نشطة</h2>
                <p style="color:var(--white-70); max-width:400px; line-height:1.8;">تم قبول حسابك ولكن لم يتم تخصيص باقة اشتراك لك بعد. يرجى الانتظار أو التواصل مع الإدارة.</p>
                <br><br>
                <button onclick="window.location.href='index.html'" class="btn btn-primary">العودة للرئيسية</button>
              </div>
            </div>
          `;
        return;
      }

    } catch (e) {
      console.error("Error verifying user access:", e);
    }
  }

  if (currentPath === 'admin.html') {
    if (!user || user.email !== '2018sohadi@gmail.com') {
      alert('غير مصرح لك بالدخول لهذه الصفحة');
      window.location.href = 'index.html';
    } else {
      const adminContent = document.getElementById('adminContent');
      if (adminContent) adminContent.style.display = 'block';
      if (typeof window.loadAdminData === 'function') {
        window.loadAdminData();
      }
    }
  }
});
